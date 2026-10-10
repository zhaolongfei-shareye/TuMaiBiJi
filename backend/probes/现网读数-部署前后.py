"""部署前后各跑一次的现网只读读数（不改任何一行数据）。

配方写死在这里，是为了让"前后一模一样"这句话可复现：同一个脚本、同一份 SQL，
跑两遍，diff 出来只有 `时间` 与 `db_size/mtime` 那三行该变（迁移会动文件）。
"""
import hashlib
import os
import sqlite3

DB = os.environ.get("DB_PATH", "./wtsj.db")
conn = sqlite3.connect(DB)
cur = conn.cursor()

tables = [r[0] for r in cur.execute(
    "select name from sqlite_master where type='table' order by name")]
print("时间:", cur.execute("select datetime('now')").fetchone()[0])
print("alembic_version:", cur.execute("select version_num from alembic_version").fetchall())
print("generation_seq 在不在:", "generation_seq" in tables)

pairs = cur.execute("select id, generation from users order by id").fetchall()
blob = "|".join(f"{i}:{g}" for i, g in pairs).encode()
print("users(id,generation) 条数:", len(pairs))
print("users 指纹:", hashlib.sha256(blob).hexdigest()[:16])
print("users 代次读数:", (min(g for _, g in pairs), max(g for _, g in pairs), len(pairs)))
print("users(id,generation) 全量:", pairs)
print("openid 为空:", cur.execute("select count(*) from users where openid is null").fetchone()[0])
print("account_id 为空:", cur.execute("select count(*) from users where account_id is null").fetchone()[0])
print("名下两行以上的 account:", cur.execute(
    "select count(*) from (select account_id, count(*) c from users "
    "where account_id is not null group by account_id having c > 1)").fetchone()[0])
print("account_id 指着不存在的 account 的行数:", cur.execute(
    "select count(*) from users u left join accounts a on a.id = u.account_id "
    "where u.account_id is not null and a.id is null").fetchone()[0])

for t in tables:
    try:
        n = cur.execute(f"select count(*) from {t}").fetchone()[0]
    except sqlite3.Error as exc:
        n = f"读失败 {type(exc).__name__}"
    print(f"行数 {t}: {n}")

print("accounts.generation 取值:",
      cur.execute("select generation, count(*) from accounts group by generation").fetchall())
print("身份行 provider 分布:",
      cur.execute("select provider, count(*) from account_identities group by provider").fetchall())
print("身份行的 provider_uid 有没有重复:", cur.execute(
    "select count(*) from (select provider, provider_uid, count(*) c from account_identities "
    "group by provider, provider_uid having c > 1)").fetchone()[0])
print("孤儿身份行（account 不在了）:", cur.execute(
    "select count(*) from account_identities i left join accounts a on a.id = i.account_id "
    "where a.id is null").fetchone()[0])
try:
    print("generation_seq 内容:", cur.execute("select key, value from generation_seq").fetchall())
except sqlite3.Error as exc:
    print("generation_seq 内容:", f"（表不在：{type(exc).__name__}）")

conn.close()
st = os.stat(DB)
print("db_size:", st.st_size, "mtime:", int(st.st_mtime))
