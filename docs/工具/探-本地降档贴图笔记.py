"""一次性空库跑降档那一趟：真 OCR 引擎（rapidocr）＋真建笔记，不碰任何共享库。

跑法（本地，两分钟不到）：
    cd backend && .venv/bin/python ../docs/工具/探-本地降档贴图笔记.py

为什么带那张有字的图：它是对照组。没有它，"纯白图认不出字"和"这台机器上引擎根本没起来"
读出来的数是一样的（都是空串），后者会把整条链的结论一起作废——引擎起不来时降档那一趟
照样"通过"，可它通过的原因根本不是我们要的那个原因。

数据库落在 /tmp/tumaibiji_e2e_imgnote.db：每次进来先删干净，所以"库里现在有几篇"是一个
真数，不是上一次留下的。Redis 那一头不碰：`set_task_status` 在这里换成一个只往列表里攒的
替身，回体那一份照样逐字打出来读。
"""
import asyncio
import os
import sys
from io import BytesIO

DB = "/tmp/tumaibiji_e2e_imgnote.db"
os.environ["DATABASE_URL"] = f"sqlite:////{DB.lstrip('/')}"
os.environ["JWT_SECRET_KEY"] = "e2e-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"   # 对照那一趟不许出网

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "backend"))

from PIL import Image, ImageDraw  # noqa: E402

from app.db.database import Base, SessionLocal, engine  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_profile import UserProfile  # noqa: E402
from app.services.ocr import ocr_images  # noqa: E402
import app.tasks.ingest_tasks as tasks  # noqa: E402

for suffix in ("", "-journal", "-wal", "-shm"):
    if os.path.exists(DB + suffix):
        os.remove(DB + suffix)
Base.metadata.create_all(bind=engine)


def png_with_text() -> bytes:
    img = Image.new("RGB", (760, 220), "white")
    d = ImageDraw.Draw(img)
    d.text((40, 90), "HELLO 12345", fill="black")
    d.rectangle([36, 84, 250, 118], outline="black", width=2)
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def png_blank() -> bytes:
    img = Image.new("L", (900, 1200), 255)
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


db = SessionLocal()
user = User(openid="e2e-img-note-owner", nickname=None)
db.add(user)
db.commit()
db.refresh(user)
db.add(UserProfile(user_id=str(user.id), name="阿麦"))
db.commit()
UID, GEN = str(user.id), user.generation
print(f"一次性空库：用户 {UID}，名片名称「阿麦」，昵称 None")

statuses = []
tasks.set_task_status = lambda tid, st, res=None, **kw: statuses.append((st, res))

# ① 对照组：引擎真读得出字吗
text_with = asyncio.run(ocr_images([png_with_text()]))
print(f"① 有字那张，OCR 读回 {len(text_with.strip())} 个非空白字符：{text_with.strip()[:40]!r}")
if not text_with.strip():
    print("   ⇒ 这台机器上 OCR 引擎读不出字。下面每一条红都不算这一刀的结论，先修引擎再跑。")
    sys.exit(2)

# ② 真走一遍：纯白图 → 认不出字 → 降档
blank = [png_blank()]
print(f"② 纯白图 OCR 读回：{asyncio.run(ocr_images(blank)).strip()!r}（空串＝认不出字）")
statuses.clear()
tasks.process_screenshots_task("e2e-1", UID, blank, generation=GEN)
status, payload = statuses[-1]
print(f"   任务回体：{status}｜{payload}")
note = db.get(Note, payload["note_id"]) if payload else None
print(f"   库里那一行：title={note.title!r} source_type={note.source_type!r} "
      f"原文 {len(note.original_content or '')} 字｜摘要 {len(note.summary or '')} 字｜"
      f"要点 {note.key_points!r}｜imported_from {note.imported_from!r}")

# ③ 连存第二篇：尾号要接上
statuses.clear()
tasks.process_screenshots_task("e2e-2", UID, blank, generation=GEN)
print(f"③ 第二篇：{statuses[-1][1]['title']!r}（第一篇是 {note.title!r}）")

# ④ 反向：认得出字那一趟走的还是老路，不许被降档抢走
statuses.clear()
tasks.process_screenshots_task("e2e-3", UID, [png_with_text()], generation=GEN)
last = statuses[-1]
row = db.get(Note, last[1]["note_id"]) if last[1] else None
print(f"④ 有字那张的任务：{last[0]}｜回体带 image_only={bool((last[1] or {}).get('image_only'))}｜"
      f"库里那行 title={row.title!r}｜原文 {len(row.original_content or '')} 字")

print(f"收尾读数：库里 notes 共 {db.query(Note).count()} 行"
      f"（对照那趟 1 行＋降档 2 行；降档那两行标题应带「阿麦」与同一个日期）")
db.close()
