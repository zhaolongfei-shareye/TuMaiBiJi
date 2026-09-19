"""F7 自建 OCR 的落地断言：缩放、串行、排序、降噪、批次上限（含每用户批次数与全局预算）、坏图给出中文字段、失败态。

不连真实模型、不依赖 Redis，可反复执行。

    cd backend && .venv/bin/python -m pytest tests/ -v
"""
import asyncio
import io
import os
import struct
import sys
import time
import zlib
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tumaibiji_pytest.db")
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
import pytest
from PIL import Image

from app.api.routes import ingest as ingest_route
from app.db.database import Base, SessionLocal, engine
from app.models.note import Note
from app.models.user import User
from app.services import ocr


def png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buf, format="PNG")
    return buf.getvalue()


def png_header_only(width: int, height: int) -> bytes:
    """只有 IHDR、没有任何像素数据的 PNG：几十字节，用来证明拦截发生在解码之前。

    真实攻击样本是纯色大图（实测 0.43MB / 1.44 亿像素 / 峰值 RSS 1271MB），但那种文件
    要在测试里真造出来得先分配几百 MB，没必要——宽高是 Pillow 从文件头读的，走的是同一条路。
    """

    def chunk(kind: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body))
            + kind
            + body
            + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IEND", b"")


def box(x_left: float, y_top: float, w: float = 200, h: float = 30):
    return [[x_left, y_top], [x_left + w, y_top], [x_left + w, y_top + h], [x_left, y_top + h]]


def row(text, score, x, y, h=30.0):
    return ocr.Row(text=text, score=score, x_left=x, y_center=y + h / 2, height=h)


def out(txts=(), boxes=(), scores=()):
    return SimpleNamespace(txts=list(txts), boxes=list(boxes), scores=list(scores))


class FakeEngine:
    """替掉真实模型：记录每次收到的图像，并可检测是否被并发进入。"""

    def __init__(self, result=None, block=0.0):
        self.seen = []
        self.inside = 0
        self.max_inside = 0
        self.result = result or out()
        self.block = block

    def __call__(self, img):
        self.inside += 1
        self.max_inside = max(self.max_inside, self.inside)
        try:
            self.seen.append(img)
            if self.block:
                time.sleep(self.block)
            return self.result
        finally:
            self.inside -= 1


@pytest.fixture
def engine_spy(monkeypatch):
    def _install(fake):
        monkeypatch.setattr(ocr, "_get_engine", lambda: fake)
        return fake

    return _install


class TestScaleBeforeInference:
    def test_long_edge_capped(self, engine_spy):
        fake = engine_spy(FakeEngine())
        asyncio.run(ocr.ocr_image(png(3420, 2214)))
        assert max(fake.seen[0].size) <= ocr.MAX_LONG_EDGE

    def test_small_image_untouched(self, engine_spy):
        fake = engine_spy(FakeEngine())
        asyncio.run(ocr.ocr_image(png(800, 600)))
        assert fake.seen[0].size == (800, 600)

    def test_handover_is_pil_rgb_family(self, engine_spy):
        """ndarray 会被 RapidOCR 当成 BGR，只有 PIL/bytes 入口才做 RGB→BGR。"""
        fake = engine_spy(FakeEngine())
        asyncio.run(ocr.ocr_image(png(1200, 900)))
        assert isinstance(fake.seen[0], Image.Image)
        assert fake.seen[0].mode in ("RGB", "RGBA", "L")

    def test_pixel_count_rejected_before_decode(self, engine_spy):
        """10MB 上限管得住字节管不住像素：49M 像素的图必须在解码前拒掉，引擎一次都不进。"""
        fake = engine_spy(FakeEngine())
        with pytest.raises(RuntimeError) as exc:
            asyncio.run(ocr.ocr_image(png_header_only(7000, 7000)))
        assert str(exc.value) == ocr.TOO_MANY_PIXELS_HINT
        assert fake.seen == []

    def test_hint_survives_as_user_visible_toast(self):
        """这句是直接弹给用户的 toast：icon:'none' 只有两行（约 30 个汉字）。"""
        assert len(ocr.TOO_MANY_PIXELS_HINT) <= 30
        assert "像素" in ocr.TOO_MANY_PIXELS_HINT

    def test_real_screenshot_sizes_still_pass(self, engine_spy):
        """闸门不能挡住真机截图：3420×2214 是实测值，留到 40M 像素才有几十倍余量。"""
        fake = engine_spy(FakeEngine())
        asyncio.run(ocr.ocr_image(png(3420, 2214)))
        assert len(fake.seen) == 1


