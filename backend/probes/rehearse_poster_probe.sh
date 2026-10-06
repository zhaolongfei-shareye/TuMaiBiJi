#!/bin/zsh
# 探针彩排：把 poster_templates_live_probe.py 拉起来真打一趟，跑在六种现场上。
#
# 为什么要它：这支探针是"部署完到底生效没生效"的最后一道读数，可它自己上线前一次都没跑过。
# 10-06 第一次彩排就翻出两条：①「表建了、种子没灌」它报**全绿**（接口 0 条 == 库里 0 行，等式成立），
# 而那正是它文件头写着要抓的第③种漏法；②「迁移没跑到、表压根不存在」它不报红，直接抛 SQLAlchemy 堆栈。
# 两条都补了。这个脚本把三种现场的预期脸色钉死：以后谁把探针改弱，这里当场红。
#
# 10-06 又加三档，钉的是**撤回那一路**（操作单 §6）：那条命令要在服务器上写现网库，而机器上没有
# sqlite3 CLI、只能走项目那个 venv——这一段之前只在文档里写着，一次都没跑过。现在从文档里把它**原样抽出来**
# 跑（不是抄一份到脚本里，抄了就变成两份，文档改了脚本还绿着），逐条读回来：接口少一格、那一行还在库里
# （行不删）、点第二次是空写、撤回之后探针**仍该全绿**（撤回对它透明，别指望它报警），
# 最后把全部收成 archived 证明那条"live 不许是零行"的底线不是摆设。
#
# 跑法：cd backend && zsh probes/rehearse_poster_probe.sh
# 只碰 /tmp 下那几个一次性库，**不打现网**（默认那个 BASE 在这里一律被 PROBE_BASE 盖掉）。
set -u
cd "$(dirname "$0")/.." || exit 1          # → backend/
PORT=${REHEARSE_PORT:-8159}
A=/tmp/rehearse_seeded.db; B=/tmp/rehearse_noseed.db; C=/tmp/rehearse_notable.db; D=/tmp/rehearse_undo.db
DOC=../docs/流程-加一套卡片模板.md
rm -f $A $B $C $D
export JWT_SECRET_KEY="$(openssl rand -hex 24)"   # 一次性签名密钥，进程一退就没，不落盘
PY=.venv/bin/python
bad=0

mkdb() {   # mkdb <库文件> <seed|noseed|notable>
  local db=$1 mode=$2
  DATABASE_URL="sqlite:///$db" $PY -m alembic upgrade head >/dev/null 2>&1 || { echo "!! $db 迁移没过去"; exit 1 }
  DATABASE_URL="sqlite:///$db" $PY -c "
import sys; sys.path.insert(0, '.')
from sqlalchemy import text
from app.db.database import SessionLocal, engine
from app.models.user import User
from app.services.poster_templates import seed_poster_templates
db = SessionLocal()
db.add(User(openid='rehearse-once', nickname='彩排专用', language='zh'))
db.commit()
mode = '$mode'
if mode == 'seed':
    r = seed_poster_templates(db)
    assert r['inserted'] and not r['rejected'], r
if mode == 'notable':
    with engine.connect() as c:
        c.execute(text('DROP TABLE poster_templates')); c.commit()
"
}

serve() {   # serve <库文件>：起进程、等 /health，把 PID 留在 $PID
  DATABASE_URL="sqlite:///$1" $PY -m uvicorn app.main:app --host 127.0.0.1 --port $PORT >/tmp/rehearse-uvicorn.log 2>&1 &
  PID=$!
  for i in {1..40}; do
    curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && return 0
    kill -0 $PID 2>/dev/null || { echo "!! 服务进程退了："; tail -3 /tmp/rehearse-uvicorn.log; return 1 }
    sleep 1
  done
  echo "!! 40 秒还没起来"; return 1
}
stop() { [ -n "${PID:-}" ] && kill $PID 2>/dev/null; PID=""
  for i in {1..20}; do lsof -iTCP:$PORT -sTCP:LISTEN -n -P -t >/dev/null 2>&1 || return 0; sleep 1; done; }

expect() {   # expect <现场名> <该绿|该红> <库文件> [要在那行里的关键词]
  local name=$1 want=$2 db=$3 kw=${4:-} out code
  serve "$db" || return 1
  out=$(PROBE_BASE="http://127.0.0.1:$PORT" DATABASE_URL="sqlite:///$db" $PY probes/poster_templates_live_probe.py 2>&1)
  code=$?
  stop
  echo "$out" | grep -E "^✗|条，红" | sed 's/^/   /'
  if [ "$want" = 该绿 ] && [ $code -ne 0 ]; then echo "  ✗ $name：该全绿，实际红了一屏"; bad=1; return; fi
  if [ "$want" = 该红 ] && [ $code -eq 0 ]; then echo "  ✗ $name：这种坏样子探针没抓到（它就是为抓这个写的）"; bad=1; return; fi
  if [ "$want" = 该红 ] && [ -n "$kw" ] && ! echo "$out" | grep -q "$kw"; then
    echo "  ✗ $name：是红了，但没报在「$kw」这一条上——红错了地方等于没红"; bad=1; return; fi
  echo "  ✓ $name（$(echo "$out" | tail -1)）"
}

