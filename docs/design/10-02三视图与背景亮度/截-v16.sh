#!/bin/bash
# v16 逐屏出图：node 画-v16.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-02三视图与背景亮度/截-v16.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v16.mjs

names=(
  v16-s1-首页三枚灰度小圆-纯白 v16-s2-首页三枚灰度小圆-50 v16-s3-笔记视图纸片墙 v16-s4-笔记视图一行
  v16-s5-笔记搜索向左展开 v16-s6-笔记点置顶 v16-s7-分享视图纸片墙 v16-s8-分享视图一行
  v16-s9-分享大图五枚按钮 v16-s10-长按撤回确认 v16-s11-种草视图纸片墙带圆像 v16-s12-种草大图不能二次分享
  v16-s13-别人扫已撤回的码
)
for f in "${names[@]}"; do
  id="${f#v16-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1660,11600 \
  --screenshot=v16-整张.png "file://$PWD/v16-三区便签与亮度小圆.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{printf "%s ", $2} END{print ""}'; done
