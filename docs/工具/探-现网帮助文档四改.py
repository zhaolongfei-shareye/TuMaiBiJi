"""现网探针：「帮助文档」这一类四改（第三十八次部署）在服务器上到底通不通。

本地 pytest 981 全绿只证明这份代码；现网 nginx 前缀、`.env` 里那把管理口令、systemd 重启之后
`preset_note` 那行读不读得到——只有从公网打一次才知道（`[[feedback-green-tests-not-release-ready]]`）。

跑法（口令从服务器 `.env` 现读，不进命令行、不回显；脚本自己也在服务器上跑，票只活在这趟进程里）：

    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网帮助文档四改.py

他 10-18 那四句逐字是：「官方预置，变成"帮助文档"，然后这类笔记，不能编辑（按钮置灰），不能分享，
允许删除。然后后台更新后，要新旧用户全量刷新。」这一支按这四句各钉一条，外加两条反面：

- 发布即刷存量（走**真口** `PUT /api/admin/preset-note`，不在脚本里现调 `resync_all` 抄近路）；
- 停用也算一次更新，存量跟着回到包里那一份；
- 编辑那一道只挡内容那五栏，`category_id` 照旧放行（挡住它等于打坏线上那个老包的归类）；
- 这一类名下还开着的分享码在发布那一趟一并关掉，公开页读回 404。

**这一支写现网**，所以三件事先钉死：
① 进门前先把 `mp_settings` 里那份**逐字节**备份到回滚点目录，收尾按那份原样 PUT 回去；
② 全程只往测试号（users.id=1，`deploy` 打头那只）名下种一篇、删一篇，不碰任何真号；
③ 中途会有一次"停用"，那几秒里 76 篇是包里那一份旧文案——跑完立刻复原，读数在最后一条。
"""
import json
import os
import sys

sys.path.insert(0, os.getcwd())

import httpx
from sqlalchemy import text

from app.db.database import SessionLocal
from app.services import preset_note as P

BASE = "https://api.agentsbin.cn/wtsj"
ADMIN_TOKEN = ""
for line in open(".env", encoding="utf-8"):
    if line.startswith("ADMIN_TOKEN="):
        ADMIN_TOKEN = line.split("=", 1)[1].strip().strip('"').strip("'")
if not ADMIN_TOKEN:
    print("!! .env 里没有 ADMIN_TOKEN，这一支打不了")
    sys.exit(1)

fails = []
checks = 0


def ck(label, ok, detail=""):
    global checks
    checks += 1
    print(f"  {'✓' if ok else '✗'} {label}{('　→ ' + str(detail)) if detail != '' else ''}")
    if not ok:
        fails.append(label)


db = SessionLocal()
his = db.execute(text("select text_value from mp_settings where kind='preset_note'")).scalar()
if not his:
    print("!! 现网那一栏是空的（站长还没发布过），这一支的「刷存量」没东西可刷")
    sys.exit(1)
payload = json.loads(his)
BACKUP = ".bak-helpdoc-live-value.json"
with open(BACKUP, "w", encoding="utf-8") as f:
    f.write(his)


def preset_ids():
    return [r[0] for r in db.execute(text("select id from notes where source_type='preset'")).fetchall()]


def active_shares_on_preset():
    return db.execute(text(
        "select count(*) from shares where is_active=1 and note_id in "
        "(select id from notes where source_type='preset')")).scalar()


def tokens_of_preset():
    return [r[0] for r in db.execute(text(
        "select token from shares where note_id in (select id from notes where source_type='preset')")).fetchall()]


