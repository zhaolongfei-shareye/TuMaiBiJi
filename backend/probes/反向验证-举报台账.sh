#!/bin/bash
# 反向验证（举报台账读取侧，#181／站长 2026-10-10 那句"把没做的全部做完"里剩下的那半）：
# 逐条把 `services/report_ledger.py` 与 `probes/读-举报台账.py` 的实现改坏，确认对应的判据真的会红。
# 全程 cp 备份 + cp 还原，**不碰 git**（`git checkout --` 在这套链里出过事，见记忆里那一条）。
#
# A～L 打在台账归组那一段（去重、NULL 那一档、台账边界、状态四档、排序两档、理由分布、
# 原话封顶与取尾、归组键、数据侧不许清洗），M、N、O、U、V 打在探针的展示卫生那一个函数上，
# P～T 是 10-10 那轮双支审计补的牙（跨篇去重、瞬间而不是墙上时间、naive 与 aware 混排、
# 字段集合、hidden 进了计算），W 是同一晚自审第三轮补的（台账那发 select 里不许混 ORM 实体）。
# 名单里第一版写过"M～W 全在探针那一支"——数错了，W 动的是台账。
#
# ⚠ 这个脚本自己的说明文字里不许出现反引号：`run` 用 `eval` 跑，那会被当成命令替换。
#
# 判据口径与前几批一致（阶段2-2／2-2b／2-3），但这一支比那几支多四道闸——三条是审计撞出来的，
# 一条是站长这条链自己定过的：
# ① 每条突变先 `--collect-only` 数这根针覆盖几条用例（`pytest -k` 空匹配退出码是 5，
#    少了这一步脚本会自己造★假绿★）；
# ② 比 md5 证明改动真落盘，并把 diff 头两行贴进回执（证明落的是意图那一行，不是别的行）；
# ③ **改坏之后必须还编译得过**——语法崩掉的红是"整条针全红"，读起来极像"这一刀有牙"
#    （这一条是 10-10 那支审计自己在它的沙箱里撞上来的，它撞到的那一发在我这一支同样会中）；
# ④ **红还得红在该扎的那条判据上**——collection error、夹具报错（`no such table`）都是非零退出，
#    光看退出码会把"环境坏了"记成"刀有牙"。所以判红之后再 grep 一遍 FAILED 的行名。
# ⑤ 这一支用 `perl -pi` **直接改仓库里的真源文件**，中途被打断就会把坏文件留在工作树里，
#    而这个工作树**还有另一路会话在同时提交**。所以：`mkdir` 抢一把锁（并发直接不跑），
#    外加 `trap`：EXIT／INT／TERM 都还原。上一轮就有一位审计员因为我这边正在突变而读到坏文件。
#
# 最后一档 probe_gate 不属于 pytest：它验的是**探针自己那道覆盖闸门**有没有牙——台账如果悄悄
# 漏掉一类行（C 那一刀的形状），脚本必须 exit 1，而不是打出一本少了一页的台账。现网那张表
# 最后一次读数是 0 行（§8.185，10-09 23:45），空库跑一万次也读不到这一发，所以用一次性库造。
#
# 两条**没做**的突变，写在这里而不是假装做过：
# ① `test_走ORM写入的这一列读回来是_naive_且丢偏移不换算` 与
#    `test_显式写_created_at_为_None_会被_server_default_填上` 钉的是 SQLAlchemy 的行为，
#    本仓没有任何一个字符能把它俩弄红（除了把断言自己删掉）——它们是**前提**，不是尺子。
# ② 状态四档里"已撤回"那一支（`elif not active`）没有单独一刀：撤掉与过期两档共用的
#    是那一段 if 链，P～T 之外再切一刀的成本与 D 刀重复（D 已经把整条链的后两档废掉）。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
LR=app/services/report_ledger.py
PB=probes/读-举报台账.py
GATE_DB=/tmp/ledger-gate.db
LOCK=/tmp/反向验证-举报台账.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "另一支正在跑这一套（$LOCK 已经存在）——它改的是仓库里的真源文件，不并发跑。"
  echo "确认没有别的过程在跑之后：rmdir $LOCK 再来。"
  exit 1
