#!/bin/bash
# 反向验证（举报台账读取侧，#181／站长 2026-10-10 那句"把没做的全部做完"里剩下的那半）：
# 逐条把 `services/report_ledger.py` 与 `probes/读-举报台账.py` 的实现改坏，确认对应的判据真的会红。
# 全程 cp 备份 + cp 还原，**不碰 git**（`git checkout --` 在这套链里出过事，见记忆里那一条）。
#
# A～L 打在台账那一个纯函数上（去重、NULL 那一档、页面状态三档、排序两档含空值兜底、理由分布、
# 原话封顶与取尾、归组边界），
# M～O 打在探针的展示卫生那一个函数上（换行与控制字符）。为什么展示也要挨刀：`detail` 是那张
# **公开表单**收回来的自由文本，而 §8.193 第 2 条那条教训就是"排障与展示也算实现"，同一条路数。
#
# ⚠ 这个脚本自己的说明文字里不许出现反引号：`run` 用 `eval` 跑，那会被当成命令替换。
#
# 判据口径与前几批完全一致（阶段2-2／2-2b／2-3）：
# - 每条突变先 `--collect-only` 数这根针覆盖几条用例。`pytest -k` 空匹配的退出码是 5，
#   少了这一步，脚本会自己造★假绿★。
# - 每条突变再比 md5 证明改动真在盘上，并把 diff 头两行贴进回执（证明落的是意图那一行，不是别的行）。
# - 红了才算数；绿了就是★假绿★，记进文档，不悄悄改掉那条判据。
#
# 最后一档 probe_gate 不属于 pytest：它验的是**探针自己那道覆盖闸门**有没有牙——台账如果悄悄
# 漏掉一类行（C 那一刀的形状），脚本必须 exit 1，而不是打出一本少了一页的台账。现网那张表
# 今天是空的，空库跑一万次也读不到这一发，所以这里用一份一次性库把它跑出来。
#
# 一条**没做**的突变，写在这里而不是假装做过：`test_现网这一列读回来永远是_naive` 钉的是
# SQLAlchemy＋SQLite 的行为，不是本仓任何一个字符——没有任何一刀能把它弄红（除了把这条断言自己
# 删掉）。它的第一版是一条**假断言**（"naive 与 aware 混着排不许崩"，前提在这套库里根本造不出来），
# 10-10 拿 F 刀实跑才撞出来：改坏之后 1 passed。所以 F 现在打的是空值兜底那一支，而这条只钉事实。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
LR=app/services/report_ledger.py
PB=probes/读-举报台账.py
GATE_DB=/tmp/ledger-gate.db
mkdir -p /tmp/rv-bak6

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  local hits
  hits=$(eval "$PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    return
  fi
  cp "$file" "/tmp/rv-bak6/$tag"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过（不算红也不算绿）"; cp "/tmp/rv-bak6/$tag" "$file"; return; fi
  if [ "$(md5 -q "$file")" = "$(md5 -q /tmp/rv-bak6/$tag)" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    return
  fi
  # md5 只证明"改了"，证明不了"改坏了还能编译"。少了这一道，一处语法错会让整条针**全红**，
  # 而读的人把它当成"这一刀有牙"——那是这套链里最容易骗自己的一种红（前一刀的教训在 §8.192）。
  if ! .venv/bin/python -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())" "$file" 2>/dev/null; then
    echo "$tag ★突变把文件改崩了★：$desc —— 语法都不通了，这条红不算牙，重写这一刀的模式"
    cp "/tmp/rv-bak6/$tag" "$file"
    return
  fi
  local hitline
  hitline=$(diff "/tmp/rv-bak6/$tag" "$file" | grep -E '^[<>]' | head -2 | sed 's/^\([<>]\) /\1/' | tr '\n' '|')
  echo "     这一刀动的是：${hitline}"
  if eval "$PY -k '$needle'" >/tmp/rv-out6 2>&1; then
    echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out6 | sed 's/^/      /'
  else
    echo "$tag 红（符合预期，针覆盖 $hits 条）：$desc"
  fi
  cp "/tmp/rv-bak6/$tag" "$file"
  if [ "$(md5 -q "$file")" != "$(md5 -q /tmp/rv-bak6/$tag)" ]; then
    echo "$tag 还原失败，检查 $file"
  fi
}

# ── 台账那一个纯函数 ───────────────────────────────────────────────
run A "去重整个撤掉（人数退回点击次数，台账按它排的那一档就废了）" \
  "同一个人刷三次折成一档但条数照给" \
  "perl -pi -e 's/^            reporters=len\\(named\\) \\+ unknown,/            reporters=len(items),  # rv/' $LR" "$LR"

