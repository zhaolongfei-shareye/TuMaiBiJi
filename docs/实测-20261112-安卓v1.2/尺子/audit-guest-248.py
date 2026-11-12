import sqlite3, json
DB = "/home/ubuntu/wtsj-backend/wtsj.db"
con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
c = con.cursor()
def q(sql, args=()):
    try: return c.execute(sql, args).fetchall()
    except Exception as e: return [["ERR", str(e)]]
out = {}
out["users_246_248"] = q("SELECT id, account_id, nickname, created_at FROM users WHERE id IN (246,248)")
out["recent_users"] = q("SELECT id, account_id, created_at FROM users ORDER BY id DESC LIMIT 6")
out["identities"] = q("SELECT ai.account_id, ai.provider, ai.provider_uid FROM account_identities ai JOIN users u ON u.account_id=ai.account_id WHERE u.id IN (246,248)")
for t in ("notes","note_cards","categories","daily_usage","user_profiles","shares"):
    out[t] = q("SELECT user_id, COUNT(*) FROM %s WHERE user_id IN (246,248) GROUP BY user_id" % t)
out["guest_total"] = q("SELECT COUNT(*) FROM account_identities WHERE provider='guest'")
out["assets_246_248"] = q("SELECT a.id, a.note_id FROM assets a JOIN notes n ON n.id=a.note_id WHERE n.user_id IN (246,248)")
print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
con.close()