fi
BK=$(mktemp -d /tmp/rv-ledger.XXXXXX)
LIVE_FILE=""   # 当前那一条刀动过的真源文件
LIVE_BAK=""    # 它动手之前的备份

restore_now() {  # trap 用：只还原当前那一条刀动过的文件；没动过就什么都不做
  if [ -n "$LIVE_FILE" ] && [ -n "$LIVE_BAK" ] && [ -f "$LIVE_BAK" ] && [ -f "$LIVE_FILE" ]; then
    cp "$LIVE_BAK" "$LIVE_FILE"
    echo "!! trap 还原了 $LIVE_FILE（这一条刀没跑完就被打断）"
    LIVE_FILE=""; LIVE_BAK=""
  fi
}
on_exit() { restore_now; rm -rf "$BK"; rmdir "$LOCK" 2>/dev/null; }
trap on_exit EXIT INT TERM

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  local hits bak
  hits=$(eval "$PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    return
  fi
  bak="$BK/$tag"
  cp "$file" "$bak"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过（不算红也不算绿）"; cp "$bak" "$file"; return; fi
  if [ "$(md5 -q "$file")" = "$(md5 -q "$bak")" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    return
  fi
  if ! .venv/bin/python -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())" "$file" 2>/dev/null; then
    echo "$tag ★突变把文件改崩了★：$desc —— 语法都不通了，这种红不是牙，重写这一刀的模式"
    cp "$bak" "$file"
    return
  fi
  local hitline
  hitline=$(diff "$bak" "$file" | grep -E '^[<>]' | head -2 | sed 's/^\([<>]\) /\1/' | tr '\n' '|')
  echo "     这一刀动的是：${hitline}"
  LIVE_FILE="$file"; LIVE_BAK="$bak"
  if eval "$PY -k '$needle'" >/tmp/rv-out6 2>&1; then
    echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out6 | sed 's/^/      /'
  else
    local failed
    failed=$(grep -ac '^FAILED' /tmp/rv-out6)
    if [ "$failed" -eq 0 ]; then
      echo "$tag ★红得不明不白★：$desc —— 退出码非零但一条 FAILED 都没有（collection error 或夹具炸），"
      echo "     这不是这一刀的牙，先修环境再跑。尾两行："
      tail -3 /tmp/rv-out6 | sed 's/^/      /'
    else
      echo "$tag 红（符合预期，针覆盖 $hits 条、FAILED $failed 条）：$desc"
      grep -a '^FAILED' /tmp/rv-out6 | head -2 | sed 's/^/      /'
    fi
  fi
  cp "$bak" "$file"
  LIVE_FILE=""; LIVE_BAK=""
  if [ "$(md5 -q "$file")" != "$(md5 -q "$bak")" ]; then
    echo "$tag 还原失败，检查 $file"
  fi
}

# ── 台账归组那一段 ────────────────────────────────────────────────
run A "去重整个撤掉（人·天档退回点击次数，台账按它排的那一档就废了）" \
  "同一个人一天里刷三次折成一档但条数照给" \
  "perl -pi -e 's/^            reporter_days=len\\(named\\) \\+ unknown,/            reporter_days=len(items),  # rv/' $LR" "$LR"

run B "NULL 折成同一个未知的人（少报，正是最坏那种错）" \
  "bucket为空时每行各算一个人" \
  "perl -pi -e 's/^        unknown = sum\\(1 for r in items if r\\[2\\] is None\\)/        unknown = min(1, sum(1 for r in items if r[2] is None))  # rv/' $LR" "$LR"

run C "把台账的边界收成\"现在还开着的那一类\"（撤掉的与从来不存在的整批消失）" \
  "撤掉的码不许从台账上消失 or 四档各读对各" \
  "perl -pi -e 's/^    for token, items in grouped\\.items\\(\\):/    for token, items in ((t, i) for t, i in grouped.items() if i[0][5]):  # rv/' $LR" "$LR"

