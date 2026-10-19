"""现网端到端：分类后端那一半（他 10-17 拍的三条）上完之后到底生不生效。

跑法（凭据不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网分类后端那一半.py

只动 `deploy-test` 那一个测试号名下的数据，收尾全部删净，并核一条不变量：
**该号名下分类行数与全站 categories 行数都回到进门那个数。**

六把：
  ① 新用户默认四格：现网真跑一次 `seed_default_categories`，量产物——四行、两档显示值逐字等于那四组常量
     （期望值在本探针里**另写一份**，不 import 被测的表），再核幂等（第二次调回 0）。
  ② 词表命中当场填：建「旅行」→ 回体 `name_en` 逐字 `Travel`、`name_zh` 逐字 `旅行`，建那一下立刻回 200；
     `note_count` 只在 **GET 列表**那一趟要求是数字（建／改两口回体故意不带，客户端 `index.js:816` 读不到就退成不报数）。
  ③ 表外那一档（甲：只做词表）：建一个词表里没有的怪名 → 中文那一格填的是**他自己打的那几个字**，
     `name_en` 必须是 NULL；等 24 秒再读，**仍然 NULL**（这一条链上没有后台那一趟了）。
     另外抽现网那一份模块：`call_model` 与 `fill_missing` 这两个名字**不许存在**——
     它们存在就说明出网那一半又长回来了。
  ④ 改名不许留旧译名：把词表里的「摄影」改进来，量两档跟着新名字走。
  ⑤ 私密那一格两道闸：探针自己在测试号名下插一行 `name="私密"`（真实账号一个不碰），
     改它的名 → 400「名字不许改」；删它 → 400「不许删」。**这两条量的就是"无条件挡"**——旧那一版只在格里还有笔记时才挡。
  ⑥ 普通格删得掉：默认四格是他说的"用户可以自行删除"，删一格要 200。

没在这一把里的：**把别的格改名成「私密」那一条反向闸**（要连着关活码，而测试号名下没有活码，量出来不是那条规矩）——
它只有 pytest 钉着，这里如实声明缺口，不许算进"已覆盖"。
"""
import time

import httpx
from sqlalchemy import func

from app.core.auth import _sign
from app.db.database import SessionLocal
from app.models.category import Category
from app.models.note import Note
from app.models.user import User
from app.services import category_names as cn

BASE = "https://api.agentsbin.cn/wtsj"
EXPECT_DEFAULT = [("灵感", "Ideas"), ("生活", "Life"), ("工作", "Work"), ("学习", "Study")]
ODD = "探针怪词zzzq"

db = SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
assert u, "找不到 deploy-test 那个号，停手"
UID = str(u.id)
H = {"Authorization": f"Bearer {_sign(UID, u.generation or 1)}"}


def mine():
    db.expire_all()
    return db.query(Category).filter(Category.user_id == UID).all()


rows0 = len(mine())
all0 = db.query(func.count(Category.id)).scalar()
notes0 = db.query(func.count(Note.id)).scalar()
print(f"进门：该号名下 categories {rows0} 行｜全站 {all0} 行｜全站 notes {notes0}")

red = []


def post(path, body):
    return httpx.post(f"{BASE}{path}", headers=H, json=body, timeout=60)


# ── ① 默认四格（现网真跑一次种子）────────────────────────────────────────────
made = cn.seed_default_categories(db, UID)
db.commit()
got = {r.name: (r.name_zh, r.name_en) for r in mine()}
print(f"\n① 种子回 {made} 行｜该号名下此刻 {len(got)} 格：{sorted(got)}")
if made != 4:
    red.append(f"① 种子建了 {made} 行，应该是 4 行")
for zh, en in EXPECT_DEFAULT:
    pair = got.get(zh)
    if pair != (zh, en):
        red.append(f"① 「{zh}」两档实读 {pair!r}，期望 {(zh, en)!r}")
made2 = cn.seed_default_categories(db, UID)
db.commit()
print(f"   再种一次 → 回 {made2} 行（幂等，应为 0）｜库里仍是 {len(mine())} 格")
if made2 != 0:
    red.append(f"① 幂等破了：第二次种回 {made2}")

# ── ② 词表命中当场填 ─────────────────────────────────────────────────────────
r = post("/api/categories/", {"name": "旅行"})
body = r.json() if r.status_code < 500 else {}
print(f"\n② 建「旅行」→ HTTP {r.status_code}｜回体 { {k: body.get(k) for k in ('id', 'name', 'name_zh', 'name_en', 'note_count')} }")
if r.status_code != 200 or body.get("name_en") != "Travel" or body.get("name_zh") != "旅行":
    red.append(f"② 词表那一档没当场填上（{r.status_code}／{body.get('name_zh')!r}／{body.get('name_en')!r}）")
row_travel = body.get("id")

# `note_count` 只在 **GET 列表**那一趟算（`list_categories` 里一次 GROUP BY）；建／改那两口的回体
# 故意不带它。我第一版把这条钉在了 POST 回体上，读出来是 None 就当红报——那是尺子写歪，不是实现漏。
lst = httpx.get(f"{BASE}/api/categories/", headers=H, timeout=30).json()
counts = [c.get("note_count") for c in lst if c.get("id") == row_travel]
print(f"   GET 列表里那一格的 note_count = {counts}（应是数字，不是 null）")
if not counts or not isinstance(counts[0], int):
    red.append(f"② GET 列表没带出 `note_count` 这个数字（实读 {counts}）")