run B "NULL 折成同一个未知的人（少报人数，正是最坏那种错）" \
  "bucket为空时每行各算一个人" \
  "perl -pi -e 's/^        unknown = sum\\(1 for r in items if r\\[2\\] is None\\)/        unknown = min(1, sum(1 for r in items if r[2] is None))  # rv/' $LR" "$LR"

run C "把台账的边界收成\"现在还公开着的那一类\"（撤掉的与从来不存在的整批消失）" \
  "撤掉的码不许从台账上消失 or 三档各读对各" \
  "perl -pi -e 's/^    for token, items in grouped\\.items\\(\\):/    for token, items in ((t, i) for t, i in grouped.items() if states.get(t) == PAGE_LIVE):  # rv/' $LR" "$LR"

run D "页面状态不再现查（谁都读不出那一篇已经撤了）" \
  "三档各读对各" \
  "perl -pi -e 's/^            page_state=states\\.get\\(token, PAGE_NO_CODE\\),/            page_state=PAGE_LIVE,  # rv/' $LR" "$LR"

run E "主排序反过来（最没人举报的那篇排进第一屏）" \
  "人多的一篇排在前面" \
  "perl -pi -e 's/^    out\\.sort\\(key=lambda g: g\\.reporters, reverse=True\\)/    out.sort(key=lambda g: g.reporters)  # rv/' $LR" "$LR"

run F "空值那一支兜底撤掉（有一行 created_at 是 NULL 就整本台账 AttributeError）" \
  "最近时间读空的那一组不许崩也不许占前排" \
  "perl -pi -e 's/key=lambda g: g\\.latest_at\\.isoformat\\(\\) if g\\.latest_at else \"\"/key=lambda g: g.latest_at.isoformat()/' $LR" "$LR"

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

# ── 探针里那一个展示函数 ──────────────────────────────────────────
run M "控制字符那一道闸门撤掉（NUL 与 ESC 原样吐进终端）" \
  "其余控制字符换成可见码而不是原样吐出" \
  "perl -pi -e 's/^        elif 0x20 <= ord\\(ch\\) and ord\\(ch\\) != 0x7F:/        elif True:  # rv/' $PB" "$PB"

run N "可见映射撤掉（换行被打成 <0a>，读的人看不出那一格本来是换行）" \
  "换行不许原样进终端" \
  "perl -pi -e 's/^        mapped = _CTRL\\.get\\(ch\\)$/        mapped = None  # rv/' $PB" "$PB"

run O "整句改走 repr（对得起卫生，可中文原话变成一串 \\uXXXX，等于没读）" \
  "中文原话不许被转义成读不懂的样子" \
  "perl -pi -e 's/^    return \"\"\\.join\\(out\\)\\[:limit\\]$/    return repr(\"\".join(out))[:limit]  # rv/' $PB" "$PB"

# ── 探针自己那道覆盖闸门的牙 ──────────────────────────────────────
probe_gate() {
  rm -f "$GATE_DB"
  if ! DATABASE_URL="sqlite:///$GATE_DB" JWT_SECRET_KEY=gate-only-not-a-real-one EXTRACT_PROVIDER=none \
    .venv/bin/python -c '
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
  cp "$LR" /tmp/rv-bak6/GATE
  perl -pi -e 's/^    for token, items in grouped\.items\(\):/    for token, items in ((t, i) for t, i in grouped.items() if states.get(t) == PAGE_LIVE):  # rv/' "$LR"
  if [ "$(md5 -q "$LR")" = "$(md5 -q /tmp/rv-bak6/GATE)" ]; then
    echo "gate ★突变没落盘★：C 那一刀没写进 $LR，这一档不算数"
    cp /tmp/rv-bak6/GATE "$LR"
    return
  fi
  DATABASE_URL="sqlite:///$GATE_DB" JWT_SECRET_KEY=gate-only-not-a-real-one .venv/bin/python "$PB" >/tmp/rv-gate-mut 2>&1
  local after=$?
  cp /tmp/rv-bak6/GATE "$LR"
  if [ "$(md5 -q "$LR")" != "$(md5 -q /tmp/rv-bak6/GATE)" ]; then echo "gate 还原失败，检查 $LR"; fi

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

echo "=== 全部还原后复跑这一批的尺子，必须全绿 ==="
$PY tests/test_report_ledger.py tests/test_landing_page.py 2>&1 | tail -1
