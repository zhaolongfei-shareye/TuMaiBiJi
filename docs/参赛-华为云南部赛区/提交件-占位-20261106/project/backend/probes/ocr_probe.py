"""OCR 选型探针：量模型加载耗时、常驻内存、单张识别耗时与峰值 RSS。

用法：python probes/ocr_probe.py <图片路径> [<图片路径> ...]
PRD §6.1-C 的数值由此脚本产出。macOS 的 ru_maxrss 单位是字节，Linux 是 KB。
"""

import resource
import sys
import time

from rapidocr import RapidOCR

_RSS_DIVISOR = 1048576 if sys.platform == "darwin" else 1024


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / _RSS_DIVISOR


def main() -> int:
    paths = sys.argv[1:]
    if not paths:
        print(__doc__)
        return 2

    t0 = time.perf_counter()
    engine = RapidOCR()
    print(f"模型加载耗时: {time.perf_counter() - t0:.2f}s")
    print(f"加载后常驻内存 RSS: {rss_mb():.2f} MB")

    for path in paths:
        t1 = time.perf_counter()
        res = engine(path)
        dt = time.perf_counter() - t1
        txts = list(res.txts) if res.txts is not None else []
        text = "\n".join(txts)
        print(f"\n===== {path}")
        print(f"识别耗时: {dt:.2f}s  行数: {len(txts)}  字符数: {len(text)}")
        print(f"当前峰值 RSS: {rss_mb():.2f} MB")
        print("--- 前 400 字 ---")
        print(text[:400])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
