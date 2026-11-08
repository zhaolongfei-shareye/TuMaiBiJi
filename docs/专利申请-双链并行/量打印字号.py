#!/usr/bin/env python3
"""按 A4 附图页可用面积反算每幅图印刷后的实际字号（毫米），并给出三分之二缩小时的字号。

附图页页边距（审查指南第五部分第一章）：上 25mm、下 15mm、左 25mm、右 15mm
A4 = 210 x 297mm  →  可用面积 170 x 257mm
"""
import glob
import os
import re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
NS = "{http://www.w3.org/2000/svg}"
AW, AH = 170.0, 257.0   # 可用宽 / 高（mm）


def report(path):
    root = ET.parse(path).getroot()
    vb = root.get("viewBox") or f"0 0 {root.get('width')} {root.get('height')}"
    _, _, W, H = [float(v) for v in vb.split()]
    s = min(AW / W, AH / H)          # mm / px
    sizes = {}
    for el in root.iter():
        if el.tag.replace(NS, "") != "text":
            continue
        fs = float(el.get("font-size", 13))
        sizes[fs] = sizes.get(fs, 0) + 1
    binds = "高" if AH / H < AW / W else "宽"
    print(f"\n{os.path.basename(path)}  {W:.0f}x{H:.0f}px → 印成 "
          f"{W*s:.0f}x{H*s:.0f}mm（{binds}边贴合，比例 {s:.4f} mm/px）")
    for fs in sorted(sizes):
        full, two3 = fs * s, fs * s * 2 / 3
        flag = "  ← 三分之二缩后不可读" if two3 < 1.6 else ""
        print(f"    {fs:>5.1f}px × {sizes[fs]:>3} 处 → {full:4.2f}mm"
              f"  ／缩小到2/3后 {two3:4.2f}mm{flag}")
    print(f"    参考：正文 10.5pt = 3.70mm；一般认为 <1.8mm 中文即难辨")


for p in sorted(glob.glob(os.path.join(HERE, "patent-fig*.svg"))):
    report(p)
