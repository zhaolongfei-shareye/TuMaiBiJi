"""自建 OCR：RapidOCR（PP-OCR 检测+方向+识别三模型，ONNXRuntime 纯 CPU）。

对外契约保持不变：ocr_image(bytes) -> str / ocr_images(list[bytes]) -> str。
"""
import asyncio
import logging
import re
import threading
import time
from io import BytesIO
from typing import NamedTuple

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# 实测：3420×2214 单张峰值 RSS 1064MB，而 RapidOCR 会把每个检测框按原图比例放大回去
# （process_img.map_img_to_original），所以峰值由输入像素量决定，必须先缩放。
MAX_LONG_EDGE = 1600
MIN_CONFIDENCE = 0.5
# 实测噪声是工具栏图标/角标（"AB X"、"κ7"）：不含中文且字符极少的行一律丢
MAX_SHORT_LATIN_RUN = 4

_CJK = re.compile("[一-鿿㐀-䶿豈-﫿぀-ヿ]")
_MEANINGFUL = re.compile("[一-鿿㐀-䶿豈-﫿぀-ヿA-Za-z0-9]")


class Row(NamedTuple):
    text: str
    score: float
    x_left: float
    y_center: float
    height: float


_engine = None
_engine_lock = threading.Lock()
# RapidOCR.__call__ 会 update_params 改自身状态，非线程安全；串行也为了压住内存峰值
_run_lock = threading.Lock()


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is None:
            try:
                from rapidocr import RapidOCR
            except ImportError as exc:
                raise RuntimeError(
                    "RapidOCR 加载失败。无桌面的 Ubuntu 上多为 opencv 找不到 libGL.so.1，"
                    "需 apt install libgl1，或把 opencv-python 换成 opencv-python-headless。"
                ) from exc
            started = time.perf_counter()
            _engine = RapidOCR()
            logger.info("RapidOCR 模型加载完成 %.2fs", time.perf_counter() - started)
    return _engine


def _prepare(image_data: bytes) -> Image.Image:
    """解码为 PIL 图像并缩放长边。交给 RapidOCR 时保持 RGB/RGBA，由它做 RGB→BGR。"""
    img = Image.open(BytesIO(image_data))
    img = ImageOps.exif_transpose(img) or img
    if img.mode not in ("RGB", "RGBA", "L"):
        # P 模式可能带调色板透明，转 RGBA 才能正确合成背景
        img = img.convert("RGBA" if img.mode == "P" else "RGB")

    width, height = img.size
    long_edge = max(width, height)
    if long_edge > MAX_LONG_EDGE:
        scale = MAX_LONG_EDGE / long_edge
        img = img.resize(
            (max(1, round(width * scale)), max(1, round(height * scale))),
            Image.LANCZOS,
        )
    return img


def _extract_rows(image_data: bytes) -> list[Row]:
    img = _prepare(image_data)
    started = time.perf_counter()
    with _run_lock:
        res = _get_engine()(img)
    elapsed = time.perf_counter() - started

    if not res.txts or res.boxes is None:
        logger.info("OCR 无文字 输入=%dx%d 耗时=%.2fs", img.width, img.height, elapsed)
        return []

    scores = list(res.scores) if res.scores is not None else [0.0] * len(res.txts)
    rows = []
    for box, text, score in zip(res.boxes, res.txts, scores):
        xs = [float(p[0]) for p in box]
        ys = [float(p[1]) for p in box]
        rows.append(
            Row(
                text=str(text),
                score=float(score),
                x_left=min(xs),
                y_center=sum(ys) / len(ys),
                height=max(ys) - min(ys),
            )
        )
    logger.info(
        "OCR 完成 输入=%dx%d 框=%d 耗时=%.2fs", img.width, img.height, len(rows), elapsed
    )
    return rows


def is_noise(row: Row) -> bool:
    """F7 验收第 2 条：单字行全丢（图标被认成"品/稿/像/区"），非中文短行 ≤4 字符也丢。"""
    if row.score < MIN_CONFIDENCE:
        return True
    chars = _MEANINGFUL.findall(row.text.strip())
    if len(chars) <= 1:
        return True
    if not _CJK.search(row.text):
        return len(chars) <= MAX_SHORT_LATIN_RUN
    return len(chars) > 1 and len(set(chars)) == 1


def _same_line(a: Row, b: Row) -> bool:
    gap = abs(a.y_center - b.y_center)
    return gap <= max(a.height, b.height) * 0.7


def _merge(line: list[Row]) -> str:
    """同一行的多个框是彼此独立的文本，用空格隔开，避免粘成假词。"""
    return " ".join(r.text.strip() for r in sorted(line, key=lambda r: r.x_left))


def layout(rows: list[Row]) -> list[str]:
    """RapidOCR 按检测框顺序输出，不是视觉顺序：先按 y 聚行，行内按 x 排。"""
    kept = sorted((r for r in rows if not is_noise(r)), key=lambda r: r.y_center)

    lines: list[list[Row]] = []
    for row in kept:
        if lines and all(_same_line(row, prev) for prev in lines[-1]):
            lines[-1].append(row)
        else:
            lines.append([row])

    return [_merge(line) for line in lines]


async def ocr_image(image_data: bytes) -> str:
    rows = await asyncio.to_thread(_extract_rows, image_data)
    return "\n".join(layout(rows))


async def ocr_images(images_data: list[bytes]) -> str:
    """对多张图片依次 OCR，合并结果。"""
    results = []
    for i, img in enumerate(images_data):
        text = await ocr_image(img)
        if text.strip():
            results.append(f"--- 第{i + 1}页 ---\n{text}")
    return "\n\n".join(results)
