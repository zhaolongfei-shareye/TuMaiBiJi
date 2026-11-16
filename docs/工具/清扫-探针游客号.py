# 现网库里 probe 游客号清扫（11-16 版：账号层加归属闸、删除走事务、收尾有退出码）。
#
# 认人只认 openid 前缀 `guest:probe%`：**uuid 型游客号一概不动**（可能是真人刚开的一枚）。
# 11-12 现撞：探针脚本里那句 `localStorage.setItem('deviceId', …)` 有时赶不上开机第一趟
# `/v1/auth/guest`（第一趟已经自己生成过一枚 uuid 并写进 Storage），于是那一趟开出来的号是
# `guest:<uuid>`——这把尺子认不出它。这种只能逐枚看证据（创建时刻落在探针时间窗里 ＋ 名下只有
# 探针标题的那一篇），确认了再按 id 点名删，不许把前缀规则放宽成"uuid 也删"。
#
# ⚠ 删的顺序（11-12 实撞过一次 `FOREIGN KEY constraint failed`，整批回滚、一行没少）：
#   `jobs.note_id` 与 `shares.note_id` 都外键指向 `notes.id`，所以必须**先按笔记号删这两张**，
#   再删 `notes`，最后才是 users／accounts。旧版把 notes 排在 CHILD 第一位，撞上带分享码的探针笔记就整批失败。
#
# ⚠ 11-16 三条闸（第十轮审计 Z61）：
#   ① 账号那一层从前按 `account_id` **无条件**删 ⇒ 探针号与真人并过账时（同一枚 account_id 名下
#      既有 `guest:probe%` 也有别的 users 行），真人的 `accounts` 行与**全部** `account_identities`
#      行一起没、他的 `users` 行却还在 ⇒ 下次登录撞孤儿 500。现在先分组数「名下还有没有别人」，
#      有就整枚跳过（连身份行一起留）并逐枚念出来。
#   ② 从前 `sqlite3.connect("wtsj.db")` 从错的 cwd 跑会**顺手新建一只空库**、再把空表读成
#      「没什么可清」而退 0。现在先以 `mode=ro` 只读打开把底数看清（只读口打不开＝盘上没这只库），
#      确认像现网那只库之后才读写打开。
#   ③ 从前收尾全是 print、一处 `sys.exit` 都没有 ⇒ 屏上念着「剩下 3」退出码照样 0。现在删除全在
#      一个事务里，**回读判据有红就 rollback**（库里一行没少），崩在半路同样 rollback，收尾按红数退。
#
# 想另留文件副本的话是另一件事：`sqlite3 wtsj.db .backup /path/备份.db`；这一把靠事务回滚，不靠副本。
#
# 跑法（脚本走标准输入递过去，盘上不留副本）：
#   ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/清扫-探针游客号.py
import os
import pathlib
import sqlite3
import sys

DB = os.path.abspath("wtsj.db")
PROBE = "guest:probe%"
CHILD = [("note_cards", "user_id"), ("assets", "user_id"), ("categories", "user_id"),
         ("user_profiles", "user_id"), ("daily_usage", "user_id"), ("notes", "user_id")]
fails = []


def ck(name, ok, got=""):
    print(("  ✓ " if ok else "  ✗ ") + name + (f"　→ {got}" if got else ""))
    if not ok:
        fails.append(name)


def ph(items):
    """一批值变成 `IN` 后面那个括号；值走参数不走字符串（账号是 36 位串，拼引号迟早撞转义）。"""
    return "(" + ",".join("?" * len(items)) + ")" if items else "(NULL)"


def one(cur, sql, args=()):
    return list(cur.execute(sql, args))[0][0]


print(f"\n== 1. 只读那一趟：先确认吃的是盘上哪一只库（{DB}）==")
if not os.path.isfile(DB):
    print("!! 盘上没有这只库 ⇒ 一行不动就退出。")
    print("   （直接 connect 相对路径会让 sqlite3 顺手新建一只空库，再把空表读成「没什么可清」＝假绿）")
    sys.exit(1)
