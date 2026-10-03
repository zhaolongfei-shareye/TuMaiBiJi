#!/bin/bash
# v24 逐屏出图：node 画-v24.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-03名片编辑入口/截-v24.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v24.mjs

names=(
  v24-s1-底排两行二维码靠右
  v24-s2-小弹窗卡片上的信息
)
for f in "${names[@]}"; do
  id="${f#v24-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高是量出来的（探针 1300×14000 从下往上扫，末行内容 + 60 留白）；
# 小了会把末尾静默截掉（这条踩过），大了就是一截白边。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1300,14000 \
  --screenshot=.整张-探针.png "file://$PWD/v24-底排两行.html" >/dev/null 2>&1
H=$(python3 - <<'PY'
from PIL import Image
BG = (0xE7, 0xE4, 0xDD)          # body 的底色，整张末尾就是这一片
im = Image.open('.整张-探针.png').convert('RGB')
w, h = im.size
px = im.load()
last = 0
for y in range(h - 1, -1, -1):
    if any(px[x, y] != BG for x in range(0, w, 7)):
        last = y
        break
print(min(h, last + 60))
PY
)
rm -f .整张-探针.png
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1300,$H \
  --screenshot=v24-整张.png "file://$PWD/v24-底排两行.html" >/dev/null 2>&1
echo "整张窗口高 $H"
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