def rows_match(want):
    """库里每一篇 preset 的六栏是否逐字等于 want。

    走 ORM 不走裸 SQL：`tags`／`key_points` 是 JSON 列，裸 SQL 拿回来的是序列化后的字符串，
    而我这边 `json.dumps` 转不转中文跟 SQLAlchemy 那一套不保证一致——拿字符串比会红在编码风格上、
    不是红在数据上。两边都解码成 Python 对象再比，比的才是内容。
    """
    from app.models.note import Note

    bad = 0
    for note in db.query(Note).filter(Note.source_type == "preset").all():
        got = [note.title, note.summary, note.tags, note.key_points, note.content, note.original_content]
        want_cols = [want["title"], want["summary"], want["tags"], want["key_points"], want["content"], want["content"]]
        if got != want_cols:
            bad += 1
    db.expire_all()
    return bad


print("\n== 0. 进门前的底数 ==")
n_before = len(preset_ids())
shares_before = active_shares_on_preset()
print(f"  preset 篇数 {n_before}｜这一类名下还开着的分享码 {shares_before} 张｜备份已落 {BACKUP}")

r = httpx.post(f"{BASE}/api/admin/login", json={"token": ADMIN_TOKEN}, timeout=30)
ck("管理票换得到（`POST /api/admin/login`，不是拿裸口令当 bearer）", r.status_code == 200, r.status_code)
A = {"Authorization": "Bearer " + r.json()["session"]}

print("\n== 1. 发布那一趟：走真口，回体要念得出刷了几篇 ==")
g = httpx.get(f"{BASE}/api/admin/preset-note", headers=A, timeout=30)
ck("后台那一格读得到已登记的那份", g.status_code == 200 and g.json().get("registered") is not None, g.status_code)
pub = httpx.put(f"{BASE}/api/admin/preset-note", headers=A, json={"value": payload}, timeout=60)
ck("原样再发布一次 200（这一趟就是他手机上该看到的那一次）", pub.status_code == 200, pub.status_code)
body = pub.json() if pub.status_code == 200 else {}
res = body.get("resync") or {}
ck("回体带 `resync.refreshed` ＝库里那些篇全刷了", res.get("refreshed") == n_before, res)
ck("回体带 `resync.closed_shares` ＝这一类名下那几张活码一起关掉", res.get("closed_shares") == shares_before, res)
db.expire_all()
ck("库里逐行回读：preset 那些篇的六栏现在**等于库里那份新文案**，不合格 0 篇", rows_match(payload) == 0,
   f"{rows_match(payload)} 篇不合格")
still = active_shares_on_preset()
ck("这一类名下活分享码归零（他那句「分享与卡片图一起撤，旧码关掉」）", still == 0, f"还剩 {still} 张")
tk = tokens_of_preset()[:1]
if tk:
    pub_page = httpx.get(f"{BASE}/api/shares/{tk[0]}", timeout=30)
    ck("那张已经关掉的旧码，公开页读回 404（关而不删：token 还在，但对账用不着正文）",
       pub_page.status_code == 404, pub_page.status_code)

print("\n== 2. 三道闸与那一道放开：全打在测试号名下 ==")
from app.core.auth import _create_token
from app.models.user import User

u1 = db.get(User, 1)
seeded = P.seed_note_for_new_user(db, u1)
if seeded is None:
    print("!! 测试号那一篇没种出来（后面三条闸量不了）")
    sys.exit(1)
nid = seeded if isinstance(seeded, int) else seeded.id
U = {"Authorization": "Bearer " + _create_token(str(u1.id))}
print(f"  测试号 users.id=1，新种的那一篇 notes.id={nid}")

e = httpx.put(f"{BASE}/api/notes/{nid}", headers=U, json={"title": "我想改标题"}, timeout=30)
ck("编辑那一趟被拒 400，念的是新那句", e.status_code == 400 and e.json().get("detail") == P.PRESET_EDIT_MSG,
   f"{e.status_code} / {e.json().get('detail') if e.status_code != 404 else ''}")
