#!/bin/bash
# v22 逐屏出图：node 画-v22.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-03详情页全屏与卡片元素/截-v22.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v22.mjs

names=(
  v22-s1-窗开着图贯穿头部两样保留
  v22-s2-窗开着一张卡片都没有
  v22-s3-小弹窗维持看得见上一层
  v22-s4-对照现网实拍那一张
)
for f in "${names[@]}"; do
  id="${f#v22-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高是量出来的（探针 1300×12000 从下往上扫：内容最后一行 7400、最右一列 1268）；
# 小了会把末尾静默截掉，大了就是一截白边。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1300,7450 \
  --screenshot=v22-整张.png "file://$PWD/v22-详情窗一层贯穿.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
