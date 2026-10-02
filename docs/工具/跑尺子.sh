#!/bin/zsh
# 每把尺子之前把开发者工具整个重启一次。
# 为什么：有的尺子收尾调 mp.close()，之后端口还在监听、会话却是死的（僵尸端口），
# 下一把连上就报 "Connection closed"；只有 quit + 重开 + cli auto 能救回来。
# 用法：docs/工具/跑尺子.sh <端口> <尺子名…>；每把的全量输出在 /tmp/ruler-<名>.log
# 端口要和尺子里硬写的那个对上：本项目真跑那批一律 9431，个别独立脚本写 9420，
# 对不上时报的是「连不上 9431」这种连接红，不是任何一条判据红——别当成回归查。
#
# NODE_PATH 这里自己给，不再指望调用者记得带：10-03 零点这批就是没带，
# 三把尺子报的是 MODULE_NOT_FOUND，看着像"代码崩了"其实是环境红。
# 装的位置也从 /tmp 挪到 ~/.mpauto——/tmp 会被系统半夜清一次，
# 10-03 那次 miniprogram-automator 只剩两个 .d.ts，整个真跑链路当场全瞎。
# 老的 /tmp/mpaauto 路径还在尺子文件头的注释里，给它留个软链，两条路都走得通。
cd /Users/zlfmac/Documents/TuMaiBiJi || exit 1
export NODE_PATH="$HOME/.mpauto/node_modules"
[ -d "$HOME/.mpauto/node_modules/miniprogram-automator" ] || {
  echo "!! 缺 miniprogram-automator，先装一次：mkdir -p ~/.mpauto && cd ~/.mpauto && npm i miniprogram-automator"
  exit 1
}
[ -e /tmp/mpaauto ] || ln -s "$HOME/.mpauto" /tmp/mpaauto
PORT=$1; shift
CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli
for f in "$@"; do
  "$CLI" quit >/dev/null 2>&1; sleep 8
  pkill -f wechatwebdevtools >/dev/null 2>&1; sleep 4
  open -a wechatwebdevtools; sleep 45
  "$CLI" auto --project /Users/zlfmac/Documents/TuMaiBiJi/miniprogram --auto-port $PORT >/dev/null 2>&1
  sleep 45
  LOG=/tmp/ruler-$f.log
  NODE_PATH=/tmp/mpaauto/node_modules node "docs/工具/$f.js" >"$LOG" 2>&1
  code=$?
  echo "=== $f  退出码 $code"
  grep -E "✗|!!|ERR|脚本崩|尺子挂|探针挂|连不上" "$LOG" | head -6
  tail -2 "$LOG" | sed 's/^/    /'
done
