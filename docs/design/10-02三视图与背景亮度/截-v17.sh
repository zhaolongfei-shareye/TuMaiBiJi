#!/bin/bash
# v17 逐屏出图：node 画-v17.mjs 生成 .薄页-sN.html → Chrome headless 按 750×1670（1px=1rpx）截 → 删薄页。
# 跑法：bash docs/design/10-02三视图与背景亮度/截-v17.sh
set -e
cd "$(dirname "$0")"
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node 画-v17.mjs

names=(
  v17-s1-首页三枚灰度小圆-纯白即原图 v17-s2-首页三枚灰度小圆-50 v17-s3-笔记视图纸片墙按日期分行 v17-s4-笔记视图一行换属性小圆
  v17-s5-笔记搜索摊开Tips消失 v17-s6-笔记点置顶 v17-s7-分享视图纸片墙 v17-s8-分享视图一行
  v17-s9-分享大图五枚按钮 v17-s10-长按撤回确认 v17-s11-种草视图纸片墙带圆像 v17-s12-种草大图不能二次分享
  v17-s13-别人扫已撤回的码
)
for f in "${names[@]}"; do
  id="${f#v17-}"; id="${id%%-*}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --window-size=750,1670 \
    --screenshot="$f.png" "file://$PWD/.薄页-$id.html" >/dev/null 2>&1
done
rm -f .薄页-s*.html
# 整张的窗口高 13300 是量出来的（documentElement.scrollHeight = 13272）；小了会把末尾
# 「两个后端前提」那一段截掉。改过标注文字后要重新量一次再抬这个数。
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1660,13300 \
  --screenshot=v17-整张.png "file://$PWD/v17-三视图收口.html" >/dev/null 2>&1
for f in "${names[@]}"; do printf '%s  ' "$f.png"; sips -g pixelWidth -g pixelHeight "$f.png" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' ' '; echo; done
