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
RV_TRACE=""      # 打断/还原失败的持久痕迹：不许写进会被删掉的 $RV_OUT
RV_NAME=""
RV_DIRTY=0       # 1＝有文件没还原干净：收尾必须非零退出，且备份与输出都不许删
RV_GLOBAL=""     # 六支链共用的那一道全局锁（链名各自的锁挡不住共用文件被投毒）
RV_WIDE=0        # 一次动 3 行以上的刀：不改变结论，只是提醒"报告那两行是截断的"

rv_init() {  # rv_init <锁名>：先认 cwd，再抢锁、挂 trap，最后才开临时目录
  # 这道闸必须在抢锁**之前**：那时 trap 还没挂，退了会留下一把没人清的锁（反证做在
  # `/tmp/aud3m/lib-afterlock.sh`：把这段搬到 `mkdir` 之后，同样 exit 1，但锁真留在盘上）。
  # 为什么要认 cwd——`rv_run` 里 ast 闸写的是相对路径 `.venv/bin/python`：cwd 不对时它找不到解释器。
  # 报出来的**标签**取决于 `RV_PY`：默认（相对）值时是★突变把文件改崩了★，`RV_PY` 被覆盖成绝对路径时
  # 第一条先报★针没扎到用例★（`--collect-only` 先撞在错的 rootdir 上）。两种都是全部"不算数"＋退出码非零。
  if [ ! -x .venv/bin/python ]; then
    echo "rv_init：当前目录下没有可执行的 .venv/bin/python —— 这一套要在 backend/ 里跑（用法见文件头）。没抢锁、没动任何文件。pwd=$(pwd)"
    exit 1
  fi
  local lock="/tmp/反向验证-$1.lock"
  rv_note() {  # 屏上一份、痕迹文件一份。第四轮审计实测：被打断那几行原本只写进 `$RV_OUT`，
    # 而 `rv_cleanup` 随即把那个文件 `rm -f` 掉——**报告自我销毁**，屏幕上停在"这一刀动的是"，
    # 人看不出还原成没成。所以关键话必须落到一个不会被删的地方。
    echo "$@"
    [ -n "$RV_TRACE" ] && printf '%s\n' "$*" >>"$RV_TRACE" 2>/dev/null
    return 0
  }
  rv_restore_now() {
    [ -n "$RV_LIVE_FILE" ] || return 0
    if [ -z "$RV_LIVE_BAK" ] || [ ! -f "$RV_LIVE_BAK" ]; then
      rv_note "!! 在册文件 $RV_LIVE_FILE 的备份不见了——这一条没还原成，盘面别信"
      RV_DIRTY=1
      return 1
    fi
    cp "$RV_LIVE_BAK" "$RV_LIVE_FILE" 2>>"${RV_TRACE:-/dev/null}"
    # 还原之后必须验 md5 才敢注销登记：整套链里唯一那句"我把它复原了"原本恰好是唯一一次
    # 不做校验的还原（`rv_run` 收尾那一次是有校验的）。目标只读时 `cp` 失败，原来照样打"还原了"。
    if [ "$(md5 -q "$RV_LIVE_FILE")" = "$(md5 -q "$RV_LIVE_BAK")" ]; then
      rv_note "!! trap 还原了 $RV_LIVE_FILE（这一条刀没跑完就被打断）"
      RV_LIVE_FILE=""; RV_LIVE_BAK=""
    else
      rv_note "!! trap 还原**失败**：$RV_LIVE_FILE 还是改坏的那一版，备份在 $RV_LIVE_BAK"
      RV_DIRTY=1
    fi
  }
  rv_cleanup() {
    if [ "$RV_DIRTY" = "1" ] || [ -n "$RV_LIVE_FILE" ]; then
      # 还原没做成就不能删备份——2026-10-10 那次实测：TERM 撞上"目标已只读"，文件留在改坏的
      # `x = 2`、备份目录被 rm -rf、屏幕一个字没打，那一版从此没法恢复。
      [ -n "$RV_BAKDIR" ] && rv_note "!! 备份目录留在 $RV_BAKDIR（这次不删），照它把文件复原再跑下一支"
      [ -n "$RV_OUT" ] && rv_note "!! 那趟 pytest 的输出留在 $RV_OUT（这次不删）"
    else
      [ -n "$RV_BAKDIR" ] && rm -rf "$RV_BAKDIR"
      [ -n "$RV_OUT" ] && rm -f "$RV_OUT"
    fi
    [ -n "$RV_LOCK" ] && rmdir "$RV_LOCK" 2>/dev/null
    [ -n "$RV_GLOBAL" ] && rmdir "$RV_GLOBAL" 2>/dev/null
    RV_BAKDIR=""; RV_OUT=""; RV_LOCK=""; RV_GLOBAL=""
  }
  rv_on_exit() {
    rv_restore_now
    rv_cleanup
    if [ "$RV_DIRTY" = "1" ]; then
      echo "!! 收尾：有文件没还原干净（退出码顶成 1），先按上面那两行的路径复原"
      exit 1
    fi
  }
  # 被打断必须**停在这儿**，光靠 EXIT 那份不够：bash 里 INT/TERM 的 handler 跑完会从被中断的那条语句
  # **继续往下**跑，而 rv_cleanup 已经把备份目录与锁清掉了——于是后面每一条刀都在没有备份的真源文件上跑。
  # 这是 10-10 深夜那支独立审计实测出来的（中途发一次 TERM：三份都留在盘上、锁也被删，第二支随即抢锁并发跑）。
  rv_on_signal() {
    rv_restore_now
    rv_cleanup
    rv_note "!! 被打断：这一支到此为止；还原成没成看上面那几行（有痕迹文件 $RV_TRACE）"
    exit 130
  }
  RV_NAME="$1"
  RV_TRACE="/tmp/反向验证-$1.痕迹"
  if [ -s "$RV_TRACE" ]; then
    echo "上一支「$RV_NAME」留过打断／还原失败的痕迹（$RV_TRACE），内容如下："
    sed 's/^/      /' "$RV_TRACE"
    echo "先照它核对：在 backend/ 跑「git status --porcelain .」，除了 probes/ 自己不该有别的文件。"
    echo "确认干净之后带环境变量 RV_ACK_TRACE=1 再来一遍。"
    # 变量名必须是 ASCII：bash 3.2 里 `${RV_已看过痕迹:-}` 报 "bad substitution"，
    # 而它只是在函数中间报错、不会终止脚本——rv_init 当场断在这里，调用方却继续往下跑每一条刀。
    if [ -z "${RV_ACK_TRACE:-}" ]; then
      exit 1
    fi
    mv "$RV_TRACE" "$RV_TRACE.上一轮-$(date +%s)"
  fi
  # 全局锁：六支链的**链名锁**只挡同名的那一支，而现数出来有 7 个文件被两三支共用
  # （auth.py／routes/user.py／services/accounts.py／services/deletion.py／linking.py／
  #  apple_identity.py／api/v1/account.py）。两支并发时，后一支抢到的备份可能是前一支改坏的那一版，
  # 还原就把它当"干净版"写回去——第四轮审计用两支合成链实测：两边都打"红（符合预期）"、退出码都 0。
  RV_GLOBAL="/tmp/反向验证.全局锁"
  if ! mkdir "$RV_GLOBAL" 2>/dev/null; then
    echo "另一支反向验证正在跑（$RV_GLOBAL 已经存在）——这些脚本改的是仓库里的真源文件，且有 7 个文件是几支共用的，不并发跑。"
    echo "确认没有别的过程在跑之后：rmdir $RV_GLOBAL 再来。"
    exit 1
  fi
  if ! mkdir "$lock" 2>/dev/null; then
    rmdir "$RV_GLOBAL" 2>/dev/null   # 全局锁是我刚抢的，这一支不跑了就得还回去
    echo "同名的一支正在跑（$lock 已经存在）——确认没别的过程在跑之后：rmdir $lock 再来。"
    exit 1
  fi
  RV_LOCK="$lock"
  # trap 紧跟在"我开始拥有这两把锁"之后挂，临时目录在 trap 之后才造：中间任何一步被打断，
  # 都不会留下没人负责的锁或 `/tmp/rv-lib.*` 空目录（10-10 深夜盘上就有四个这样的遗留目录）。
  trap rv_on_exit EXIT
  trap rv_on_signal INT TERM
  RV_BAKDIR=$(mktemp -d /tmp/rv-lib.XXXXXX)
  RV_OUT=$(mktemp /tmp/rv-lib-out.XXXXXX)
}

