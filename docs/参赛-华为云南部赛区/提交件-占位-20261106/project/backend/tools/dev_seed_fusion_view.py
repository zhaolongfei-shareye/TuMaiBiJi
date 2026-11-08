"""一次性：给融合后台那一页灌几行能看出排版的数，只为肉眼自证，不作判据。

跑法（本机）：
  cd backend && DATABASE_URL=sqlite:////tmp/fusion-view.db .venv/bin/python tools/dev_seed_fusion_view.py
  cd backend && DATABASE_URL=sqlite:////tmp/fusion-view.db JWT_SECRET_KEY=<32+位> ADMIN_TOKEN=<口令> \
    .venv/bin/python -m uvicorn app.main:app --port 8123
用完 `rm /tmp/fusion-view.db`。判据在 tests/test_admin_fusion.py，不在这里。

模板那十行读的是 `seed/poster_templates.json`（现网就是这一份），不是这里编的；
另外照同一套 `template_id` 各复制一份草稿与已下架，为的是让屏上三种状态都出现一次。
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.db.database import Base, SessionLocal, engine
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.poster_template import PosterTemplate
from app.models.share import Share
from app.models.user import User

Base.metadata.create_all(bind=engine)
db = SessionLocal()
now = datetime.now(timezone.utc).replace(tzinfo=None)

SOURCES = ["manual", "screenshot", "web_article", "wechat_article", "share_import", "preset"]
# 与 seed/poster_templates.json 里那十个 `template_id` 同名的几个：`used` 那两列数的是 tpl 字符串，
# 用假名字灌的话后台「卡片模板」每一行都会显示"出图 0 张"，看不出这一栏到底通没通。
TEMPLATES = ["card", "quote", "block", "lit"]

for i in range(9):
    db.add(User(openid=f"dev-openid-{i}", nickname=f"dev{i}",
                quota_bonus=[0, 10, 20, 0, 30, 0, 0, 15, 0][i],
                created_at=now - timedelta(days=i)))

for i in range(46):
    src = SOURCES[i % len(SOURCES)]
    db.add(Note(
        user_id=str(1 + i % 9),
        title=f"自证用第 {i} 篇",
        content="正文若干",
        source_type=src,
        imported_from={"from_user_id": "1", "share_id": 2} if src == "share_import" else None,
        created_at=now - timedelta(days=i % 14),
    ))

for i in range(20):
    tpl = TEMPLATES[i % len(TEMPLATES)]
    db.add(NoteCard(user_id=str(1 + i % 9), note_id=1 + i, tpl=tpl,
                    is_current=(i % 3 == 0), no_qr=(i % 5 == 0),
                    object_key=f"cloud://dev/{i}.jpg", width=1080, height=1440, file_size=81234))

SEED_TPL = json.loads((Path(__file__).resolve().parents[1] / "seed/poster_templates.json").read_text(encoding="utf-8"))
for row in SEED_TPL:
    db.add(PosterTemplate(**row))
# 同一套 template_id 的另外两态：部分唯一索引只管 live，所以这两份加得进去，屏上也才三种状态都有。
draft = dict(SEED_TPL[0]); draft.update(status="draft", sort_order=110, label="玉版宣（改配方中）")
grave = dict(SEED_TPL[1]); grave.update(status="archived", sort_order=120, label="摘句（旧版）")
db.add_all([PosterTemplate(**draft), PosterTemplate(**grave)])

for i in range(5):
    db.add(Invitation(inviter_id=1 + i % 9, invitee_id=2 + i % 9, reward=10 * (i + 1)))

for i in range(7):
    db.add(Share(user_id="1", note_id=1 + i, token=f"devtoken{i:04d}",
                 title=f"自证用第 {i} 篇", is_active=(i % 2 == 0)))

db.commit()
print({
    "users": db.query(User).count(),
    "notes": db.query(Note).count(),
    "cards": db.query(NoteCard).count(),
    "invitations": db.query(Invitation).count(),
    "shares": db.query(Share).count(),
})
db.close()
