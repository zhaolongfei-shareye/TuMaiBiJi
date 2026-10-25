#!/bin/zsh
# 每把尺子之前把开发者工具整个重启一次。
# 为什么：有的尺子收尾调 mp.close()，之后端口还在监听、会话却是死的（僵尸端口），
# 下一把连上就报 "Connection closed"；只有 quit + 重开 + cli auto 能救回来。
# 用法：docs/工具/跑尺子.sh <端口> <尺子名…>；每把的全量输出在 /tmp/ruler-<名>.log
# 退出码＝这一批里最坏那把**进门**尺子的码（整批全绿才是 0）。以前这里恒 0（循环最后一句是那句
# 打印用的 `sed`，10-25 审计 M22；跑新模板流程.sh:83 的注释自认过一次），调用方只能去 grep 日志里
# 自己打的"退出码 N"——那一行照旧留着，两种读法都还能用。
# 端口要和尺子里硬写的那个对上：本项目真跑那批一律 9431，个别独立脚本写 9420，
# 对不上时报的是「连不上 9431」这种连接红，不是任何一条判据红——别当成回归查。
#
# NODE_PATH 这里自己给，不再指望调用者记得带：10-03 零点这批就是没带，
# 三把尺子报的是 MODULE_NOT_FOUND，看着像"代码崩了"其实是环境红。
# 装的位置也从 /tmp 挪到 ~/.mpauto——/tmp 会被系统半夜清一次，
# 10-03 那次 miniprogram-automator 只剩两个 .d.ts，整个真跑链路当场全瞎。
# 老的 /tmp/mpaauto 路径还在尺子文件头的注释里，给它留个软链，两条路都走得通。
#
# 项目根可以给：`MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi-2.2 docs/工具/跑尺子.sh …`。
# 2.2 那条线是独立 worktree（方案 §2 甲），不传这个变量它就去不了。
# 不给 MP_ROOT 时走的主目录，与以前写死的值一个字不差——2.1 那条线的跑法不受影响。
# 尺子自己读的是 `path.resolve(__dirname,'../..')`，所以务必跑**目标工作树里那一份**脚本，
# 别在主目录跑尺子去连 2.2 的包：那量到的是主目录的代码，绿是假绿。
cd "${MP_ROOT:-/Users/zlfmac/Documents/TuMaiBiJi}" || exit 1
export NODE_PATH="$HOME/.mpauto/node_modules"
[ -d "$HOME/.mpauto/node_modules/miniprogram-automator" ] || {
  echo "!! 缺 miniprogram-automator，先装一次：mkdir -p ~/.mpauto && cd ~/.mpauto && npm i miniprogram-automator"
  exit 1
}
[ -e /tmp/mpaauto ] || ln -s "$HOME/.mpauto" /tmp/mpaauto
# 每把之前确认一次 automator 那道版本闸还修着（详见 修-automator版本闸.js 头部那段实测）。
# 为什么写在这儿而不是"修一次就完事"：补丁打在 ~/.mpauto 那个 node_modules 里，
# 重装 npm i 会把它冲掉，冲掉之后所有真跑尺子打的还是那句没原因的「连不上自动化端口」。
node "docs/工具/修-automator版本闸.js" || exit 1
PORT=$1; shift
CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli

# 只读数、不判对错的那几把：它们的退出码不进总闸（"不进门"）。
# 为什么必须单列一份，而不是照旧不看退出码：不看退出码就是 M22 那枚假绿灯的根——一百七十多把尺子的红
# 在调用方眼里根本不存在。改成看退出码之后，这几把会把"我今天没等到读数／取数方式红了"报成回归，
# 所以逐把点名豁免，理由写在这里。
# ⚠ 不进门 ≠ 默默放行：每一把都当场念「不进门（理由）· 退出码 N」，全量输出照旧在 /tmp/ruler-<名>.log。
# 名单只这一份：没列上的尺子一律进门。漏列的后果只是屏幕上多一条红，多列的后果是有人少看见一条红——
# 所以要挪动这个名字前先读它自己的文件头，它得真的"不判对错"才配进来。
# ⚠ 下面这些下标**不许加引号**：zsh 5.9 实测 `A["k"]=v` 会把那对引号原样留在键名里，
# 而回查 `${A[$f]}` 拿的是没引号的那个名字 ⇒ 永远查不中 ⇒ 整份名单形同空册、每条都被算成红。
typeset -A NO_GATE
NO_GATE[读数-云上对象可读性]="只出两种读数（创建者读得到／非创建者读不读得到），读不到那一读＝症状复现、本身就是答案；它的 2 号只代表没等到数"
NO_GATE[量-面板阴影五档读数]="出四个落差数，判读靠人比那五张皮；退出码 2 是取不到像素，不是产品红"
NO_GATE[拍-玻璃AB]="只出两张 PNG 配成一对给肉眼，脚本里一条判据都没有"
NO_GATE[拍-形象四槽]="只出三张 PNG（空态／满态／删一格），'看着乱不乱'量具判不了"
NO_GATE[探-玻璃深浅]="文件头自认「这一把不判对错，只把深拆成两笔账」，数交给 量-玻璃深浅.py 读"
NO_GATE[探-卡片字节与形象占用]="S0 现场读数（只读、不写不传不记账），退出码 2/3 按它文件头的口径属取数方式红"