run D "状态那一档不再问现成那个出处（早打不开的页被台账说成公开中）" \
  "四档各读对各" \
  "perl -pi -e 's/^        elif is_expired_at\\(expires_at\\):/        elif False:  # rv/' $LR" "$LR"

run E "主排序反过来（最没人在意的那篇排进第一屏）" \
  "人多的那篇排在前面" \
  "perl -pi -e 's/^    out\\.sort\\(key=lambda g: g\\.reporter_days, reverse=True\\)/    out.sort(key=lambda g: g.reporter_days)  # rv/' $LR" "$LR"

run F "空值那一支兜底撤掉（有一行 created_at 是 NULL 就整本台账 AttributeError）" \
  "最近时间读空的那一组不许崩也不许占前排" \
  "perl -0pi -e 's/    if value is None:\\n        return \"\"\\n//' $LR" "$LR"

run G "理由分布不累加（每篇每个理由都只算一件，排优先级没了依据）" \
  "理由分布按那一列计数" \
  "perl -pi -e 's/^            reasons\\[r\\[1\\]\\] = reasons\\.get\\(r\\[1\\], 0\\) \\+ 1/            reasons.setdefault(r[1], 1)  # rv/' $LR" "$LR"

run H "原话封顶撤掉（台账一行放不下长篇，等于把整张表打印一遍）" \
  "封顶取的是写入顺序里最后那几条" \
  "perl -pi -e 's/^            samples=tuple\\(noted\\[-SAMPLE_LIMIT:\\]\\),/            samples=tuple(noted),  # rv/' $LR" "$LR"

run I "原话取头不取尾（一个人反复举报时，读到的是最初那几句）" \
  "封顶取的是写入顺序里最后那几条" \
  "perl -pi -e 's/noted\\[-SAMPLE_LIMIT:\\]/noted[:SAMPLE_LIMIT]/' $LR" "$LR"

run J "空白原话也收进来（表单那栏写着「可以不填」，印出来却像有人写了话）" \
  "没写补充说明的那些不进原话" \
  "perl -pi -e 's/^        noted = \\[r\\[4\\]\\.strip\\(\\) for r in items if r\\[4\\] and r\\[4\\]\\.strip\\(\\)\\]/        noted = [r[4] for r in items if r[4] is not None]  # rv/' $LR" "$LR"

run K "归组的键切成前缀（不同篇的举报互相并档，人数与原话都串）" \
  "原话按篇归组不许串到别篇上" \
  "perl -pi -e 's/^        grouped\\.setdefault\\(row\\[0\\], \\[\\]\\)\\.append\\(row\\)/        grouped.setdefault(row[0][:4], []).append(row)  # rv/' $LR" "$LR"

run L "台账里也做一次清洗（换行被抹成空格，交出去的就不是举报人写的那句话）" \
  "台账交出去的是原样文本_清洗在脚本那一层" \
  "perl -pi -e 's/^        noted = \\[r\\[4\\]\\.strip\\(\\) for r in items if r\\[4\\] and r\\[4\\]\\.strip\\(\\)\\]/        noted = [r[4].strip().replace(chr(10), \" \") for r in items if r[4] and r[4].strip()]  # rv/' $LR" "$LR"

# ── 10-10 双支审计补的五把刀（P～T）───────────────────────────────
run P "把去重集合整块提到循环外面（跨篇全局折一次——原版那条判据对这种写法没有牙）" \
  "去重的作用域是一篇而不是全站" \
  "perl -pi -e 's/named = \\{r\\[2\\] for r in items if/named = {r[2] for r in rows if/' $LR && perl -pi -e 's/unknown = sum\\(1 for r in items if/unknown = sum(1 for r in rows if/' $LR" "$LR"

run Q "aware 不再换算成 UTC（比的是那串墙上字面，不是那个瞬间）" \
  "比的是那个瞬间而不是那串墙上时间" \
  "perl -pi -e 's/^        value = value\\.astimezone\\(timezone\\.utc\\)\\.replace\\(tzinfo=None\\)/        value = value.replace(tzinfo=None)  # rv/' $LR" "$LR"

