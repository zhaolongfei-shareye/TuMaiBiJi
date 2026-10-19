#!/usr/bin/env python3
# 从站长那张现网实拍里做出效果图的底图：把那条玻璃带（含带里那行字）抹成它背后的墙，
# 这样 HTML 里可以照现网令牌重新画一条带子，而不是在旧带子上叠一层。
# 跑法：python3 "docs/design/10-19浮窗引导/_建底图.py"
from PIL import Image

SRC = ("/Users/zlfmac/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
       "xwechat_files/shareye_f856/temp/RWTemp/2026-10/"
       "400df95eb5952ef53b33e81826c85c3f/4bc5442da9d8a04576fa3de7ac69b2fe.jpg")
OUT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/10-19浮窗引导/"
W_CSS = 375.0                      # 效果图按 750rpx = 375px 画，1rpx = 0.5px
im0 = Image.open(SRC).convert("RGB")
S = im0.size[0] / W_CSS            # 实拍 → CSS 的折算（现读，不写死 DPR）
TOP, BOT = int(88 * S), int(128.6 * S)     # 玻璃带上下沿（导航条下沿 → 带底）
SAMPLE = int(138 * S)                      # 带底下方那一行＝纯墙（逐列取色填回去）

im = im0.copy()
px = im.load()
for x in range(im.size[0]):
    fill = px[x, SAMPLE]
    for y in range(TOP, BOT):
        px[x, y] = fill
im = im.crop((0, 0, im.size[0], int(470 * S))).resize(
    (int(im.size[0] / S * 2), int(470 * S / S * 2)), Image.LANCZOS)
im.save(OUT + "底图-抹掉旧带.png")

ref = im0.crop((0, 0, im0.size[0], int(470 * S))).resize(
    (int(im0.size[0] / S * 2), int(470 * S / S * 2)), Image.LANCZOS)
ref.save(OUT + "参考-现网实拍.png")

p = im0.load()
print("折算 S =", round(S, 4), " ⇒ 1rpx =", round(S / 2, 4), "实拍像素")
print("带顶 y =", round(TOP / S, 1), " 带底 y =", round(BOT / S, 1), " 带高 =", round((BOT - TOP) / S, 1), "px")
print("带顶色 =", p[int(90 * S), int(92 * S)], " 带底色 =", p[int(90 * S), int(126 * S)],
      " 墙色 =", p[int(90 * S), SAMPLE])
print("导航底色 =", p[int(90 * S), int(20 * S)], " 胶囊左/右/上/下 css =",
      round(255.4, 1), round(348.8, 1), round(53.8, 1), round(87.0, 1))
