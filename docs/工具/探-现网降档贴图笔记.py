"""现网端到端：认不出字那一趟，是不是真降档成一篇带自动标题的贴图笔记。

跑法（凭据不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网降档贴图笔记.py

三趟，缺一不可：
  A、B 两张纯白图 → 期望 `completed` ＋ `image_only` ＋ `{名称}图片笔记 {MMDD}{01,02}`；
  C 一张有字的图（对照）→ 期望走老路：`completed`、回体**没有** `image_only`、`original_content` 非空。
没有 C，"A/B 降档了"和"这台机器 OCR 根本没起来"是同一个读数——那两种情况下都不该把绿报出去。

**期望值一律在这把尺子里独立重算**，不 import 被测的那三个函数：名称按名片名称→昵称→「我的」
现读现拼，日期按 `utcnow + 8h` 自己格式化，序号自己扫当天这一族的标题尾号。拿实现算期望值
等于让实现给自己打分，现网上尤其不许。

收尾把三篇删净，并核一条不变量：该号名下 notes 行数回到进门那个数。
"""
import io
import json
import re
import time
from datetime import datetime, timedelta, timezone

import httpx
from PIL import Image, ImageDraw
from sqlalchemy import func, text

from app.core.auth import _sign
from app.db.database import SessionLocal
from app.models.note import Note
from app.models.user import User
from app.models.user_profile import UserProfile

BASE = "https://api.agentsbin.cn/wtsj"
TAIL = re.compile(r"图片笔记 (\d{4})(\d{2,})$")

db = SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
assert u, "找不到 deploy-test 那个号，停手"
UID = str(u.id)
H = {"Authorization": f"Bearer {_sign(UID, u.generation or 1)}"}

# 独立重算的三件：名称、北京日、当天已有尾号
profile = db.query(UserProfile).filter(UserProfile.user_id == UID).first()
prefix = next((c.strip() for c in ((profile.name if profile else None), u.nickname) if c and c.strip()),
              "我的")
cn_now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8)))
MMDD = cn_now.strftime("%m%d")
win_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
    hours=cn_now.hour + cn_now.minute / 60 + cn_now.second / 3600)
rows0 = db.query(func.count(Note.id)).scalar()
mine0 = db.query(func.count(Note.id)).filter(Note.user_id == UID).scalar()
today = [t for (t,) in db.query(Note.title).filter(
    Note.user_id == UID, Note.source_type == "screenshot",
    Note.created_at >= win_start.replace(microsecond=0)).all()]
expect_seq = max([int(m.group(2)) for m in (TAIL.search(t) for t in today)
                  if m and m.group(1) == MMDD] or [0]) + 1
print(f"身份：users.id={UID}｜名片名称={profile.name if profile else None!r}｜昵称={u.nickname!r}"
      f"⇒ 期望前缀 {prefix!r}")
print(f"进门：全站 notes {rows0} 行｜该号 {mine0} 行｜北京日 {MMDD}｜窗口起点(朴素UTC)"
      f" {win_start.replace(microsecond=0)}｜期望尾号 {expect_seq:02d}")


def png_blank() -> bytes:
    buf = io.BytesIO()
    Image.new("L", (900, 1200), 255).save(buf, "PNG")
    return buf.getvalue()


def png_text() -> bytes:
    img = Image.new("RGB", (900, 260), "white")
    d = ImageDraw.Draw(img)
    d.text((60, 110), "HELLO 12345 PROBE", fill="black")
    d.rectangle([56, 104, 420, 142], outline="black", width=3)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def run_one(label: str, blob: bytes) -> dict:
    up = httpx.post(f"{BASE}/api/ingest/screenshots/stage", headers=H,
                    files={"images": ("probe.png", blob, "image/png")}, timeout=120)
    assert up.status_code == 200, f"{label} stage HTTP {up.status_code} {up.text[:200]}"
    bid = up.json()["batch_id"]
    pr = httpx.post(f"{BASE}/api/ingest/screenshots/process", headers=H,
                    data={"batch_id": bid}, timeout=60)
    assert pr.status_code == 200, f"{label} process HTTP {pr.status_code} {pr.text[:200]}"
    tid = pr.json()["task_id"]
    st = {}
    for _ in range(90):
        time.sleep(2)
        st = httpx.get(f"{BASE}/api/tasks/{tid}", headers=H, timeout=30).json()
        if st.get("status") in ("completed", "failed"):
            break
    print(f"\n【{label}】任务回体：{json.dumps(st, ensure_ascii=False)[:420]}")
    return st.get("result") or {}


made = []
try:
    for label, blob in (("A 纯白第一张", png_blank()), ("B 纯白第二张", png_blank()),
                        ("C 有字那张（对照）", png_text())):
        payload = run_one(label, blob)
        nid = payload.get("note_id")
        assert nid, f"{label} 回体里没有 note_id——这就是改前那句「OCR 未识别到文字内容」的现场"
        made.append(nid)
        db.expire_all()
        note = db.get(Note, nid)
        if label.startswith("C"):
            print(f"  对照读数：image_only={bool(payload.get('image_only'))}"
                  f"｜degraded={payload.get('degraded')}｜original_content {len(note.original_content or '')} 字"
                  f"｜标题 {note.title!r}")
            assert len(note.original_content or "") > 0, "对照那张也没认出一张字 ⇒ 引擎不可用，本把的绿不算数"
            assert not payload.get("image_only"), "有字的这篇被降档抢走了"
        else:
            want = f"{prefix}图片笔记 {MMDD}{expect_seq:02d}"
            expect_seq += 1
            print(f"  库里那一行：title={note.title!r}（独立重算的期望 {want!r}）"
                  f"｜source_type={note.source_type!r}｜原文 {len(note.original_content or '')} 字"
                  f"｜摘要 {note.summary!r}｜要点 {note.key_points!r}"
                  f"｜imported_from {note.imported_from!r}")
            assert note.title == want, f"标题对不上：实读 {note.title!r} ≠ 期望 {want!r}"
            assert payload.get("image_only") is True
            assert note.source_type == "screenshot", "他点的是来源那一格不动"
            # 他补的那半句：完全识别不了也不许留空白格——纯白图这篇的摘要该落「图册」，
            # 而原文与要点两格照旧空着（他点甲：只写摘要那一格）。
            assert note.summary == "图册", f"纯白图这篇摘要该是「图册」，实读 {note.summary!r}"
            assert not note.original_content and not note.key_points
            det = httpx.get(f"{BASE}/api/notes/{nid}", headers=H, timeout=30)
            print(f"  详情接口 HTTP {det.status_code}｜回体 title={det.json().get('title')!r}")
finally:
    for nid in made:
        httpx.delete(f"{BASE}/api/notes/{nid}", headers=H, timeout=60)
    db.expire_all()
    mine1 = db.query(func.count(Note.id)).filter(Note.user_id == UID).scalar()
    print(f"\n收尾：删净 {len(made)} 篇｜该号名下 notes {mine0} → {mine1}"
          f"｜回到进门那个数 = {mine0 == mine1}")
    left = db.execute(text("select id, title from notes where title like '%图片笔记 %' limit 5")).all()
    print(f"残留读数：库里标题带「图片笔记」的行 {len(left)} 行 {left}")
    db.close()
