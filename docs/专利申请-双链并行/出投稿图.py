#!/usr/bin/env python3
"""把六张 SVG 出成投稿用的黑白 JPEG。

《关于规范提交专利电子申请的指引》对说明书附图的硬要求：
- 纵向 A4；附图尺寸 165mm x 245mm
- 分辨率 72-300 DPI（本脚本取 300）
- 格式 JPEG 或 TIF（TIF 需 Group 4 压缩）
- 单个图片限定在单页内，不能跨页
- 图号以文字形式表示，不包含在图片中

165mm x 245mm @300dpi = 1949 x 2894 像素。SVG 由无头 Chrome 按目标尺寸直接栅格化，
不做位图放大，文字边缘保持矢量级锐利。
"""
import os
import re
import subprocess
import sys
import tempfile
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

MM_W, MM_H = 165, 245
DPI = 300
PW, PH = round(MM_W / 25.4 * DPI), round(MM_H / 25.4 * DPI)   # 1949 x 2894
PAD = 40                                                       # 约 3.4mm 安全边

OUT_JPG = os.path.join(HERE, "投稿附图")
OUT_PNG = os.path.join(HERE, "预览")

FIGS = [
    (1, "patent-fig1-overall-flow.svg"),
    (2, "patent-fig2-chain-a.svg"),
    (3, "patent-fig3-chain-b.svg"),
    (4, "patent-fig4-bindcompensate.svg"),
    (5, "patent-fig5-staging-governance.svg"),
    (6, "patent-fig6-runtime-equivalence.svg"),
]


def svg_size(path):
    s = open(path, encoding="utf-8").read()
    w, h = re.search(r'width="(\d+)" height="(\d+)"', s).groups()
    return int(w), int(h)


PROFILE = os.path.join(tempfile.gettempdir(), "chprof-patent-figs")


def shot(html_path, png_path, w, h):
    """无头 Chrome 截图。

    本机已开着图形界面 Chrome，headless 进程写完 PNG 后常常不退出，所以不能
    subprocess.run 死等——轮询到文件写完就把它 terminate 掉。
    """
    if os.path.exists(png_path):
        os.remove(png_path)
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
           "--no-first-run", "--no-default-browser-check", "--disable-extensions",
           f"--user-data-dir={PROFILE}",
           "--force-device-scale-factor=1", f"--window-size={w},{h}",
           f"--screenshot={png_path}", "file://" + html_path]
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    stable, last = 0, -1
    try:
        for _ in range(240):                      # 最多 120 秒
            time.sleep(0.5)
            if os.path.exists(png_path):
                sz = os.path.getsize(png_path)
                if sz and sz == last:
                    stable += 1
                    if stable >= 2:               # 连续 1 秒大小不变＝写完
                        return
                else:
                    stable = 0
                last = sz
        raise RuntimeError(f"截图超时：{os.path.basename(png_path)}")
    finally:
        p.terminate()
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill()


def wrap(svg_path, iw, ih):
    scale = min((PW - 2 * PAD) / iw, (PH - 2 * PAD) / ih)
    w, h = iw * scale, ih * scale
    html = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0;background:#fff}}
img{{display:block;position:absolute;left:{(PW - w) / 2:.2f}px;top:{(PH - h) / 2:.2f}px;
width:{w:.2f}px;height:{h:.2f}px}}
</style></head><body><img src="file://{svg_path}"></body></html>'''
    return html, scale


def main():
    os.makedirs(OUT_JPG, exist_ok=True)
    os.makedirs(OUT_PNG, exist_ok=True)
    for num, name in FIGS:
        src = os.path.join(HERE, name)
        iw, ih = svg_size(src)

        html, scale = wrap(src, iw, ih)
        tmp = os.path.join(HERE, f".wrap{num}.html")
        open(tmp, "w", encoding="utf-8").write(html)
        page = os.path.join(tempfile.gettempdir(), f"patent-page{num}.png")
        shot(tmp, page, PW, PH)

        im = Image.open(page)
        if im.size != (PW, PH):
            print(f"✗ 图{num} 页面尺寸 {im.size} != {(PW, PH)}")
            return 1
        jpg = os.path.join(OUT_JPG, f"图{num}.jpg")
        im.convert("L").convert("RGB").save(jpg, "JPEG", quality=95, dpi=(DPI, DPI))

        # 预览用自然尺寸另出一张，供肉眼核对
        phtml = os.path.join(HERE, f".prev{num}.html")
        open(phtml, "w", encoding="utf-8").write(
            f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
            f'html,body{{margin:0;padding:0;background:#fff}}</style></head>'
            f'<body><img src="file://{src}" width="{iw}" height="{ih}"></body></html>')
        shot(phtml, os.path.join(OUT_PNG, f"fig{num}.png"), iw, ih)

        os.remove(tmp)
        os.remove(phtml)
        os.remove(page)
        mm = 12 * scale / DPI * 25.4
        print(f"✓ 图{num}  源 {iw}x{ih} → 缩放 {scale:.3f}  "
              f"12px 字 = {mm:.2f}mm  → {os.path.relpath(jpg, HERE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