WORST=0        # 进门那批里最坏一把的码；整批全绿才是 0
ENVCOUNT=0     # 环境红（语言钉子没打成）把数——它单独计数，别和判据红混成一堆去查回归
NOGATE=0
for f in "$@"; do
  "$CLI" quit >/dev/null 2>&1; sleep 8
  pkill -f wechatwebdevtools >/dev/null 2>&1; sleep 4
  open -a wechatwebdevtools; sleep 45
  "$CLI" auto --project "$PWD/miniprogram" --auto-port $PORT >/dev/null 2>&1
  sleep 45
  # 每一把开跑前把屏上那一刻的语言钉成中文（10-18 那批 22 把红大半是这一型环境红：
  # 服务端那一行 language=en，而 37 把里只有 9 把自己钉过）。读数打进日志，别当没有。
  LANGLOG=/tmp/ruler-$f.lang.log
  MP_PORT=$PORT NODE_PATH=/tmp/mpaauto/node_modules node "docs/工具/钉-屏上语言.js" $PORT >"$LANGLOG" 2>&1
  lang=$?
  echo "--- $(cat /tmp/ruler-$f.lang.log 2>/dev/null | tail -1)"
  LOG=/tmp/ruler-$f.log
  NODE_PATH=/tmp/mpaauto/node_modules node "docs/工具/$f.js" >"$LOG" 2>&1
  code=$?
  echo "=== $f  退出码 $code"
  grep -E "✗|!!|ERR|脚本崩|尺子挂|探针挂|连不上" "$LOG" | head -6
  tail -2 "$LOG" | sed 's/^/    /'
  # 钉子挂了 ⇒ 这一把判成环境红：屏上那一刻的语言没钉住，它量到的每一条都不可信（红要出声，
  # 但码定在 2、比判据红那一档轻一点，好让人先分清"量具坏了"与"东西改坏了"）。
  if [ $lang -ne 0 ]; then
    ENVCOUNT=$((ENVCOUNT + 1))
    echo "!! 环境红：语言钉子退出码 $lang（钉-屏上语言.js 没打成）⇒ $f 这一把吃的还是屏上那一刻的语言"
    if [ $code -eq 0 ]; then code=2; echo "=== $f  退出码改判 2（环境红）"; fi
  fi
  # 环境红这一档**不看进门名单**：读数不可信是量具的事，跟这把尺子判不判对错无关。
  if [ $lang -ne 0 ] && [ 2 -gt $WORST ]; then
    WORST=2
  elif [ -n "${NO_GATE[$f]}" ]; then
    NOGATE=$((NOGATE + 1))
    echo "    不进门（${NO_GATE[$f]}）· 本把退出码 $code 不进总闸"
  elif [ $code -ne 0 ] && [ $code -gt $WORST ]; then
    WORST=$code
  fi
done
# 总闸：以前这句是循环尾巴上那句 `sed` 的码（恒 0），所以 跑新模板流程.sh:83 只能自己去 grep 日志。
# 现在调用方直接看退出码就行——非 0 就是这一批里至少有一把进门尺子红了，或钉子挂过。
echo "==== 跑尺子总闸：最差码 $WORST · 环境红 $ENVCOUNT 把 · 不进门 $NOGATE 把（共 $# 把）"
exit $WORST
