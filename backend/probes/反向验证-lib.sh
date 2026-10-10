#!/bin/bash
# 反向验证脚本共用的那一道 `rv_run`（六支链：落地页／阶段2／2-2／2-2b／2-3／举报台账）。
#
# 为什么会有这一支文件：同一套闸门从前**只长在最晚写的那一支里**，另外五支各有一份旧的
# `run()`——有的没有 `--collect-only` 预数（`pytest -k` 空匹配退出码是 5，会被读成"红=符合预期"，
# 脚本于是自己造★假绿★），有的没有"改坏之后还编译得通"那道（语法崩掉的红是整条针全红，
# 读起来极像牙），全六支里只有一支带锁与 trap。这类"六份拷贝各漂一点"本身就是事故源，
# 所以闸门只留一份出处；各链自己的名单与文件变量仍留在各自脚本里。
#
# 用法（调用方脚本里）：
#   cd <backend> || exit 1
#   source probes/反向验证-lib.sh
#   rv_init <锁名>
#   rv_run <标号> <说明> <应当红的用例关键字> <改动命令字符串> <被改的文件>
#   rv_status          # 收尾：把四类不算数的读数打成一行，非零就退出码非零
#
# 三条口径是这套链自己定的，改动它们要连着改判据：
# ① "不算数"的四种（针没扎到／突变没落盘／改崩／改动命令失败）**既不计红也不计绿**，
#    但会让 `rv_status` 回非零——静悄悄跳过一条刀，和报★假绿★一样坏。
# ② 每一刀都把 diff 头两行贴进回执：md5 只证明"文件变了"，证明不了"变的是意图那一行"
#    （10-10 栽过一次：perl 的 s/// 不带 /g，新写的代码在更靠前处重复了同一句整行文本，
#    于是撤的是诊断分支、真防线一个字没动，红绿都对、结论是假的）。
# ③ 判红之后还要数 `^FAILED`（`-a` 不能少：控制字符类突变会让输出里出现裸 NUL，
#    少了它 `grep -c` 回的是 "Binary file matches" 而不是数）。一条 FAILED 都没有的红
#    是环境炸了（collection error、夹具 `no such table`），不是牙。
#
# 这个文件与调用方脚本的**说明文字里都不许出现反引号**：`rv_run` 用 `eval` 跑改动命令。

RV_PY="${RV_PY:-.venv/bin/python -m pytest -q}"
RV_RED=0          # 红（符合预期）的条数
RV_SOFT_GREEN=0   # 明写了"撤了不红"的那几条，跑出来确实不红
RV_FAKE_GREEN=0   # ★假绿★
RV_BAD=0          # 四类"不算数"的合计
RV_SOFT=0
RV_BAKDIR=""
RV_LIVE_FILE=""
RV_LIVE_BAK=""

rv_init() {  # rv_init <锁名>：先认 cwd，再抢锁、开临时备份目录、挂 trap
  # 这道闸必须在抢锁**之前**：那时 trap 还没挂，退了会留下一把没人清的锁。
  # 为什么要认 cwd——`rv_run` 里 ast 闸写的是 `.venv/bin/python`，`RV_PY` 默认值也是相对路径，
  # 从别的目录跑的话每一条刀都报★突变把文件改崩了★：那是 python 找不到，不是文件真崩了。
  if [ ! -x .venv/bin/python ]; then
    echo "rv_init：当前目录下没有可执行的 .venv/bin/python —— 这一套要在 backend/ 里跑（用法见文件头）。没抢锁、没动任何文件。pwd=$(pwd)"
    exit 1
  fi
  local lock="/tmp/反向验证-$1.lock"
  if ! mkdir "$lock" 2>/dev/null; then
    echo "另一支正在跑这一套（$lock 已经存在）——这些脚本改的是仓库里的真源文件，不并发跑。"
    echo "确认没有别的过程在跑之后：rmdir $lock 再来。"
    exit 1
  fi
  RV_LOCK="$lock"
  RV_BAKDIR=$(mktemp -d /tmp/rv-lib.XXXXXX)
  RV_OUT=$(mktemp /tmp/rv-lib-out.XXXXXX)
  rv_restore_now() {
    if [ -n "$RV_LIVE_FILE" ] && [ -n "$RV_LIVE_BAK" ] && [ -f "$RV_LIVE_BAK" ] && [ -f "$RV_LIVE_FILE" ]; then
      cp "$RV_LIVE_BAK" "$RV_LIVE_FILE"
      echo "!! trap 还原了 $RV_LIVE_FILE（这一条刀没跑完就被打断）"
      RV_LIVE_FILE=""; RV_LIVE_BAK=""
    fi
  }
  rv_cleanup() {
    [ -n "$RV_BAKDIR" ] && rm -rf "$RV_BAKDIR"
    [ -n "$RV_OUT" ] && rm -f "$RV_OUT"
    [ -n "$RV_LOCK" ] && rmdir "$RV_LOCK" 2>/dev/null
    RV_BAKDIR=""; RV_OUT=""; RV_LOCK=""
  }
  rv_on_exit() { rv_restore_now; rv_cleanup; }
  # 被打断必须**停在这儿**，光靠 EXIT 那份不够：bash 里 INT/TERM 的 handler 跑完会从被中断的那条语句
  # **继续往下**跑，而 rv_cleanup 已经把备份目录与锁清掉了——于是后面每一条刀都在没有备份的真源文件上跑。
  # 这是 10-10 深夜那支独立审计实测出来的（中途发一次 TERM：三份都留在盘上、锁也被删，第二支随即抢锁并发跑）。
  rv_on_signal() {
    rv_restore_now
    rv_cleanup
    echo "!! 被打断：已还原并释放锁，后面的刀不再跑（这一支到此为止）"
    exit 130
  }
  trap rv_on_exit EXIT
  trap rv_on_signal INT TERM
}

