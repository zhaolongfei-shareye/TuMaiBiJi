#!/bin/bash
# v18 逐屏出图：node 画-v18.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-02三视图与背景亮度/截-v18.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v18.mjs

names=(
  v18-s1-首页调亮度一枚圆点-纯白档 v18-s2-首页调亮度一枚圆点-点两下到50
  v18-s3-纸片墙置顶进分类行加浅虚线 v18-s4-一行撤横线属性标记改描线
  v18-s5-搜索摊开Tips消失 v18-s6-点置顶
)
for f in "${names[@]}"; do
  id="${f#v18-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高 6200 是量出来的（documentElement.scrollHeight = 6171）；小了会把末尾那段截掉。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1660,6200 \
  --screenshot=v18-整张.png "file://$PWD/v18-做减法.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