class TestOrderAndNoise:
    def test_output_follows_y_then_x(self):
        """检测框顺序是乱的（实测缺陷），输出必须按阅读顺序。"""
        rows = [
            row("第二行右侧", 0.9, 700, 60),
            row("第一行左侧", 0.9, 40, 20),
            row("第三行", 0.9, 40, 100),
            row("第一行右侧", 0.9, 300, 22),
        ]
        assert ocr.layout(rows) == ["第一行左侧 第一行右侧", "第二行右侧", "第三行"]

    def test_noise_rows_dropped(self):
        """实测把图标认成了 κ7 / 业业业 / 曰 / ··· / AB X，单字行一律不进正文。"""
        rows = [
            row("κ7", 0.9, 0, 0),
            row("业业业", 0.9, 0, 40),
            row("曰", 0.42, 0, 80),
            row("···", 0.9, 0, 120),
            row("真正的正文行", 0.9, 0, 160),
            row("AB X", 0.9, 0, 200),
            row("品", 0.98, 0, 240),
        ]
        lines = ocr.layout(rows)
        assert lines == ["真正的正文行"]
        assert all(len(line.strip()) > 1 for line in lines)

    def test_legitimate_digits_and_mixed_lines_survive(self):
        rows = [row("第3页，共16页 5058个字", 0.9, 0, 0), row("简体中文(中国大陆)", 0.86, 0, 40)]
        assert len(ocr.layout(rows)) == 2


class TestSerialExecution:
    def test_engine_never_runs_concurrently(self, engine_spy):
        fake = engine_spy(FakeEngine(block=0.05))

        async def fan_out():
            return await asyncio.gather(*[ocr.ocr_image(png(300, 200)) for _ in range(5)])

        results = asyncio.run(fan_out())
        assert len(results) == 5
        assert fake.max_inside == 1

    def test_multi_page_order_and_labels(self, engine_spy):
        fake = engine_spy(
            FakeEngine(out(["甲页文字"], [box(0, 0)], [0.9])),
        )
        text = asyncio.run(ocr.ocr_images([png(300, 200)] * 3))
        assert text.count("--- 第1页 ---") == text.count("--- 第3页 ---") == 1
        assert len(fake.seen) == 3


class TestPageMarkers:
    """R17：单张截图的正文首行曾是我们的分页标记，而降级标题取的就是首行。"""

    def test_single_image_has_no_page_marker(self, engine_spy):
        engine_spy(FakeEngine(out(["产品周会纪要"], [box(0, 0)], [0.9])))
        text = asyncio.run(ocr.ocr_images([png(300, 200)]))
        assert text == "产品周会纪要"
        assert "--- 第" not in text

    def test_blank_pages_do_not_create_a_second_page(self, monkeypatch):
        async def one_page_of_text(data):
            return "只有这一页认出了字" if data == b"a" else ""

        monkeypatch.setattr(ocr, "ocr_image", one_page_of_text)
        assert asyncio.run(ocr.ocr_images([b"a", b"b", b"c"])) == "只有这一页认出了字"

    def test_two_recognized_pages_are_labeled(self, monkeypatch):
        pages = {b"a": "第一页正文", b"b": "第二页正文"}

        async def two_pages(data):
            return pages[data]

        monkeypatch.setattr(ocr, "ocr_image", two_pages)
        assert asyncio.run(ocr.ocr_images([b"a", b"b"])) == (
            "--- 第1页 ---\n第一页正文\n\n--- 第2页 ---\n第二页正文"
        )


class TestTitleHint:
    def test_skips_our_own_page_marker(self):
        assert ocr.title_hint("--- 第1页 ---\n产品周会纪要\n其余正文") == "产品周会纪要"

    def test_marker_only_input_gives_no_hint(self):
        assert ocr.title_hint("--- 第1页 ---") == ""

    def test_capped_at_the_degraded_title_length(self):
        assert len(ocr.title_hint("开" * 40)) == 30


