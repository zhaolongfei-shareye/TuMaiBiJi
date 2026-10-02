#!/bin/bash
# v19 逐屏出图：node 画-v19.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-03两tab与卡片网格/截-v19.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v19.mjs

names=(
  v19-s1-区内两枚tab与X式列表 v19-s2-显示更多浮全文窗
  v19-s3-笔记卡片两列白垫加页码 v19-s4-搜索条压到60
)
for f in "${names[@]}"; do
  id="${f#v19-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高是量出来的（四屏两行 + 末尾那两段说明）；小了会把末尾截掉。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1660,4700 \
  --screenshot=v19-整张.png "file://$PWD/v19-两tab与卡片网格.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