run R "取最近那一次退回裸日期比较（naive 与 aware 混在一组里当场 TypeError）" \
  "同一篇上混着_naive_与带偏移的行不许崩" \
  "perl -pi -e 's/latest_at=max\\(\\(r\\[3\\] for r in items\\), key=_instant\\),/latest_at=max(r[3] for r in items if r[3] is not None) if any(r[3] for r in items) else None,/' $LR" "$LR"

run S "往台账的格子里再加一格（模块口径写着不读 hidden，却没有尺子守着字段集合）" \
  "台账交出的字段就是那七格" \
  "perl -0pi -e 's/    samples: tuple\\[str, \\.\\.\\.\\] = \\(\\)\\n/    samples: tuple[str, ...] = ()\\n    hidden: bool = False  # rv\\n/' $LR" "$LR"

run T "把 hidden 真读进来并参与人数（那条死列一旦被接线，台账的所有数字都会跟着动）" \
  "置真了也不许改动台账的任何数字" \
  "perl -pi -e 's/Share\\.is_active, Share\\.expires_at,/Share.is_active, Share.expires_at, ShareReport.hidden,/' $LR && perl -pi -e 's/^            reporter_days=len\\(named\\) \\+ unknown,/            reporter_days=len(named) + unknown + sum(1 for r in items if r[7]),  # rv/' $LR" "$LR"

# ── 本批自审补的一把（W）：注释说"只取标量"，纸面话要有牙 ──────────
run W "把 Share 实体混进那一发 select 的列里（注释写着不许，实测整行相等就折行）" \
  "同一个人一天里刷三次折成一档但条数照给" \
  "perl -pi -e 's/Share\\.is_active, Share\\.expires_at,/Share.is_active, Share.expires_at, Share,/' $LR" "$LR"

# ── 探针里那一个展示函数 ──────────────────────────────────────────
run M "控制字符那一道闸门撤掉（NUL 与 ESC 原样吐进终端）" \
  "其余控制字符换成可见码而不是原样吐出" \
  "perl -pi -e 's/^        elif 0x20 <= ord\\(ch\\) and ord\\(ch\\) != 0x7F:/        elif True:  # rv/' $PB" "$PB"

run N "可见映射撤掉（换行被打成 ␀0a，读的人看不出那一格本来是换行）" \
  "换行不许原样进终端" \
  "perl -pi -e 's/^        mapped = _CTRL\\.get\\(ch\\)$/        mapped = None  # rv/' $PB" "$PB"

run O "整句改走 repr（真实理由是它给句子加引号、把换行打成两个字符——不是中文会被转义）" \
  "中文原话不许被转义成读不懂的样子" \
  "perl -pi -e 's/^    rendered = \"\"\\.join\\(out\\)$/    rendered = repr(\"\".join(out))  # rv/' $PB" "$PB"

run U "截断不留记号（500 字的话被静默砍成 120 字，尾巴读起来像原话说完了）" \
  "超长那一句限长而且看得出被截" \
  "perl -pi -e 's/^        return rendered\\[:limit - 1\\] \\+ \"…\"$/        return rendered[:limit]  # rv/' $PB" "$PB"

run V "可见码退回成尖括号写法（举报人自己打一串 <1b> 就能和一个真 ESC 撞成同一个读数）" \
  "可见码的写法不许举报人自己能打出来" \
  "perl -pi -e 's/^            out\\.append\\(f\"␀\\{ord\\(ch\\):02x\\}\"\\)$/            out.append(f\"<{ord(ch):02x}>\")  # rv/' $PB" "$PB"

