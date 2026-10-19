#!/usr/bin/env python3
"""把笔记列表页实拍透视贴进 组-手机与纸卡-透明.png 那台手机，竖排纸卡原样压在顶上。

手机那四条边不是纯旋转（原图是带透视的设备样机），所以四角用四条边直线外推求交；
手机下沿被画布切掉了，量不到，改成"过画布底边外 21px 的一条与上边平行的线"当虚拟下沿，
贴完一律按原 alpha 裁一次，轮廓那一圈 8px 留原图不吃图 —— 外推误差全被原轮廓吃掉。
纸卡先量出凸包，贴完把凸包内的原像素还回去，卡上的字和插画不动。
"""
import cv2
import numpy as np
from PIL import Image

CUT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-20261015/组-手机与纸卡-透明.png"
SHOT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo/实拍-笔记列表页.jpg"
OUT = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo/组-手机与纸卡-列表页.png"
DBG = "/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo/_调试-四角.png"

RIM = 8              # 轮廓留原图那一圈宽度
BOTTOM_MID_Y = 1560  # 虚拟下沿在画面中线处的 y（画布高 1540 ⇒ 略探出底边）

im = np.array(Image.open(CUT).convert("RGBA"))
H, W = im.shape[:2]
op = im[..., 3] > 128


def line_y_of_x(lo, hi, take_min=True):
    pts = []
    for x in range(lo, hi + 1):
        s = np.flatnonzero(op[:, x])
        if len(s):
            pts.append((x, s.min() if take_min else s.max()))
    p = np.array(pts, float)
    k, b = np.polyfit(p[:, 0], p[:, 1], 1)
    return k, b, len(p)


def line_x_of_y(lo, hi, take_min=True):
    pts = []
    for y in range(lo, hi + 1):
        s = np.flatnonzero(op[y, :])
        if len(s):
            pts.append((y, s.min() if take_min else s.max()))
    p = np.array(pts, float)
    c, d = np.polyfit(p[:, 0], p[:, 1], 1)
    return c, d, len(p)


kT, bT, nT = line_y_of_x(500, 970, True)
cL, dL, nL = line_x_of_y(210, 720, True)
cR, dR, nR = line_x_of_y(300, 1420, False)
print(f"样本数 上{nT} 左{nL} 右{nR}")
print(f"上边 y={kT:.5f}x+{bT:.2f}   左边 x={cL:.5f}y+{dL:.2f}   右边 x={cR:.5f}y+{dR:.2f}")

def corner(cv, dv, kh, bh):
    y = (kh * dv + bh) / (1 - kh * cv)
    return (cv * y + dv, y)


TL = corner(cL, dL, kT, bT)
TR = corner(cR, dR, kT, bT)
mid_x = (TL[0] + TR[0]) / 2
bB = BOTTOM_MID_Y - kT * mid_x          # 下沿与上沿平行
BR = corner(cR, dR, kT, bB)
BL = corner(cL, dL, kT, bB)
print(f"下边 y={kT:.5f}x+{bB:.2f}")
for nm, pt in (("TL", TL), ("TR", TR), ("BR", BR), ("BL", BL)):
    print(f"{nm} = ({pt[0]:.1f}, {pt[1]:.1f})")
wt = np.hypot(TR[0] - TL[0], TR[1] - TL[1])
wb = np.hypot(BR[0] - BL[0], BR[1] - BL[1])
hl = np.hypot(BL[0] - TL[0], BL[1] - TL[1])
hr = np.hypot(BR[0] - TR[0], BR[1] - TR[1])
print(f"上宽 {wt:.1f} 下宽 {wb:.1f} 左高 {hl:.1f} 右高 {hr:.1f}  宽高比 {(wt + wb) / (hl + hr):.4f}")

# ---- 纸卡那块 ----
# 三条边各自量出来：上沿 y=833-0.158x（两处独立读数对得上）、右沿 x=0.1577y+310.3
# （y=1000→468 与 y=1180..1440→497..538 同一条线）、左沿过 (0,1062) 斜率 0.15833。
# 卡的左下两角在画布外，所以直接用这五条线围出画布内那一块。
yy, xx = np.mgrid[0:H, 0:W]
card_poly = np.float32([[0, 833], [431, 765], [553, 1539], [88, 1539], [0, 1062]])
card_hull = np.zeros((H, W), np.uint8)
cv2.fillPoly(card_hull, [card_poly.astype(np.int32)], 1)
card_hull = cv2.dilate(card_hull, np.ones((9, 9), np.uint8))
ys, xs = np.nonzero(card_hull)
print(f"纸卡多边形 → {int(card_hull.sum())} px  bbox x {xs.min()}..{xs.max()} y {ys.min()}..{ys.max()}")

# ---- 透视贴入 ----
shot = np.array(Image.open(SHOT).convert("RGB"))  # 全程按 RGB 走，warpPerspective 不挑通道顺序
sh, sw = shot.shape[:2]
print(f"实拍 {sw}x{sh} 宽高比 {sw / sh:.4f}")
dst = np.float32([TL, TR, BR, BL])
src = np.float32([[0, 0], [sw - 1, 0], [sw - 1, sh - 1], [0, sh - 1]])
M = cv2.getPerspectiveTransform(src, dst)
warped = cv2.warpPerspective(shot, M, (W, H), flags=cv2.INTER_LANCZOS4,
                             borderMode=cv2.BORDER_REPLICATE)

rim = op & ~cv2.erode(op.astype(np.uint8), np.ones((2 * RIM + 1, 2 * RIM + 1), np.uint8)).astype(bool)
paste = op & ~card_hull.astype(bool) & ~rim
out = im.copy()
out[..., :3][paste] = warped[paste]
Image.fromarray(out).save(OUT)
print(f"贴入 {int(paste.sum())} px（轮廓 {int(rim.sum())}）→ saved {OUT}")

dbg = cv2.cvtColor(out[..., :3], cv2.COLOR_RGB2BGR)
for P in (TL, TR, BR, BL):
    if 0 <= P[0] < W and -50 <= P[1] < H + 50:
        cv2.circle(dbg, (int(P[0]), int(P[1])), 9, (0, 0, 255), 2)
cv2.polylines(dbg, [dst.astype(np.int32)], True, (0, 200, 0), 2)
cv2.polylines(dbg, [card_poly.astype(np.int32)], True, (255, 0, 255), 2)
sc = 0.5
cv2.imwrite(DBG, cv2.resize(dbg, (int(W * sc), int(H * sc))))
print("saved", DBG)
