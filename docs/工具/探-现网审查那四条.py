"""现网端到端：10-18 审查那四条＋今天 main.py 那一行，上完之后到底生不生效。

跑法（凭据不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网审查那四条.py

为什么每一把都是**拒收那一趟**：这四条改的全是"脏输入进来的那一路"，正确的验法就是拿脏输入打一次，
看它落在哪一层。拒收的那几趟一个字都不写库，所以这一把不会在现网留下东西（唯一会写的那步是
第 ④ 把先建一篇自己的临时笔记，用完当场删）。

五把，一把都不许省：
  ① `skip` 上下界——超界与负数都得是 422。**修之前是 500**（SQLite 驱动绑超过 int64 的数抛 OverflowError），
     所以这一把同时是"改了没有"的读数，不只是"改对了没有"。
  ② 空标题——写入口 `TitleIn` 当场 422，且那句是中文「标题不能为空」。
  ③ 整个 body 形状不对（裸字符串）——**修之前 main.py 那个处理器自己 IndexError，回 500**；现在要 422。
  ④ 配图绑定跨表归属——拿**别人名下已经登记成卡片**的那个地址往自己笔记上绑，要 400 且库里 `assets`
     一行都不许多。修之前那半截只查 `assets` 一表，这种地址会被收下（等于"把你的对象登记成我的"）。
     ⚠ 现网如果没有"别人名下的卡片行"，这一把量不到，当场打印缺口，不许当绿报出去。
  ⑤ 后台来源黑名单"留空点加入"——要回 400 那句人话（含「例如」），不许再回 422 那句带英文词「host」的话。
     这条是 10-19 探针撞出来的：两道门谁先响是随机的，就叫分叉。

**期望值一律在这把尺子里独立算**（界取自己写的数、话术认的是关键字而不是整句），
不 import 被测实现。收尾还核一条不变量：全站 notes／assets／note_cards／黑名单行数回到进门那个数。
"""
import json
from sqlalchemy import func, text

import httpx

from app.core.auth import _sign
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.asset import Asset
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.source_blocklist import SourceBlocklist
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
HUGE = "9" * 25          # 远超 int64；裸 int 声明时它会一路走到驱动那一层
SKIPPY = "-5"

db = SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
assert u, "找不到 deploy-test 那个号，停手"
UID = str(u.id)
H = {"Authorization": f"Bearer {_sign(UID, u.generation or 1)}"}

notes0 = db.query(func.count(Note.id)).scalar()
assets0 = db.query(func.count(Asset.id)).scalar()
cards0 = db.query(func.count(NoteCard.id)).scalar()
block0 = db.query(func.count(SourceBlocklist.id)).scalar()
print(f"进门：全站 notes {notes0}｜assets {assets0}｜note_cards {cards0}｜黑名单 {block0} 行")

red = []

# ── ① skip 上下界 ──────────────────────────────────────────────────────────
r = httpx.get(f"{BASE}/api/notes/", headers=H, params={"skip": HUGE, "limit": 20}, timeout=30)
print(f"\n① skip=10^{len(HUGE)} → HTTP {r.status_code}｜detail {str(r.json().get('detail'))[:60]!r}")
if r.status_code != 422:
    red.append(f"① 超大 skip 没被 422 挡下（实读 {r.status_code}；修之前这里是 500）")

r = httpx.get(f"{BASE}/api/notes/", headers=H, params={"skip": SKIPPY, "limit": 20}, timeout=30)
print(f"   skip=-5 → HTTP {r.status_code}｜detail {str(r.json().get('detail'))[:60]!r}")
if r.status_code != 422:
    red.append(f"① 负数 skip 没被 422 挡下（实读 {r.status_code}）")

r = httpx.get(f"{BASE}/api/notes/", headers=H, params={"skip": 0, "limit": 20}, timeout=30)
print(f"   skip=0 正常回归 → HTTP {r.status_code}｜回体条数 {len(r.json() if isinstance(r.json(), list) else r.json().get('items', []))}")
if r.status_code != 200:
    red.append(f"① 正常翻页被打回 {r.status_code}（这条是回归，不该动）")

# ── ② 空标题 ───────────────────────────────────────────────────────────────
r = httpx.post(f"{BASE}/api/notes/", headers=H, json={"title": "", "content": "探针正文"}, timeout=30)
detail = str(r.json().get("detail"))
print(f"\n② 空标题 → HTTP {r.status_code}｜detail {detail!r}")
if r.status_code != 422 or "标题" not in detail:
    red.append(f"② 空标题那一趟没回「标题…」那句中文（实读 {r.status_code}／{detail!r}）")