rv_run() {  # rv_run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  # 调用前设 RV_SOFT=1 表示"这一条**明写了撤了不红**"（双层防线、或另一道等强的那一种）：
  # 报告照打、但不计入★假绿★也不让 rv_status 变红。用完自己归零，不许漏给下一条。
  local soft="${RV_SOFT:-0}"
  RV_SOFT=0
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  local hits bak failed hitline
  # `rv_init` 没跑就 `>` 到空的 `$RV_OUT`：bash 报一句"重定向失败"、pytest **一条都没执行**，
  # 而这一支往下读的是"eval 非零 = 红"，于是打出 `红（符合预期，针覆盖 1 条、FAILED  条）`
  # 并把 `rv_status` 留在 0（实测复现过）。所以先问备份目录与输出文件在不在，再谈跑不跑。
  if [ -z "$RV_BAKDIR" ] || [ ! -d "$RV_BAKDIR" ] || [ -z "$RV_OUT" ]; then
    echo "$tag ★rv_init 没跑★：备份目录或输出文件没备好（RV_BAKDIR='$RV_BAKDIR' RV_OUT='$RV_OUT'），这一刀不跑"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
  hits=$(eval "$RV_PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
  bak="$RV_BAKDIR/$tag"
  # 同一支里标号不许重复：备份文件名**就是**标号，第二条会把第一条的备份覆盖掉。那种情况下
  # 第一条要是没还原成功，trap 手里那份"干净版"其实是别的文件的版本——还原还原到半路。
  # 10-10 加保留期那五把刀时真撞过一次（新起的 `W` 与这支里已有的 `W` 同号），两条都红，当场看不出来。
  if [ -e "$bak" ]; then
    echo "$tag ★标号重复★：$bak 已经在册（这一支里这个标号用过一次了），这一刀不跑"
    RV_BAD=$((RV_BAD + 1))
    return
  fi
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
  # 只列前 2 行是**截断的报告**，而"这一刀动的是"听起来像完整清单。实测有 11 条刀一次动 4 行以上，
  # 最坏的一种是锚文本在目标文件里出现多次、替换把每一处都改了，而屏幕上只看得到前两行。
  # 所以把实际行数一起报出来：改动面比"一处"大，就得自己去看一眼是不是想要的。
  local nlines
  nlines=$(diff "$bak" "$file" | grep -cE '^[<>]')
  echo "     这一刀动的是：${hitline}（共 $nlines 行）"
  if [ "$nlines" -gt 2 ]; then
    echo "     ⚠ 这条刀动了 $nlines 行，屏幕上只列了前 2 行 —— 锚文本可能在文件里出现不止一次，去核一下改动面对不对"
    RV_WIDE=$((RV_WIDE + 1))
  fi
  local code=0
  if eval "$RV_PY -k '$needle'" >"$RV_OUT" 2>&1; then code=0; else code=$?; fi
  if [ "$code" -eq 0 ]; then
    if [ "$soft" = "1" ]; then
      echo "$tag 绿（这一条**明写了撤了不红**，针覆盖 $hits 条）：$desc"
      RV_SOFT_GREEN=$((RV_SOFT_GREEN + 1))
    else
      echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
      tail -3 "$RV_OUT" | sed 's/^/      /'
      RV_FAKE_GREEN=$((RV_FAKE_GREEN + 1))
    fi
  else
    # 证据不只 `FAILED` 一种：用例在**跑起来之后**炸（fixture／setup 里抛异常）时 pytest 打的是
    # `ERROR path::test_name`、退出码 1，一条 FAILED 也没有。原来那种只数 `^FAILED` 的写法会把
    # 这一种真牙报成★红得不明不白★，于是有人去改刀、而不是去认它本来就红了。
    # 反过来，用法错／解释器找不到（退出码 2/3/4/5）那种连 ERROR 行都没有，仍旧算"不是牙"。
    failed=$(grep -acE '^FAILED|^ERROR ' "$RV_OUT" 2>/dev/null)
    [ -z "$failed" ] && failed=0   # 空串会让下面那句 `-eq` 报"integer expression expected"然后掉进"红"
    if [ "$failed" -eq 0 ]; then
      echo "$tag ★红得不明不白★（针覆盖 $hits 条，退出码 $code）：$desc —— 非零退出但一条 FAILED／ERROR 都没有，那不是牙"
      case "$code" in
        2|3|4|5) echo "      退出码 $code 属「这一趟根本没跑起来」那一家（用法错／收集中断／内部错／-k 那条针运行时没匹配上）" ;;
      esac
      tail -3 "$RV_OUT" | sed 's/^/      /'
      RV_BAD=$((RV_BAD + 1))
    else
      if [ "$soft" = "1" ]; then
        echo "$tag 红（这一条原本**明写撤了不红**，现在它有牙了——把那条注释撤掉）：$desc"
      else
        echo "$tag 红（符合预期，针覆盖 $hits 条、FAILED／ERROR $failed 条）：$desc"
      fi
      RV_RED=$((RV_RED + 1))
      grep -aE '^FAILED|^ERROR ' "$RV_OUT" | head -2 | sed 's/^/      /'
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
  local out summary last code
  out=$(eval "$RV_PY $*" 2>&1); code=$?
  # 取的**不是"最后一行"，是"带计数那一行"**：任何在 pytest 之后才冒出来的噪声（夹具挂的 atexit、
  # 外层命令的尾巴）会把汇总行顶掉，实测能取出 `LATE-NOISE …` 这种一句数都没有的行。
  summary=$(printf '%s\n' "$out" | grep -aE '[0-9]+ (passed|failed|error)([^a-z]|$)' | tail -1)
  last=$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -1)
  if [ "$code" -ne 0 ]; then
    echo "★还原复跑不绿★（退出码 $code）：${summary:-$last}"
    case "$code" in
      2|4|5|126|127)
        echo "      退出码 $code 属「这一趟根本没跑起来」那一家（用法错／文件不存在／-k 那条针没匹配上／找不到解释器），「改坏了没还原」是另一回事"
        ;;
      *)
        echo "      要么这一支把盘上的东西改坏了没还原干净，要么判据本来就红"
        ;;
    esac
    printf '%s\n' "$out" | grep -aE '^FAILED|^ERROR ' | head -3 | sed 's/^/      /'
    RV_BAD=$((RV_BAD + 1))
  else
    # 退出码 0 **不等于有条用例跑过**：全部 skip、或这一支压根没收集到东西，都是 0。
    # 而这一句要报告的是"还原之后判据仍然绿"，一条 passed 都没有时这句话是空的。
    if printf '%s' "$summary" | grep -qaE '[0-9]+ passed'; then
      echo "退出码 0 ｜ $summary"
    else
      echo "★还原复跑一条 passed 都没有★（退出码 0）：${summary:-$last} —— 「还原后全绿」这句不算数，先问这一支怎么全被跳过了"
      RV_BAD=$((RV_BAD + 1))
    fi
  fi
}

rv_status() {  # 收尾一行：四类不算数与★假绿★都让退出码非零
  echo "=== 合计：红 $RV_RED ／ 明写不红 $RV_SOFT_GREEN ／ ★假绿★ $RV_FAKE_GREEN ／ 不算数 $RV_BAD ／ 宽刀 $RV_WIDE（不改结论，只报改动面）==="
  if [ "$RV_FAKE_GREEN" -gt 0 ] || [ "$RV_BAD" -gt 0 ]; then
    return 1
  fi
  return 0
}
