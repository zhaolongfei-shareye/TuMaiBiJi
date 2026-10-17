#!/usr/bin/env python3
# 定点探针：沿给定的一条横线／竖线把亮度打出来，并列出"跳变"（相邻取样差 > 阈值）。
# 用法：量-参考图-探针.py [H y] [V x] ...   例：… H 1060 V 280
import sys
from PIL import Image

SRC = ("/Users/zlfmac/.qoder/tmp/-Users-zlfmac-Documents-AgentsNote/images/"
       "fb085725-0b39-4ece-bc6b-935e4051df68/7293c1065f063cd5730a8dedc7b3d7501123803c55aa9bcad250cb1ead0ed607.jpeg")
im = Image.open(SRC).convert("RGB")
W, H = im.size
S = W / 750.0
px = im.load()
TH = float(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1][0] in "0123456789." else 4.0
args = sys.argv[1:]
if args and args[0].replace(".", "").isdigit():
    args = args[1:]


def L(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def prof(kind, fixed):
    n = W if kind == "H" else H
    out, prev = [], None
    for i in range(n):
        c = px[i, fixed] if kind == "H" else px[fixed, i]
        v = L(c)
        if prev is not None and abs(v - prev[1]) > TH:
            out.append((i, round(prev[1], 1), round(v, 1), prev[0 - 0], c))
        prev = (i, v, c)
    print(f"\n== {kind}={fixed}px（{round(fixed/S,1)}rpx）跳变 {len(out)} 处（阈值 Δ>{TH}）")
    for i, a, b, _, c in out:
        print(f"  pos {i}px = {round(i/S,1)}rpx   {a} -> {b}   色 {c}")


i = 0
while i < len(args):
    a = args[i]
    if a[0] in "HV":
        val = a[1:] or (args[i + 1] if i + 1 < len(args) else "")
        prof(a[0], int(val))
        i += 2 if not a[1:] else 1
    else:
        i += 1
