#!/bin/zsh
# 探针彩排：把 poster_templates_live_probe.py 拉起来真打一趟，跑在三种现场上。
#
# 为什么要它：这支探针是"部署完到底生效没生效"的最后一道读数，可它自己上线前一次都没跑过。
# 10-06 第一次彩排就翻出两条：①「表建了、种子没灌」它报**全绿**（接口 0 条 == 库里 0 行，等式成立），
# 而那正是它文件头写着要抓的第③种漏法；②「迁移没跑到、表压根不存在」它不报红，直接抛 SQLAlchemy 堆栈。
# 两条都补了。这个脚本把三种现场的预期脸色钉死：以后谁把探针改弱，这里当场红。
#
# 跑法：cd backend && zsh probes/rehearse_poster_probe.sh
# 只碰 /tmp 下三个一次性库，**不打现网**（默认那个 BASE 在这里一律被 PROBE_BASE 盖掉）。
set -u
cd "$(dirname "$0")/.." || exit 1          # → backend/
PORT=${REHEARSE_PORT:-8159}
A=/tmp/rehearse_seeded.db; B=/tmp/rehearse_noseed.db; C=/tmp/rehearse_notable.db
rm -f $A $B $C
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

echo "—— 造三个一次性库：灌好的 / 表在但没灌种子 / 表压根不存在"
mkdb $A seed; mkdb $B noseed; mkdb $C notable
expect "档一 一切正常" 该绿 $A
expect "档二 表建了、种子没灌" 该红 $B "库里 live 不是零行"
expect "档三 那张表压根不存在" 该红 $C "库里那张表在"
rm -f $A $B $C
[ $bad -eq 0 ] && echo "" && echo "彩排三档全对得上" || { echo ""; echo "彩排红：见上面那几条"; exit 1 }
