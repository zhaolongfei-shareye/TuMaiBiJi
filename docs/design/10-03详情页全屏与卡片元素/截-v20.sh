#!/bin/bash
# v20 逐屏出图：node 画-v20.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-03详情页全屏与卡片元素/截-v20.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v20.mjs

names=(
  v20-s1-详情全屏已有卡片带页码 v20-s2-详情全屏无卡片右上淡底方形
  v20-s3-小弹窗首次四格空 v20-s4-小弹窗填过四格满先删一格
  v20-s5-成品弹窗三张封面墙 v20-s6-卡片模板四格改小不滚
  v20-s7-同一屏走系统导航条
)
for f in "${names[@]}"; do
  id="${f#v20-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高是量出来的（屏数 + 末尾那段"五处要你拍"都会把它撑长）；小了会把末尾静默截掉。
# 10-03 第三轮：七屏 + 五处建议，探针量到内容最后一行 9159，所以窗口开 9210。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1660,9210 \
  --screenshot=v20-整张.png "file://$PWD/v20-详情全屏与卡片元素.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