# ── ③ 表外那一档（甲：只做词表，这一条链不出网）──────────────────────────────
# 两档分开量：中文那一格填的就是他打的那几个字（`own_zh = 原名`），`name_en` 该留 NULL。
# 第一版这里等的是"name_en 被后台补上"，而补它的那一趟已经被撤掉——留着不改，这把尺子会永远红。
r = post("/api/categories/", {"name": ODD})
body = r.json() if r.status_code < 500 else {}
odd_id = body.get("id")
print(f"\n③ 建「{ODD}」→ HTTP {r.status_code}｜建那一瞬两档 = {body.get('name_zh')!r} / {body.get('name_en')!r}")
if r.status_code != 200:
    red.append(f"③ 表外的名字没建出来（{r.status_code}）")
if body.get("name_zh") != ODD:
    red.append(f"③ 表外的名字，中文那一格该原样落他打的字，实读 {body.get('name_zh')!r}")
if body.get("name_en") is not None:
    red.append(f"③ 词表里没有「{ODD}」，英文那一格却当场被填了（{body.get('name_en')!r}）——表里混进了怪词，或代码又在猜")
print("   等 24 秒再看英文那一格（甲之后不该有任何一趟来补）…", end=" ")
time.sleep(24)
db.expire_all()
row = db.get(Category, odd_id) if odd_id else None
late_en = row.name_en if row else None
print(repr(late_en) if late_en else "仍是 NULL")
if late_en is not None:
    red.append(f"③ 24 秒后英文那一格被补成了 {late_en!r}——后台那一趟没撤干净")
ghosts = [n for n in ("call_model", "fill_missing", "fill_from_glossary", "display_names") if hasattr(cn, n)]
print(f"   现网那一份 `category_names` 里残留的出网/补名口：{ghosts or '没有'}")
if ghosts:
    red.append(f"③ 模块里还剩 {ghosts}——甲撤的那一半在现网又长回来了")

# ── ④ 改名不许留旧译名 ───────────────────────────────────────────────────────
if row_travel:
    r = httpx.put(f"{BASE}/api/categories/{row_travel}", headers=H, json={"name": "摄影"}, timeout=60)
    body = r.json() if r.status_code < 500 else {}
    print(f"\n④ 把「旅行」改成「摄影」→ HTTP {r.status_code}｜两档 = {body.get('name_zh')!r} / {body.get('name_en')!r}")
    if r.status_code != 200 or body.get("name_en") != "Photography":
        red.append(f"④ 改名后英文那一档没跟着走（{r.status_code}／{body.get('name_en')!r}）")

# ── ⑤ 私密那一格两道闸（探针自己在测试号名下插一行）──────────────────────────
lock = Category(user_id=UID, name="私密", sort_order=99)
db.add(lock)
db.commit()
lid = lock.id
r = httpx.put(f"{BASE}/api/categories/{lid}", headers=H, json={"name": "秘密"}, timeout=30)
d1 = str(r.json().get("detail"))
r2 = httpx.delete(f"{BASE}/api/categories/{lid}", headers=H, timeout=30)
d2 = str(r2.json().get("detail")) if r2.status_code not in (200, 204) else "(竟然删掉了)"
print(f"\n⑤ 改「私密」的名 → HTTP {r.status_code}｜{d1!r}")
print(f"   删「私密」这一格 → HTTP {r2.status_code}｜{d2!r}")
if r.status_code != 400 or "不许改" not in d1:
    red.append(f"⑤ 私密格改名没被无条件挡（{r.status_code}／{d1!r}）")
if r2.status_code != 400 or "不许删" not in d2:
    red.append(f"⑥ 私密格删除没被无条件挡（{r2.status_code}／{d2!r}）")

# ── ⑥ 普通格删得掉 ───────────────────────────────────────────────────────────
ling = [x.id for x in mine() if x.name == "灵感"]
r = httpx.delete(f"{BASE}/api/categories/{ling[0]}", headers=H, timeout=30)
print(f"\n⑥ 删默认那一格「灵感」→ HTTP {r.status_code}")
if r.status_code not in (200, 204):
    red.append(f"⑥ 默认格删不掉（{r.status_code}）——他拍的是『用户可以自行删除』")

# ── 收尾：探针建的全部清掉，核不变量 ─────────────────────────────────────────
for row in mine():
    if row.name == "私密":
        db.delete(row)          # 那道闸本来就挡着接口删除，探针自己插的自己直删
    else:
        httpx.delete(f"{BASE}/api/categories/{row.id}", headers=H, timeout=30)
db.commit()
rows1 = len(mine())
all1 = db.query(func.count(Category.id)).scalar()
notes1 = db.query(func.count(Note.id)).scalar()
print(f"\n收尾：该号名下 {rows0} → {rows1}｜全站 {all0} → {all1}｜notes {notes0} → {notes1}")
if (rows1, all1, notes1) != (rows0, all0, notes0):
    red.append(f"收尾没回到进门值（该号 {rows1}/{rows0}｜全站 {all1}/{all0}｜notes {notes1}/{notes0}）")

db.close()
print("\n" + ("⚠ 红的：" + "；".join(red) if red else "六把全过（反向那一条不在这里，见文件头声明的缺口）"))