rv_run() {  # rv_run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  # 调用前设 RV_SOFT=1 表示"这一条**明写了撤了不红**"（双层防线、或另一道等强的那一种）：
  # 报告照打、但不计入★假绿★也不让 rv_status 变红。用完自己归零，不许漏给下一条。
  local soft="${RV_SOFT:-0}"
  RV_SOFT=0
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  local hits bak failed hitline
  hits=$(eval "$RV_PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
  bak="$RV_BAKDIR/$tag"
  if ! cp "$file" "$bak"; then
    echo "$tag ★备份没建成★：$file → $bak —— 没有备份就不动真源文件，这一刀不跑"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
  # 一建成备份就登记，**不能等到要跑判据那一刻**：从"文件被改坏"到"trap 认这个文件"之间不能有空窗，
  # 空窗里来一发 TERM 就把坏文件留在工作树上（独立审计实测：三份都留盘、备份目录被 rm、锁还被删，
  # 于是后面每一条刀都在没有备份的盘上跑）。登记之后每一条出口都必须还原并注销。
  RV_LIVE_FILE="$file"; RV_LIVE_BAK="$bak"
  if ! eval "$mut"; then
    echo "$tag 改动命令失败，跳过（不算红也不算绿）"
    RV_BAD=$((RV_BAD + 1))
    cp "$bak" "$file"; RV_LIVE_FILE=""; RV_LIVE_BAK=""
    return
  fi
  if [ "$(md5 -q "$file")" = "$(md5 -q "$bak")" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    RV_BAD=$((RV_BAD + 1))
    RV_LIVE_FILE=""; RV_LIVE_BAK=""
    return
  fi
  case "$file" in
    *.py)
      if ! .venv/bin/python -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())" "$file" 2>/dev/null; then
        echo "$tag ★突变把文件改崩了★：$desc —— 语法都不通了，这种红不是牙，重写这一刀的模式"
        RV_BAD=$((RV_BAD + 1))
        cp "$bak" "$file"; RV_LIVE_FILE=""; RV_LIVE_BAK=""
        return
      fi
      ;;
  esac
  hitline=$(diff "$bak" "$file" | grep -E '^[<>]' | head -2 | sed 's/^\([<>]\) /\1/' | tr '\n' '|')
  echo "     这一刀动的是：${hitline}"
  if eval "$RV_PY -k '$needle'" >"$RV_OUT" 2>&1; then
    if [ "$soft" = "1" ]; then
      echo "$tag 绿（这一条**明写了撤了不红**，针覆盖 $hits 条）：$desc"
      RV_SOFT_GREEN=$((RV_SOFT_GREEN + 1))
    else
      echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
      tail -3 "$RV_OUT" | sed 's/^/      /'
      RV_FAKE_GREEN=$((RV_FAKE_GREEN + 1))
    fi
  else
    failed=$(grep -ac '^FAILED' "$RV_OUT")
    if [ "$failed" -eq 0 ]; then
      echo "$tag ★红得不明不白★（针覆盖 $hits 条）：$desc —— 非零退出但一条 FAILED 都没有，那是环境炸了不是牙"
      tail -3 "$RV_OUT" | sed 's/^/      /'
      RV_BAD=$((RV_BAD + 1))
    else
      if [ "$soft" = "1" ]; then
        echo "$tag 红（这一条原本**明写撤了不红**，现在它有牙了——把那条注释撤掉）：$desc"
      else
        echo "$tag 红（符合预期，针覆盖 $hits 条、FAILED $failed 条）：$desc"
      fi
      RV_RED=$((RV_RED + 1))
      grep -a '^FAILED' "$RV_OUT" | head -2 | sed 's/^/      /'
    fi
  fi
  cp "$bak" "$file"
  if [ "$(md5 -q "$file")" != "$(md5 -q "$bak")" ]; then
    # 还原没成：登记**不许注销**，留着让 trap 还有机会再试一次（注销了就再没人管这个文件了）
    echo "$tag 还原失败，检查 $file"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
  RV_LIVE_FILE=""; RV_LIVE_BAK=""
}

rv_recheck() {  # rv_recheck <测试文件…>：还原之后复跑这一支相关的尺子，非零必须记账
  # 这里**不许再加一个 `-q`**：`RV_PY` 自带 `-q`，两条 `-q -q` 就是 quiet level 2，
  # 实测那种跑法**不打最后那行 "N passed"**（尾巴只剩 warnings 的 `-- Docs:` 那一句），
  # 于是"复跑全绿"这句又没有数了——正是这一条函数要消灭的东西。读数行一律带上退出码。
  local out last code
  out=$(eval "$RV_PY $*" 2>&1); code=$?
  last=$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -1)
  if [ "$code" -ne 0 ]; then
    echo "★还原复跑不绿★（退出码 $code）：$last —— 这一支把盘上的东西改坏了没还原干净，或者判据本来就红"
    printf '%s\n' "$out" | grep -a '^FAILED' | head -3 | sed 's/^/      /'
    RV_BAD=$((RV_BAD + 1))
  else
    echo "退出码 0 ｜ $last"
  fi
}

rv_status() {  # 收尾一行：四类不算数与★假绿★都让退出码非零
  echo "=== 合计：红 $RV_RED ／ 明写不红 $RV_SOFT_GREEN ／ ★假绿★ $RV_FAKE_GREEN ／ 不算数 $RV_BAD ==="
  if [ "$RV_FAKE_GREEN" -gt 0 ] || [ "$RV_BAD" -gt 0 ]; then
    return 1
  fi
  return 0
}