try:
    ro = sqlite3.connect(pathlib.Path(DB).as_uri() + "?mode=ro", uri=True)
except sqlite3.Error as exc:
    print(f"!! 只读打开失败：{type(exc).__name__}: {exc} ⇒ 一行不动就退出")
    sys.exit(1)
try:
    ids = [r[0] for r in ro.execute(
        "select id from users where openid like ? order by id", (PROBE,))]
except sqlite3.Error as exc:
    ro.close()
    print(f"!! 读不到 users：{type(exc).__name__}: {exc} ⇒ 这只库不像现网那只，一行不动就退出")
    sys.exit(1)
if not ids:
    ro.close()
    print("probe 账号 0 枚——没什么可清")
    sys.exit(0)

qph = ph(ids)
acc = sorted({r[0] for r in ro.execute(
    f"select account_id from users where id in {qph}", ids) if r[0]})
own = {}
if acc:
    own = {r[0]: r[1] for r in ro.execute(
        "select account_id, sum(case when openid like ? then 0 else 1 end) "
        f"from users where account_id in {ph(acc)} group by account_id", (PROBE, *acc))}
keep = [a for a in acc if own.get(a, 0) > 0]
drop = [a for a in acc if own.get(a, 0) == 0]
note_ids = [r[0] for r in ro.execute(f"select id from notes where user_id in {qph}", ids)]
before_child = {t: one(ro, f"select count(1) from {t} where {k} in {qph}", ids) for t, k in CHILD}
before_jobs = one(ro, f"select count(1) from jobs where note_id in {ph(note_ids)}", note_ids)
before_shares = one(ro, f"select count(1) from shares where note_id in {ph(note_ids)}", note_ids)
before_id = {a: one(ro, "select count(1) from account_identities where account_id = ?", (a,))
             for a in keep}
orph0 = one(ro, "select count(1) from accounts where id not in "
                "(select account_id from users where account_id is not null)")
# 按增量判，不按绝对值判：库里万一早有这种坏账，别让它把这一把卡死
ou0 = one(ro, "select count(1) from users where account_id is not null "
              "and account_id not in (select id from accounts)")
ro.close()

print(f"  · probe 账号 {len(ids)} 枚：{ids}")
print(f"  · 名下笔记 {len(note_ids)} 篇：{note_ids}")
print(f"  · 涉及账号 {len(acc)} 枚 ⇒ 可撤 {len(drop)}／**要留 {len(keep)}**")
print(f"  · 删前子行 {before_child}／jobs {before_jobs}／shares {before_shares}")
print(f"  · 库里本来就有的孤儿账号 {orph0} 枚（这一把的判据是「别新增」，不是「清零」）")
for a in keep:
    print(f"  ! 账号 {a} 名下还有 {own[a]} 行非探针 users／{before_id[a]} 条身份行 ⇒ 整枚跳过")

