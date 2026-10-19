"""现网端到端：相册型（图片消息）那一帖在现网能不能真存下图。

跑法（凭据不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网相册型那一帖.py

它只做三件事：拿 deploy-test 那个号把这条真链接推进生产的入库队列 → 等任务跑完 →
把回体的四个计数和库里那几行 assets 一起读出来，最后删掉这一篇。
跟 `探-现网外链贴图.py` 的区别：那把量的是图文型（`#js_content` 里有 `<img>`），
这一把量的是第四十三次部署那一刀新覆盖的第二种形状——图在页面 JS 里、页面上没有长正文。
"""
import json
import time

import httpx
from sqlalchemy import func

from app.core.auth import _sign
from app.db.database import SessionLocal
from app.models.asset import Asset
from app.models.note import Note
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
ALBUM_URL = "https://mp.weixin.qq.com/s/1FOoWv45lty7r7MZ88V9aQ"

db = SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
assert u, "找不到 deploy-test 那个号，停手"
H = {"Authorization": f"Bearer {_sign(str(u.id), u.generation or 1)}"}

rows0 = db.query(func.count(Asset.id)).scalar()
print(f"身份：users.id={u.id}｜进门全站 assets {rows0} 行")

r = httpx.post(f"{BASE}/api/ingest/url", headers=H, data={"url": ALBUM_URL}, timeout=60)
print(f"入口 HTTP {r.status_code}")
if r.status_code != 200:
    print("回体：", r.text[:300])
    raise SystemExit(1)
tid = r.json()["task_id"]

st = {}
for _ in range(90):
    time.sleep(2)
    st = httpx.get(f"{BASE}/api/tasks/{tid}", headers=H, timeout=30).json()
    if st.get("status") in ("completed", "failed"):
        break
print("任务回体：", json.dumps(st, ensure_ascii=False)[:600])
if st.get("status") != "completed":
    raise SystemExit("任务没跑完，停手")

payload = st.get("result") or {}
note_id = payload.get("note_id")
db.expire_all()
note = db.get(Note, note_id)
rows = db.query(Asset).filter(Asset.note_id == note_id).all()

print(f"\n① 四个计数（回体）：总 {payload.get('images_total')}｜存下 {payload.get('images_kept')}"
      f"｜没存上 {payload.get('images_failed')}｜截掉 {payload.get('images_truncated')}")
print(f"② 库里 assets：{len(rows)} 行｜全 cloud:// = {all((r.object_key or '').startswith('cloud://') for r in rows)}"
      f"｜体积 {[r.file_size for r in rows]}｜宽高 {[r.width for r in rows]}×{[r.height for r in rows]}"
      f"｜状态 {sorted({r.backup_status for r in rows})}")
print(f"③ 正文：original_content {len(note.original_content or '')} 字｜标题 {note.title!r}")
snap = note.imported_from if isinstance(note.imported_from, dict) else {}
print(f"④ 来源快照：作者 {snap.get('author_name')!r}｜四计数 "
      f"{ {k: snap.get(k) for k in ('images_total', 'images_kept', 'images_failed', 'images_truncated')} }")
print(f"⑤ 键是否一致：库里 {len(rows)} 行 vs 回体 kept {payload.get('images_kept')} → "
      f"{len(rows) == (payload.get('images_kept') or 0)}")

det = httpx.get(f"{BASE}/api/notes/{note_id}", headers=H, timeout=30).json()
as_list = httpx.get(f"{BASE}/api/notes/{note_id}/assets", headers=H, timeout=30).json()
lst = httpx.get(f"{BASE}/api/notes/", headers=H, params={"limit": 50}, timeout=30).json()
items = lst if isinstance(lst, list) else lst.get("items", [])
mine = [n for n in items if n.get("id") == note_id]
print(f"⑥ 详情接口 assets {len(as_list)} 条｜列表 has_source = {[n.get('has_source') for n in mine]}")

kept_bytes = sum(r.file_size or 0 for r in rows)   # 删之前先算：删完这些 ORM 对象就过期了，再读会抛 ObjectDeletedError
dr = httpx.delete(f"{BASE}/api/notes/{note_id}", headers=H, timeout=60)
db.expire_all()
rows1 = db.query(func.count(Asset.id)).scalar()
print(f"\n⑦ 收尾：删这一篇 HTTP {dr.status_code}｜全站 assets {rows0} → {rows1}")
print(f"⚠ 云上那几枚对象只能客户端删，这一趟会在桶里留下 "
      f"{len(rows)} 个探针对象（约 {kept_bytes / 1024:.0f} KB）。")
db.close()
