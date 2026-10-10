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

rv_init() {  # rv_init <锁名>：抢锁、开临时备份目录、挂 trap
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
  rv_on_exit() {
    rv_restore_now
    [ -n "$RV_BAKDIR" ] && rm -rf "$RV_BAKDIR"
    [ -n "$RV_OUT" ] && rm -f "$RV_OUT"
    [ -n "$RV_LOCK" ] && rmdir "$RV_LOCK" 2>/dev/null
  }
  trap rv_on_exit EXIT INT TERM
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
  cp "$file" "$bak"
  if ! eval "$mut"; then
    echo "$tag 改动命令失败，跳过（不算红也不算绿）"
    RV_BAD=$((RV_BAD + 1))
    cp "$bak" "$file"
    return
  fi
  if [ "$(md5 -q "$file")" = "$(md5 -q "$bak")" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
  case "$file" in
    *.py)
      if ! .venv/bin/python -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())" "$file" 2>/dev/null; then
        echo "$tag ★突变把文件改崩了★：$desc —— 语法都不通了，这种红不是牙，重写这一刀的模式"
        RV_BAD=$((RV_BAD + 1))
        cp "$bak" "$file"
        return
      fi
      ;;
  esac
  hitline=$(diff "$bak" "$file" | grep -E '^[<>]' | head -2 | sed 's/^\([<>]\) /\1/' | tr '\n' '|')
  echo "     这一刀动的是：${hitline}"
  RV_LIVE_FILE="$file"; RV_LIVE_BAK="$bak"
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
  RV_LIVE_FILE=""; RV_LIVE_BAK=""
  if [ "$(md5 -q "$file")" != "$(md5 -q "$bak")" ]; then
    echo "$tag 还原失败，检查 $file"
    RV_BAD=$((RV_BAD + 1))
  fi
}

rv_status() {  # 收尾一行：四类不算数与★假绿★都让退出码非零
  echo "=== 合计：红 $RV_RED ／ 明写不红 $RV_SOFT_GREEN ／ ★假绿★ $RV_FAKE_GREEN ／ 不算数 $RV_BAD ==="
  if [ "$RV_FAKE_GREEN" -gt 0 ] || [ "$RV_BAD" -gt 0 ]; then
    return 1
  fi
  return 0
}