print("\n== 2. 动手：一个事务里删，回读有红就整批退回 ==")
c = sqlite3.connect(DB)
c.execute("PRAGMA foreign_keys=ON")
committed = False
crashed = None
try:
    cur = c.cursor()
    n_jobs = cur.execute(f"delete from jobs where note_id in {ph(note_ids)}", note_ids).rowcount
    n_shares = cur.execute(f"delete from shares where note_id in {ph(note_ids)}", note_ids).rowcount
    n_child = 0
    for t, k in CHILD:
        n_child += cur.execute(f"delete from {t} where {k} in {qph}", ids).rowcount
    n_id = cur.execute(f"delete from account_identities where account_id in {ph(drop)}", drop).rowcount
    n_acc = cur.execute(f"delete from accounts where id in {ph(drop)}", drop).rowcount
    n_users = cur.execute(f"delete from users where id in {qph}", ids).rowcount

    print("\n== 3. 回读（还没提交）==")
    ck("probe 账号清干净",
       one(cur, "select count(1) from users where openid like ?", (PROBE,)) == 0,
       f"剩下 {one(cur, 'select count(1) from users where openid like ?', (PROBE,))}")
    ck("实删 users 行数 == 动手前点名那批", n_users == len(ids), f"{n_users} vs {len(ids)}")
    for t, k in CHILD:
        left = one(cur, f"select count(1) from {t} where {k} in {qph}", ids)
        ck(f"{t} 里 probe 名下剩下 0", left == 0, f"删前 {before_child[t]}／剩下 {left}")
    ck("jobs 按笔记号删净",
       one(cur, f"select count(1) from jobs where note_id in {ph(note_ids)}", note_ids) == 0,
       f"删前 {before_jobs}／实删 {n_jobs}")
    ck("shares 按笔记号删净",
       one(cur, f"select count(1) from shares where note_id in {ph(note_ids)}", note_ids) == 0,
       f"删前 {before_shares}／实删 {n_shares}")
    ck("要撤的账号一行不剩",
       one(cur, f"select count(1) from accounts where id in {ph(drop)}", drop) == 0,
       f"点名 {len(drop)}／实删 {n_acc}")
    ck("要撤账号的身份行一行不剩",
       one(cur, f"select count(1) from account_identities where account_id in {ph(drop)}", drop) == 0,
       f"实删 {n_id}")
    for a in keep:
        still = one(cur, "select count(1) from accounts where id = ?", (a,))
        still_id = one(cur, "select count(1) from account_identities where account_id = ?", (a,))
        still_users = one(cur, "select count(1) from users where account_id = ? "
                              "and openid not like ?", (a, PROBE))
        ck(f"要留的账号 {a} 没被碰（含真人那 {own[a]} 行）",
           still == 1 and still_id == before_id[a] and still_users == own[a],
           f"accounts {still}／身份 {still_id}（动手前 {before_id[a]}）／真人 users {still_users}")
    orph1 = one(cur, "select count(1) from accounts where id not in "
                     "(select account_id from users where account_id is not null)")
    ck("没多造孤儿账号", orph1 == orph0, f"动手前 {orph0}／现在 {orph1}")
    ou1 = one(cur, "select count(1) from users where account_id is not null "
                   "and account_id not in (select id from accounts)")
    ck("没有 users 行指向已经不存在的账号（这种行下次登录撞孤儿 500）", ou1 == ou0,
       f"动手前 {ou0}／现在 {ou1}")
    print(f"  · 实删：jobs {n_jobs}／shares {n_shares}／子行 {n_child}／"
          f"users {n_users}／身份 {n_id}／账号 {n_acc}")
    if fails:
        print(f"!! 判据 {len(fails)} 红 ⇒ 整批 rollback（库里＝动手前，一行没少）")
        c.rollback()
    else:
        c.commit()
        committed = True
        ck("提交后 probe 仍是 0 枚",
           one(c.cursor(), "select count(1) from users where openid like ?", (PROBE,)) == 0)
except BaseException as exc:
    crashed = exc
    print(f"\n!! 中途抛：{type(exc).__name__}: {exc}")
    try:
        c.rollback()
        print("   ⇒ 已 rollback（库里＝动手前，一行没少）")
    except sqlite3.Error as rb:
        print(f"   !! rollback 自己也没成：{type(rb).__name__}: {rb} ⇒ 人工核这只库")

print("\n== 4. 收尾 ==")
if committed:
    print("  · 库里剩下的账号总数:",
          one(c.cursor(), "select count(1) from accounts"),
          "／notes:", one(c.cursor(), "select count(1) from notes"))
c.close()
if crashed:
    print("\n结果：中途崩 ⇒ 1 红｜未提交")
    sys.exit(1)
print(f"\n结果：{len(fails)} 红｜{'已提交' if committed else '未提交（库里＝动手前）'}")
sys.exit(1 if fails else 0)