class TestBatchLimits:
    @pytest.fixture(autouse=True)
    def clear_staging(self):
        ingest_route._batch_staging.clear()
        yield
        ingest_route._batch_staging.clear()

    def test_locked_values(self):
        assert ingest_route.MAX_IMAGES_PER_BATCH == 10
        assert ingest_route.MAX_IMAGE_BYTES == 10 * 1024 * 1024
        assert ingest_route.MAX_BATCH_BYTES == 40 * 1024 * 1024
        assert ingest_route.BATCH_TTL_SECONDS == 1800
        assert ingest_route.MAX_BATCHES_PER_USER == 2
        assert ingest_route.MAX_STAGING_BYTES == 120 * 1024 * 1024

    class Upload:
        def __init__(self, data):
            self.data, self.pos = data, 0

        async def read(self, n=-1):
            chunk = self.data[self.pos : self.pos + n]
            self.pos += len(chunk)
            return chunk

    class User_:
        id = 4242

    @staticmethod
    def jpg(n: int) -> bytes:
        """带 JPEG 文件头的假字节：过格式闸门，但内容是假的——这些用例只卡长度和数量。"""
        return b"\xff\xd8\xff" + b"z" * (n - 3)

    async def _stage(self, data, batch_id=None):
        return await ingest_route.stage_screenshot.__wrapped__(
            request=None,
            images=self.Upload(data),
            batch_id=batch_id,
            user=self.User_(),
        )

    def test_over_image_size_rejected(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setattr(ingest_route, "MAX_IMAGE_BYTES", 1024)
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(self.jpg(2048)))
        assert exc.value.status_code == 400 and "图片超过" in exc.value.detail

    def test_unsupported_format_rejected_before_staging(self):
        """HEIC 当场拒，不塞进 Redis 等 worker 解码时才失败——用户看到的还是英文栈。"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200))
        assert exc.value.status_code == 400 and "不支持" in exc.value.detail
        assert "JPG" in exc.value.detail
        assert len(exc.value.detail) <= 30  # toast 只容得下两行，长了会被截断
        assert ingest_route._batch_staging == {}

    def test_over_batch_count_rejected(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setattr(ingest_route, "MAX_IMAGES_PER_BATCH", 2)
        staged = asyncio.run(self._stage(self.jpg(5)))
        staged = asyncio.run(self._stage(self.jpg(5), staged["batch_id"]))
        assert staged["count"] == 2
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(self.jpg(5), staged["batch_id"]))
        assert exc.value.status_code == 400 and "每批次最多 2 张图片" in exc.value.detail

    def test_over_batch_total_bytes_rejected(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setattr(ingest_route, "MAX_BATCH_BYTES", 10)
        staged = asyncio.run(self._stage(self.jpg(5)))
        assert staged["count"] == 1
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(self.jpg(6), staged["batch_id"]))
        assert exc.value.status_code == 400 and "分多次" in exc.value.detail

    def test_per_user_batch_count_capped(self, monkeypatch):
        """不传 batch_id 就是新建批次：只卡"单批 40MB"挡不住半小时里堆出几百批。"""
        monkeypatch.setattr(ingest_route, "MAX_BATCHES_PER_USER", 2)
        first = asyncio.run(self._stage(self.jpg(5)))["batch_id"]
        second = asyncio.run(self._stage(self.jpg(5)))["batch_id"]
        third = asyncio.run(self._stage(self.jpg(5)))
        assert first not in ingest_route._batch_staging
        assert set(ingest_route._batch_staging) == {second, third["batch_id"]}
        assert third["count"] == 1

    def test_global_staging_budget_rejects_without_touching_others(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setattr(ingest_route, "MAX_BATCHES_PER_USER", 99)
        monkeypatch.setattr(ingest_route, "MAX_STAGING_BYTES", 10)
        ingest_route._batch_staging["other-user"] = {
            "data": [b"xxx"],
            "bytes": 3,
            "user_id": "9999",
            "created_at": time.time(),
        }
        asyncio.run(self._stage(self.jpg(5)))
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(self.jpg(5)))
        assert exc.value.status_code == 429 and "服务器暂存已满" in exc.value.detail
        assert "other-user" in ingest_route._batch_staging


class TestUnreadableImage:
    """认不出的字节要说人话：这些串会经任务 failed.error 进 toast（只两行，约 30 汉字）。"""

    def _expect_chinese(self, data):
        with pytest.raises(RuntimeError) as exc:
            asyncio.run(ocr.ocr_image(data))
        msg = str(exc.value)
        assert "Error" not in msg and "Traceback" not in msg
        return msg

    def test_unidentified_bytes_say_unsupported_format(self, engine_spy):
        engine_spy(FakeEngine())
        heic_like = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200
        msg = self._expect_chinese(heic_like)
        assert "无法识别" in msg
        # 格式建议写在入口卡片的小字里（albumDesc），toast 放不下第二句
        assert len(msg) <= 30

    def test_truncated_png_fails_before_engine(self, engine_spy):
        fake = engine_spy(FakeEngine())
        raw = png(300, 200)
        msg = self._expect_chinese(raw[: len(raw) // 2])
        assert "损坏" in msg
        assert fake.seen == []

    def test_valid_image_still_passes(self, engine_spy):
        engine_spy(FakeEngine(out(["正常的图"], [box(0, 0)], [0.9])))
        assert asyncio.run(ocr.ocr_image(png(300, 200))) == "正常的图"

    def test_engine_load_failure_keeps_ops_detail_in_log(self, monkeypatch, caplog):
        """libGL 那句是运维线索，不能跟着 toast 出去；日志里必须还在。"""
        monkeypatch.setattr(ocr, "_engine", None)
        monkeypatch.setitem(sys.modules, "rapidocr", None)
        caplog.set_level("ERROR")

        with pytest.raises(ocr.UserError) as exc:
            ocr._get_engine()

        assert "libGL" not in str(exc.value) and "opencv" not in str(exc.value)
        assert "图片识别暂不可用" in str(exc.value)
        assert "libGL.so.1" in caplog.text


class TestFailureState:
    @pytest.fixture
    def db(self):
        Base.metadata.create_all(bind=engine)
        session = SessionLocal()
        yield session
        session.close()

    def _run(self, db, monkeypatch, raiser, task_id="t-failure", uid="ocr-failure-user"):
        import app.tasks.ingest_tasks as tasks

        statuses = []
        monkeypatch.setattr(tasks, "set_task_status", lambda tid, st, res=None, **kw: statuses.append((st, res)))
        monkeypatch.setattr(tasks, "ocr_images", raiser)
        tasks.process_screenshots_task(task_id, uid, [b"fake-png"])
        return statuses, tasks

    def test_ocr_exception_fails_task_without_hanging(self, db, monkeypatch):
        statuses, _ = self._run(db, monkeypatch, _raise_engine_unavailable)
        assert [s for s, _ in statuses] == ["processing", "failed"]
        assert statuses[-1][1]["error"] == ocr.TOO_MANY_PIXELS_HINT
        assert db.query(Note).filter(Note.user_id == "ocr-failure-user").count() == 0

    def test_unexpected_error_is_generic_and_logged(self, db, monkeypatch, caplog):
        """英文栈/onnxruntime/依赖名一律不给用户，原文留日志。"""
        caplog.set_level("ERROR")
        statuses, tasks = self._run(
            db, monkeypatch, _raise_english_crash, task_id="t-english", uid="english-failure-user"
        )
        error = statuses[-1][1]["error"]

        assert error == tasks.GENERIC_TASK_ERROR
        assert "onnxruntime" not in error and "Session" not in error
        assert "onnxruntime" in caplog.text
        assert len(error) <= 30

    def test_url_task_unexpected_error_is_generic(self, db, monkeypatch):
        """URL 链路同一个收口：抓取侧没标 UserError 的异常一律通用中文。"""
        import app.tasks.ingest_tasks as tasks

        statuses = []
        monkeypatch.setattr(tasks, "set_task_status", lambda tid, st, res=None, **kw: statuses.append((st, res)))
        monkeypatch.setattr(tasks, "scrape_url", _raise_connect_error)
        tasks.process_url_task("t-connect", "url-failure-user", "https://example.com/x")

        assert statuses[-1][0] == "failed"
        assert statuses[-1][1]["error"] == tasks.GENERIC_TASK_ERROR
        assert "Connection refused" not in statuses[-1][1]["error"]


async def _raise_engine_unavailable(images_data):
    raise ocr.UserError(ocr.TOO_MANY_PIXELS_HINT)


async def _raise_english_crash(images_data):
    raise RuntimeError("onnxruntime.capi.onnxruntime_pybind11_state.Fail: [ONNXRuntimeError] : 1 : FAIL")


async def _raise_connect_error(url):
    raise httpx.ConnectError("Connection refused")
