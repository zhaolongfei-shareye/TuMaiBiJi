#!/bin/bash
# v15 逐屏出图：node 画-v15.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-02三视图与背景亮度/截-v15.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v15.mjs

names=(
  s1-首页背景亮度-正常 s2-首页背景亮度-减50 s3-录入面板展开滑块让位 s4-外观设置点小图直接生效
  s5-第三个tab-设置 s6-第三个tab-关于 s7-笔记视图黄杠 s8-分享视图时间轴便签墙
  s9-分享大图五枚按钮 s10-长按撤回确认 s11-种草视图带对方圆像 s12-种草大图不能二次分享
  s13-别人扫已撤回的码
)
for f in "${names[@]}"; do
  id="${f%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{printf "%s ", $2} END{print ""}'; done