c = httpx.put(f"{BASE}/api/notes/{nid}", headers=U, json={"category_id": None}, timeout=30)
ck("只发 `category_id` 那一趟照旧 200（这条闸不许顺手把老包的归类打坏）", c.status_code == 200, c.status_code)
s = httpx.post(f"{BASE}/api/shares/", headers=U, json={"note_id": nid}, timeout=30)
ck("分享那一趟被拒 400，念的是那一句", s.status_code == 400 and s.json().get("detail") == P.PRESET_SHARE_MSG,
   f"{s.status_code}")
row = db.execute(text("select count(*) from shares where note_id=:i"), {"i": nid}).fetchone()[0]
ck("被拒那一趟在库里一行都没留", row == 0, f"{row} 行")
k = httpx.post(f"{BASE}/api/notes/{nid}/card", headers=U,
               json={"file_id": "cloud://probe/none.png", "tpl": "classic"}, timeout=30)
ck("出卡片那一趟被拒 400（老包直接打接口也进不来）", k.status_code == 400 and k.json().get("detail") == P.PRESET_CARD_MSG,
   f"{k.status_code}")
card_rows = db.execute(text("select count(*) from note_cards where note_id=:i"), {"i": nid}).fetchone()[0]
ck("卡片那一口也没留幽灵行", card_rows == 0, f"{card_rows} 行")
d = httpx.delete(f"{BASE}/api/notes/{nid}", headers=U, timeout=30)
ck("删除这一趟 200（他 10-18 把 10-14 那句『默认的不能删除』翻案成『允许删除』）", d.status_code == 200, d.status_code)
gone = db.execute(text("select count(*) from notes where id=:i"), {"i": nid}).fetchone()[0]
ck("那一篇真从库里没了", gone == 0, f"{gone} 行")

print("\n== 3. 正控：他自己写的那一篇照旧改得动 ==")
own = db.execute(text("select id, title from notes where user_id='1' and (source_type is null or source_type<>'preset') "
                     "order by id limit 1")).fetchone()
if own:
    back = httpx.put(f"{BASE}/api/notes/{own[0]}", headers=U, json={"title": "探针改过一次"}, timeout=30)
    ck(f"普通那篇（id={own[0]}）PUT 标题 200，三道闸没误伤它", back.status_code == 200, back.status_code)
    httpx.put(f"{BASE}/api/notes/{own[0]}", headers=U, json={"title": own[1]}, timeout=30)
    db.expire_all()
    now = db.execute(text("select title from notes where id=:i"), {"i": own[0]}).fetchone()[0]
    ck("收尾把标题还原了", now == own[1], now)

print("\n== 4. 停用也算一次更新，然后按备份原样复原 ==")
off = httpx.put(f"{BASE}/api/admin/preset-note", headers=A, json={"value": None}, timeout=60)
ck("停用那一趟 200 且也带回体 resync", off.status_code == 200 and (off.json().get("resync") or {}).get("refreshed") == n_before,
   f"{off.status_code} / {off.json().get('resync') if off.status_code == 200 else ''}")
file_row = P.seed_row()
ck("停用之后存量那些篇落回**包里那一份**（不合格 0 篇）", rows_match(file_row) == 0, f"{rows_match(file_row)} 篇不合格")
rest = httpx.put(f"{BASE}/api/admin/preset-note", headers=A, json={"value": payload}, timeout=60)
ck("按备份 PUT 回他那一份 200（收尾就是这一趟）", rest.status_code == 200, rest.status_code)
db.expire_all()
ck("最终态：库里每一篇 preset 都等于他后台那份，不合格 0 篇", rows_match(payload) == 0, f"{rows_match(payload)} 篇不合格")
final_n = len(preset_ids())
ck(f"篇数回到进门前的那个数（{n_before}→{final_n}，测试号那一篇已删净）", final_n == n_before, final_n)

db.close()
print(f"\n{'全部通过' if not fails else '有 ' + str(len(fails)) + ' 条没过'}：{checks} 条判据")
for f in fails:
    print("  ✗ " + f)
sys.exit(1 if fails else 0)
