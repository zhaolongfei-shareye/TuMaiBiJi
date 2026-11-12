# 现网库里 probe 游客号清扫（11-12 版，FK 顺序修好那一条）。
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
# 跑法（脚本走标准输入递过去，盘上不留副本）：
#   ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/清扫-探针游客号.py
import sqlite3

c = sqlite3.connect("wtsj.db")
c.execute("PRAGMA foreign_keys=ON")

ids = [r[0] for r in c.execute("select id from users where openid like 'guest:probe%' order by id")]
if not ids:
    print("probe 账号 0 枚——没什么可清")
    raise SystemExit(0)
q = "(" + ",".join(str(i) for i in ids) + ")"
acc = [r[0] for r in c.execute("select account_id from users where id in " + q) if r[0]]
aq = "(" + ",".join("'" + a + "'" for a in acc) + ")" if acc else "(NULL)"
note_ids = [r[0] for r in c.execute("select id from notes where user_id in " + q)]
nq = "(" + ",".join(str(n) for n in note_ids) + ")" if note_ids else "(NULL)"
print("probe 账号枚数:", len(ids), "／ 名下笔记:", note_ids)

CHILD = [("note_cards", "user_id", q), ("assets", "user_id", q), ("categories", "user_id", q),
         ("user_profiles", "user_id", q), ("daily_usage", "user_id", q), ("notes", "user_id", q)]
print("删前:", {t: list(c.execute("select count(1) from %s where %s in %s" % (t, k, s)))[0][0] for t, k, s in CHILD})

cur = c.cursor()
n_jobs = cur.execute("delete from jobs where note_id in " + nq).rowcount
n_shares = cur.execute("delete from shares where note_id in " + nq).rowcount
n = 0
for t, k, s in CHILD:
    n += cur.execute("delete from %s where %s in %s" % (t, k, s)).rowcount
ni = cur.execute("delete from account_identities where account_id in " + aq).rowcount
na = cur.execute("delete from accounts where id in " + aq).rowcount
nu = cur.execute("delete from users where id in " + q).rowcount
c.commit()
print("实删：jobs %d ／ shares %d ／ 子行 %d ／ users %d ／ identities %d ／ accounts %d" % (n_jobs, n_shares, n, nu, ni, na))

print("回读 probe 账号剩下:", list(c.execute("select count(1) from users where openid like 'guest:probe%'"))[0][0])
for t, k, s in CHILD:
    print("  %-16s 剩下 %d" % (t, list(c.execute("select count(1) from %s where %s in %s" % (t, k, s)))[0][0]))
print("  %-16s 剩下 %d" % ("accounts(孤儿)", list(c.execute(
    "select count(1) from accounts where id not in (select account_id from users where account_id is not null)"))[0][0]))
print("库里剩下的账号总数:", list(c.execute("select count(1) from accounts"))[0][0],
      "／notes:", list(c.execute("select count(1) from notes"))[0][0])
