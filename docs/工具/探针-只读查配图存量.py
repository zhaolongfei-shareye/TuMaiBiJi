import sqlite3
db = sqlite3.connect("file:wtsj.db?mode=ro", uri=True)
q = lambda s: db.execute(s).fetchall()
print("assets rows:", q("select count(*) from assets")[0][0])
print("backup_status dist:", q("select backup_status, count(*) from assets group by 1"))
print("有图的笔记篇数:", q("select count(distinct note_id) from assets where note_id is not null")[0][0])
print("note_id 为空的资产行:", q("select count(*) from assets where note_id is null")[0][0])
print("file_type dist:", q("select file_type, count(*) from assets group by 1"))
print("object_key 前 3 条（只看前 30 字符）:", [r[0][:30] for r in q("select object_key from assets order by id desc limit 3")])