# ── ③ 整个 body 形状不对 ───────────────────────────────────────────────────
r = httpx.post(f"{BASE}/api/notes/", headers=H, json="这一串根本不是对象", timeout=30)
detail = str(r.json().get("detail"))
print(f"\n③ body 是裸字符串 → HTTP {r.status_code}｜detail {detail!r}")
if r.status_code != 422:
    red.append(f"③ 错型 body 没回 422（实读 {r.status_code}；修之前 main.py 那个处理器自己崩成 500）")
r = httpx.post(f"{BASE}/api/notes/", headers=H, data={"title": "表单打给 JSON 口"}, timeout=30)
print(f"   表单打给 JSON 口 → HTTP {r.status_code}｜detail {str(r.json().get('detail'))[:60]!r}")
if r.status_code != 422:
    red.append(f"③ 表单那一趟没回 422（实读 {r.status_code}）")

# ── 先建一篇自己的临时笔记，给 ④ 当落点 ────────────────────────────────────
r = httpx.post(f"{BASE}/api/notes/", headers=H,
               json={"title": "现网探针 1019 审查四条", "content": "这是探针建的临时笔记，用完就删。"},
               timeout=60)
print(f"\n＋临时笔记 POST → HTTP {r.status_code}｜回体 {json.dumps(r.json(), ensure_ascii=False)[:160]}")
note_id = r.json().get("id") or (r.json().get("note") or {}).get("id")
assert note_id, "临时笔记没建出来，④ 没法打"

# ── ④ 跨表归属：别人名下的卡片地址 ─────────────────────────────────────────
foreign = db.query(NoteCard).filter(NoteCard.user_id != UID).filter(
    NoteCard.object_key.isnot(None)).first()
if foreign is None:
    print("\n④ 现网没有「别人名下已登记的卡片地址」，这一把我量不到——别记成已覆盖。")
else:
    fid = foreign.object_key
    print(f"\n④ 借一枚别人（users.id={foreign.user_id}）名下的卡片地址来绑到我的笔记：{fid[:38]}…")
    r = httpx.post(f"{BASE}/api/notes/{note_id}/assets", headers=H,
                   json={"items": [{"file_id": fid}]}, timeout=30)
    detail = str(r.json().get("detail"))
    print(f"   → HTTP {r.status_code}｜detail {detail!r}")
    db.expire_all()
    assets_now = db.query(func.count(Asset.id)).scalar()
    print(f"   库里 assets：{assets0} → {assets_now}（应当一个字没多）")
    if r.status_code != 400 or "不属于当前账号" not in detail:
        red.append(f"④ 别人的卡片地址没被 400 挡下（实读 {r.status_code}／{detail!r}）")
    if assets_now != assets0:
        red.append(f"④ 拒收那一趟还是多写了 {assets_now - assets0} 行 assets")

# ── ⑤ 后台"留空点加入"那一句 ───────────────────────────────────────────────
lr = httpx.post(f"{BASE}/api/admin/login", json={"token": settings.ADMIN_TOKEN}, timeout=30)
print(f"\n⑤ 后台登录 → HTTP {lr.status_code}")
if lr.status_code != 200:
    print("   后台没开或口令不对，这一把量不到（不是这一刀的红）")
else:
    AH = {"Authorization": f"Bearer {lr.json()['session']}"}
    r = httpx.post(f"{BASE}/api/admin/source-blocklist", headers=AH, json={"host": ""}, timeout=30)
    detail = str(r.json().get("detail"))
    print(f"   留空点加入 → HTTP {r.status_code}｜detail {detail!r}")
    if r.status_code != 400 or "例如" not in detail:
        red.append(f"⑤ 留空加入没回那句人话（实读 {r.status_code}／{detail!r}；修之前是 422 带英文词 host）")
    db.expire_all()
    print(f"   黑名单行数 {block0} → {db.query(func.count(SourceBlocklist.id)).scalar()}（应当没变）")

# ── 收尾：删净，核不变量 ────────────────────────────────────────────────────
dr = httpx.delete(f"{BASE}/api/notes/{note_id}", headers=H, timeout=60)
db.expire_all()
notes1 = db.query(func.count(Note.id)).scalar()
assets1 = db.query(func.count(Asset.id)).scalar()
cards1 = db.query(func.count(NoteCard.id)).scalar()
block1 = db.query(func.count(SourceBlocklist.id)).scalar()
print(f"\n收尾：删临时笔记 HTTP {dr.status_code}")
print(f"不变量：notes {notes0}→{notes1}｜assets {assets0}→{assets1}｜"
      f"note_cards {cards0}→{cards1}｜黑名单 {block0}→{block1}")
if (notes1, assets1, cards1, block1) != (notes0, assets0, cards0, block0):
    red.append("收尾有一样没回到进门那个数")

db.close()
print("\n" + ("⚠ 红的：" + "；".join(red) if red else "五把全过（④ 若上面声明了缺口，那一条不算过）"))