apilive() {   # apilive <库文件> → "<条数>\t<逗号分隔的 template_id>"（走的是那条真路由，不是读库）
  API="http://127.0.0.1:$PORT/api/poster/templates/" DATABASE_URL="sqlite:///$1" $PY - <<'PY'
import os
import sys
sys.path.insert(0, '.')
import httpx
from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.user import User

db = SessionLocal()
u = db.query(User).filter(User.openid == 'rehearse-once').first()
r = httpx.get(os.environ['API'], headers={'Authorization': f'Bearer {_create_token(u.id)}'}, timeout=20)
rows = r.json() if r.status_code == 200 else []
print(f'{len(rows)}\t' + ','.join(sorted(str(x.get('template_id')) for x in rows)))
PY
}

docflip() {   # docflip <模板id>：把操作单 §6 那条现网命令原样抽出来跑，只替换占位的那个 id
  local body
  body=$(awk '/^```bash$/{buf="";inc=1;next} inc&&/^```$/{ if (buf ~ /SessionLocal/) print buf; inc=0; next } inc{buf=buf"\n"$0}' "$DOC" \
        | sed -n "/<<'PY'/,/^PY$/p" | sed '1d;$d')
  [ -n "$body" ] || { echo "!! 从 $DOC 里抽不出那段撤回命令——操作单被改过，这一档就什么都没验"; return 1; }
  DATABASE_URL="sqlite:///$D" $PY - <<<"${body//你的模板id/$1}"
}

ck()   { if [ "$2" = "$3" ]; then echo "   ✓ $1"; else echo "   ✗ $1：期望「$3」实得「$2」"; bad=1; fi; }
ckhas()  { case "$2" in *"$3"*) echo "   ✓ $1";; *) echo "   ✗ $1：读数里没有「$3」（实得：$2）"; bad=1;; esac; }
cknot()  { case "$2" in *"$3"*) echo "   ✗ $1：还看得见「$3」，撤回没生效"; bad=1;; *) echo "   ✓ $1";; esac; }

echo "—— 造四个一次性库：灌好的 / 表在但没灌种子 / 表压根不存在 / 拿来点撤回的"
mkdb $A seed; mkdb $B noseed; mkdb $C notable; mkdb $D seed
expect "档一 一切正常" 该绿 $A
expect "档二 表建了、种子没灌" 该红 $B "库里 live 不是零行"
expect "档三 那张表压根不存在" 该红 $C "库里那张表在"
echo "—— 撤回那一路（操作单 §6 那条命令，本机一次性库上原样跑）"
if serve $D; then
  before=$(apilive $D); n0=${before%%$'\t'*}; ids0=${before#*$'\t'}
  ckhas "撤回前：接口那 $n0 格里有 quote" "$ids0" quote
  out=$(docflip quote); code=$?
  [ $code -eq 0 ] || echo "   ✗ 文档那条命令本身跑挂了（退出码 $code）：$out"
  ckhas "命令自己报「收了 1 行；现在 live 有 $((n0 - 1)) 条」" "$out" "收了 1 行"
  after=$(apilive $D); n1=${after%%$'\t'*}; ids1=${after#*$'\t'}
  ck "撤回后：接口少一格" "$n1" "$((n0 - 1))"
  cknot "撤回后：那一格从接口里消失了" "$ids1" quote
  dbread=$(DATABASE_URL="sqlite:///$D" $PY -c "
import sys; sys.path.insert(0, '.')
from app.db.database import SessionLocal
from app.models.poster_template import PosterTemplate
db = SessionLocal()
print(db.query(PosterTemplate).count(),
      db.query(PosterTemplate).filter_by(template_id='quote').count(),
      db.query(PosterTemplate).filter_by(template_id='quote', status='archived').count(),
      db.query(PosterTemplate).filter_by(status='live').count())
" 2>&1)
  # zsh 不像 bash 会把不带引号的变量按空格切开（没开 SH_WORD_SPLIT），`set -- $dbread` 之后
  # $2 是空的、配上 set -u 直接"parameter not set"把脚本打断——用 read 显式分四个字段。
  read -r rTot rMine rArc rLive <<<"$dbread"
  ck "库里总行数没变（撤回是改状态，不是删行）" "$rTot" "$n0"
  ck "那一格在库里还留着" "$rMine" 1
  ck "留的那一行状态是 archived" "$rArc" 1
  ck "库里 live 跟着少一条" "$rLive" "$((n0 - 1))"
  out2=$(docflip quote); ckhas "同一格点第二次是空写（「收了 0 行」）" "$out2" "收了 0 行"
  out3=$(docflip 压根没这一格); ckhas "点一个不存在的 id：也是空写，不报错" "$out3" "收了 0 行"
  stop
else
  bad=1
fi
expect "档五 撤回一条之后，探针仍该全绿（撤回对它透明，别指望它报警）" 该绿 $D
DATABASE_URL="sqlite:///$D" $PY -c "
import sys; sys.path.insert(0, '.')
from app.db.database import SessionLocal
from app.models.poster_template import PosterTemplate
db = SessionLocal()
db.query(PosterTemplate).filter(PosterTemplate.status == 'live').update({'status': 'archived'})
db.commit()
"
expect "档六 全部收回时探针该红（那条「live 不许是零行」不是摆设）" 该红 $D "库里 live 不是零行"
rm -f $A $B $C $D
[ $bad -eq 0 ] && echo "" && echo "彩排六档全对得上" || { echo ""; echo "彩排红：见上面那几条"; exit 1; }
