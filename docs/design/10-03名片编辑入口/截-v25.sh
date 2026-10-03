#!/bin/bash
# v25 逐条出图：node 画-v25.mjs 生成 .薄页-sN.html → Chrome headless 按宽 750 截 → PIL 裁掉末尾白边。
# 这一稿只有 dock 那一段（站长「不需要全部出效果图」），所以每条高由内容自己定，不钉死 1670。
# 跑法：bash docs/design/10-03名片编辑入口/截-v25.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v25.mjs

names=(
  v25-s1-新-药丸开着带二维码分享
  v25-s2-新-药丸关着不带二维码分享
  v25-s3-对照现网那一版
)
for f in "${names[@]}"; do
  id="${f#v25-}"; id="${id%%-*}"
  # 窗口先给足（500 高），末尾那截纯白由 PIL 裁掉；固定高会静默截掉末尾，这条踩过
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,500 \
    --screenshot=".raw-$id.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
  python3 - ".raw-$id.png" "$f.png" <<'PY'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
w, h = im.size; px = im.load()
last = 0
for y in range(h - 1, -1, -1):
    if any(px[x, y] != (255, 255, 255) for x in range(0, w, 3)):
        last = y; break
im.crop((0, 0, w, last + 1)).save(dst)
print(f'{dst}  750×{last + 1}')
PY
  rm -f ".raw-$id.png"
done
# 整张：窗口高同样是量出来的（探针从下往上扫末行内容 + 60）
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1300,9000 \
  --screenshot=.整张-探针.png "file://$PWD/v25-按钮区.html" >/dev/null 2>&1
H=$(python3 - <<'PY'
from PIL import Image
BG = (0xE7, 0xE4, 0xDD)
im = Image.open('.整张-探针.png').convert('RGB')
w, h = im.size; px = im.load()
last = 0
for y in range(h - 1, -1, -1):
    if any(px[x, y] != BG for x in range(0, w, 7)):
        last = y; break
print(min(h, last + 60))
PY
)
rm -f .整张-探针.png
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1300,$H \
  --screenshot=v25-整张.png "file://$PWD/v25-按钮区.html" >/dev/null 2>&1
echo "整张窗口高 $H"
rm -f .薄页-s*.html
