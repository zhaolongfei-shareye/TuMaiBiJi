#!/bin/bash
# v21 逐屏出图：node 画-v21.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-03详情页全屏与卡片元素/截-v21.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v21.mjs

names=(
  v21-s1-浮窗一层甲形象图贯穿
  v21-s2-浮窗一层乙只留主题底色
  v21-s3-右上那一格无卡片淡底方形
  v21-s4-小弹窗维持看得见上一层
)
for f in "${names[@]}"; do
  id="${f#v21-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高是量出来的（探针 1300×12000 扫到内容最后一行 7344、最右一列 1271）；小了会把末尾静默截掉。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1300,7400 \
  --screenshot=v21-整张.png "file://$PWD/v21-详情浮窗一层.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