# ── 探针自己那道覆盖闸门的牙 ──────────────────────────────────────
probe_gate() {
  rm -f "$GATE_DB"
  if ! DATABASE_URL="sqlite:///$GATE_DB" JWT_SECRET_KEY=gate-only-not-a-real-one EXTRACT_PROVIDER=none \
    SEC_CHECK_ENABLED=false .venv/bin/python -c '
from app.db.database import Base, SessionLocal, engine
import app.models.note, app.models.share, app.models.share_report  # 不 import 模型，metadata 是空的
from datetime import datetime, timezone
from app.models.note import Note
from app.models.share import Share
from app.models.share_report import ShareReport

Base.metadata.create_all(bind=engine)
db = SessionLocal()
n = Note(user_id="1", title="gate", source_type="manual", tags=[], key_points=[], key_links=[])
db.add(n)
db.commit()
for tok, active in (("gate-live", True), ("gate-revoked", False)):
    db.add(Share(user_id="1", note_id=n.id, token=tok, title="T", summary="", tags=[],
                 key_points=[], key_links=[], author_name="a", is_active=active))
db.commit()
now = datetime.now(timezone.utc).replace(microsecond=0)
db.add_all([ShareReport(token="gate-live", reason="spam", reporter_bucket="甲", created_at=now),
            ShareReport(token="gate-revoked", reason="spam", reporter_bucket="乙", created_at=now)])
db.commit()
db.close()
' >/dev/null 2>&1; then
    echo "gate ★一次性库造不出来★：这一档不算数"
    return
  fi
  if [ ! -s "$GATE_DB" ]; then echo "gate ★一次性库是空的★：$GATE_DB，这一档不算数"; return; fi

  DATABASE_URL="sqlite:///$GATE_DB" JWT_SECRET_KEY=gate-only-not-a-real-one .venv/bin/python "$PB" >/tmp/rv-gate 2>&1
  local before=$?
  cp "$LR" "$BK/GATE"
  perl -pi -e 's/^    for token, items in grouped\.items\(\):/    for token, items in ((t, i) for t, i in grouped.items() if i[0][5]):  # rv/' "$LR"
  if [ "$(md5 -q "$LR")" = "$(md5 -q "$BK/GATE")" ]; then
    echo "gate ★突变没落盘★：C 那一刀没写进 $LR，这一档不算数"
    return
  fi
  DATABASE_URL="sqlite:///$GATE_DB" JWT_SECRET_KEY=gate-only-not-a-real-one .venv/bin/python "$PB" >/tmp/rv-gate-mut 2>&1
  local after=$?
  cp "$BK/GATE" "$LR"
  if [ "$(md5 -q "$LR")" != "$(md5 -q "$BK/GATE")" ]; then echo "gate 还原失败，检查 $LR"; fi

  if [ "$before" -ne 0 ]; then
    echo "gate ★改坏之前探针就不走绿★：退出码 $before，这一档的对比没有意义（一次性库里两篇都该归上）"
    sed 's/^/      /' /tmp/rv-gate
    return
  fi
  if [ "$after" -eq 0 ]; then
    echo "gate ★假绿★：C 那一刀让撤掉那一篇整批消失，探针仍然 exit 0 —— 覆盖那道闸门没牙"
    sed 's/^/      /' /tmp/rv-gate-mut
  else
    echo "gate 红（符合预期）：漏掉撤掉那一篇时探针 exit=$after，读数：$(grep -o '原始行数 [0-9]* · 台账条数 [0-9]*' /tmp/rv-gate-mut | head -1)"
  fi
}

probe_gate

echo "=== 全部还原后复跑这一批与共享那一格的出处，必须全绿 ==="
# 带上 share/landing 那两份是因为 `is_expired` 这一批被拆成了"标量实现＋ORM 外衣"两层，
# 台账调的是标量那一层——公开页与转存走的还是 `is_expired(share)`，两边都得跟着复跑一次。
# （名单里不写 `test_import_from_share.py`：那份源文件早就不在了，只剩 `tests/__pycache__`
# 里一个 stale 的 .pyc——照它写会一句都不跑，而这批已经在末尾那道"全绿"上撞过一回。）
$PY tests/test_report_ledger.py tests/test_landing_page.py tests/test_share_snapshot.py tests/test_note_flows.py 2>&1 | tail -1
