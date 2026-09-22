#!/bin/bash
# 图麦笔记 · 数据库每日备份（服务器上由 cron 调用，也可手工跑）
#
# 为什么要有这个：整站数据就是一个 SQLite 文件（wtsj.db，122KB 量级），此前**机器上
# 没有任何一份副本**（crontab 为空、目录里只有源文件）。删库、误 commit、磁盘坏，
# 用户笔记就没了——这是本项目目前唯一一个"发生即不可逆"的口子。
#
# 三条不省的地方：
# ① 用 sqlite3 的 backup API，不是 cp。源库 journal_mode 是 delete（不是 WAL），
#    服务在写的时候 cp 会拿到撕裂的半份文件。
# ② 备份完先 `PRAGMA integrity_check` 再压缩——坏副本留着只会给人虚假的安全感。
# ③ 做一次**恢复演练**：把快照还原成库、和源库比行数与内容散列。只比文件存在与否
#    证明不了"这份能恢复"。
#
# 用法：./backup.sh            正常备份（cron 用这条）
#       ./backup.sh --verify   只做恢复演练，不产生新备份
set -uo pipefail

DIR="/home/ubuntu/wtsj-backend"
DB="$DIR/wtsj.db"
VENV_PY="$DIR/.venv/bin/python"
STORE="/home/ubuntu/wtsj-backups"
KEEP_DAYS=14
LOG="$STORE/backup.log"
mkdir -p "$STORE"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

if [[ ! -f "$DB" ]]; then
    log "!! 源库不存在：$DB"
    exit 1
fi

# 备份 + 校验 + 演练都在 python 里做：sqlite3 CLI 在这台机器上不一定有，
# venv 里的标准库一定有。
VERIFY_ONLY=0
[[ "${1:-}" == "--verify" ]] && VERIFY_ONLY=1

"$VENV_PY" - "$DB" "$STORE" "$LOG" "$VERIFY_ONLY" <<'PY'
import glob
import gzip
import hashlib
import os
import sqlite3
import sys
import time

db_path, store, log_path, verify_only = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == '1'
RESTORE = '/tmp/wtsj_restore.sqlite'


def say(msg):
    line = time.strftime('%Y-%m-%d %H:%M:%S') + ' ' + msg
    print(line)
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def fingerprint(path):
    """内容散列：按 rowid 排序把整表串起来再 sha256。行数对得上但内容错位也能被抓出来。"""
    con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    h = hashlib.sha256()
    counts = {}
    try:
        tables = [r[0] for r in con.execute(
            "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
        for t in tables:
            h.update(t.encode())
            cols = [r[1] for r in con.execute(f'pragma table_info({t})')]
            h.update(('|'.join(cols)).encode())
            for row in con.execute(f'select * from "{t}" order by rowid'):
                h.update(repr(row).encode())
            counts[t] = con.execute(f'select count(*) from "{t}"').fetchone()[0]
        return h.hexdigest(), counts
    finally:
        con.close()


def gunzip(src, dst):
    with gzip.open(src, 'rb') as f, open(dst, 'wb') as o:
        o.write(f.read())


if sqlite3.connect(db_path).execute('pragma integrity_check').fetchone()[0] != 'ok':
    say('!! 源库 integrity_check 不是 ok，先查源库再谈备份')
    raise SystemExit(1)

if verify_only:
    cands = sorted(glob.glob(f'{store}/wtsj-*.sqlite.gz'))
    if not cands:
        say('!! 演练模式：一份备份都没有')
        raise SystemExit(1)
    gunzip(cands[-1], RESTORE)
    say(f'演练：还原最近一份备份 {os.path.basename(cands[-1])}')
else:
    stamp = time.strftime('%Y%m%d-%H%M%S')
    out = f'{store}/wtsj-{stamp}.sqlite.gz'
    tmp = f'{store}/.staging-{stamp}.sqlite'
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(tmp)
    with dst:
        src.backup(dst)              # 在线安全备份，不是 cp
    src.close()
    dst.close()
    if sqlite3.connect(tmp).execute('pragma integrity_check').fetchone()[0] != 'ok':
        os.remove(tmp)
        say('!! 快照 integrity_check 不通过，本次备份作废')
        raise SystemExit(1)
    with open(tmp, 'rb') as f_in, gzip.open(out, 'wb', compresslevel=6) as f_out:
        f_out.write(f_in.read())
    os.remove(tmp)
    gunzip(out, RESTORE)
    say(f'备份完成 {os.path.basename(out)}（{os.path.getsize(out)} 字节）')

if sqlite3.connect(RESTORE).execute('pragma integrity_check').fetchone()[0] != 'ok':
    say('!! 还原出来的库 integrity_check 不通过，这份备份不可用')
    raise SystemExit(1)
src_fp, src_counts = fingerprint(db_path)
res_fp, res_counts = fingerprint(RESTORE)
if src_fp != res_fp:
    say(f'!! 恢复演练不一致：源 {src_counts} / 备份 {res_counts}')
    raise SystemExit(1)
say(f'✓ 恢复演练通过：还原库与源库内容散列一致，{sum(src_counts.values())} 行'
    f'（notes={src_counts.get("notes", 0)} users={src_counts.get("users", 0)} shares={src_counts.get("shares", 0)}）')

if not verify_only:
    for path in sorted(glob.glob(f'{store}/wtsj-*.sqlite.gz'))[:-14]:
        os.remove(path)
        say(f'保留 14 份：删除 {os.path.basename(path)}')
    kept = glob.glob(f'{store}/wtsj-*.sqlite.gz')
    free_gb = os.statvfs(store).f_bavail * os.statvfs(store).f_frsize // 2**30
    say(f'当前 {len(kept)} 份备份，备份目录所在盘剩余约 {free_gb} GB')
    os.remove(RESTORE)
PY
RC=$?
[[ $RC -eq 0 ]] || log "!! 备份流程退出码 $RC"
exit $RC
