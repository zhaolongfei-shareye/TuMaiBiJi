"""F7 自建 OCR 的落地断言：缩放、串行、排序、降噪、批次上限（含每用户批次数与全局预算）、坏图给出中文字段、失败态。

不连真实模型、不依赖 Redis，可反复执行。

    cd backend && .venv/bin/python -m pytest tests/ -v
"""
import asyncio
import io
import os
import sys
import time
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tumaibiji_pytest.db")
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
            asyncio.run(self._stage(b"x" * 2048))
        assert exc.value.status_code == 400

    def test_over_batch_count_rejected(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setattr(ingest_route, "MAX_IMAGES_PER_BATCH", 2)
        staged = asyncio.run(self._stage(b"ab"))
        staged = asyncio.run(self._stage(b"cd", staged["batch_id"]))
        assert staged["count"] == 2
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(b"ef", staged["batch_id"]))
        assert exc.value.status_code == 400 and "每批次最多 2 张图片" in exc.value.detail

    def test_over_batch_total_bytes_rejected(self, monkeypatch):
        from fastapi import HTTPException

        monkeypatch.setattr(ingest_route, "MAX_BATCH_BYTES", 10)
        staged = asyncio.run(self._stage(b"12345"))
        assert staged["count"] == 1
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(b"678901", staged["batch_id"]))
        assert exc.value.status_code == 400 and "分多次" in exc.value.detail

    def test_per_user_batch_count_capped(self, monkeypatch):
        """不传 batch_id 就是新建批次：只卡"单批 40MB"挡不住半小时里堆出几百批。"""
        monkeypatch.setattr(ingest_route, "MAX_BATCHES_PER_USER", 2)
        first = asyncio.run(self._stage(b"aa"))["batch_id"]
        second = asyncio.run(self._stage(b"bb"))["batch_id"]
        third = asyncio.run(self._stage(b"cc"))
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
        asyncio.run(self._stage(b"12345"))
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._stage(b"67890"))
        assert exc.value.status_code == 429 and "服务器暂存已满" in exc.value.detail
        assert "other-user" in ingest_route._batch_staging


class TestUnreadableImage:
    """认不出的字节要说人话：这些串会经 str(e) 进任务 failed.error 直接给用户看。"""

    def _expect_chinese(self, data):
        with pytest.raises(RuntimeError) as exc:
            asyncio.run(ocr.ocr_image(data))
        msg = str(exc.value)
        assert "Error" not in msg and "Traceback" not in msg
        return msg

    def test_unidentified_bytes_mention_heic_and_fix(self, engine_spy):
        engine_spy(FakeEngine())
        heic_like = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 200
        msg = self._expect_chinese(heic_like)
        assert "无法识别" in msg and "HEIC" in msg and "兼容性最佳" in msg

    def test_truncated_png_fails_before_engine(self, engine_spy):
        fake = engine_spy(FakeEngine())
        raw = png(300, 200)
        msg = self._expect_chinese(raw[: len(raw) // 2])
        assert "损坏" in msg
        assert fake.seen == []

    def test_valid_image_still_passes(self, engine_spy):
        engine_spy(FakeEngine(out(["正常的图"], [box(0, 0)], [0.9])))
        assert asyncio.run(ocr.ocr_image(png(300, 200))) == "正常的图"


class TestFailureState:
    @pytest.fixture
    def db(self):
        Base.metadata.create_all(bind=engine)
        session = SessionLocal()
        yield session
        session.close()

    def test_ocr_exception_fails_task_without_hanging(self, db, monkeypatch):
        import app.tasks.ingest_tasks as tasks

        statuses = []
        monkeypatch.setattr(tasks, "set_task_status", lambda tid, st, res=None, **kw: statuses.append((st, res)))
        monkeypatch.setattr(tasks, "ocr_images", _raise_libgl)

        uid = "ocr-failure-user"
        tasks.process_screenshots_task("t-libgl", uid, [b"fake-png"])

        assert [s for s, _ in statuses] == ["processing", "failed"]
        assert "libGL.so.1" in statuses[-1][1]["error"]
        assert db.query(Note).filter(Note.user_id == uid).count() == 0


async def _raise_libgl(images_data):
    raise RuntimeError("RapidOCR 加载失败：import cv2 缺 libGL.so.1")
