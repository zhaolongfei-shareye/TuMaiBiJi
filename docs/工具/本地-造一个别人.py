#!/usr/bin/env python3
"""给 `验-转存与作者.js` 造一个"另一个人"，用完拆掉。只对本地的临时库说话。

为什么要它：站长 10-24 一句「为什么自己可以转存自己的……要限制」之后，
`POST /api/notes/from-share` 对**作者本人**当场回 400。那把尺子原来只有一枚登录态
（模拟器里那个账号），它拿同一枚钥匙既建分享又转存——于是它验的正是这一条新挡掉的路，
改完连着红 8 条。而"别人扫我的码存进去"那条真在生产上跑的路，一台模拟器变不出来，
所以这里凭空造一个账号，替他把那半条腿补上。

为什么能凭空造：`get_current_user` 只认两格——`users` 里有这一行、钥匙里的 `gen`
和行里的 `generation` 相等（`app/core/auth.py`）。openid 不参与鉴权，所以一个假 openid
加一枚现签的 JWT 就是一个能用的账号，不需要真的去过微信那道 code2session。

⚠ 三个边界，越过去这条链就不是它在测的那条了：
  1) **只吃本地临时库**。env 里的 `DATABASE_URL` 指到现网（那串 `api.agentsbin.cn`
     或 `ssh` 过去的库）就会在真实用户旁边多出一个假账号、并真建出一条公开分享。
  2) 建笔记与开分享走的是**真 HTTP 口**（`POST /api/notes/` → `POST /api/shares/`），
     所以分享快照、那张码、作者昵称都按现网同一套逻辑落库，不是手搓的行。
  3) 钥匙**不进命令行**：整份写进 `--out` 那个文件，Node 那头读文件、拆的时候也只传文件路径。
     这是站长的死规矩（值不进 argv），一枚临时钥匙也不破。

跑法（与那把尺子同一个 env）：
    cd backend && DATABASE_URL=sqlite:////tmp/wtsj_local_accept.db \
        JWT_SECRET_KEY=<与本地 uvicorn 同一串> SEC_CHECK_ENABLED=false EXTRACT_PROVIDER=none \
        ../docs/工具/本地-造一个别人.py --out /tmp/别人.json
    同上 …… --teardown /tmp/别人.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import httpx
from sqlalchemy.orm import sessionmaker

from app.core.auth import _create_token
from app.db.database import engine
from app.models.account import Account, AccountIdentity
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.user import User
from app.services import accounts, generation

AUTHOR_NAME = "本地验收作者"


def _make(out: Path) -> int:
    db = sessionmaker(bind=engine)()
    mark = os.environ.get("RULER_MARK", "tmp")
    user = User(openid=f"local-ruler-other-{mark}", language="zh")
    user.generation = generation.allocate(db)
    db.add(user)
    db.commit()
    db.refresh(user)
    acct = accounts.ensure_for_user(db, user)
    db.commit()

    base = os.environ.get("RULER_BASE", "http://127.0.0.1:8010")
    hdr = {"Authorization": f"Bearer {_create_token(user.id, user.generation)}",
           "content-type": "application/json"}
    title = f"别人那篇 {mark}"
    with httpx.Client(base_url=base, timeout=20) as c:
        note = c.post("/api/notes/", headers=hdr, json={
            "title": title,
            "summary": "这一篇属于一个凭空造出来的账号，专门给尺子当另一个人。",
            "tags": ["验收", "别人"],
            "key_points": ["别人写的要点甲"],
            "key_links": ["https://example.com/other"],
            "source_url": "https://example.com/other",
        })
        note.raise_for_status()
        note_id = note.json()["id"]
        share = c.post("/api/shares/", headers=hdr, json={"note_id": note_id, "author_name": AUTHOR_NAME})
        share.raise_for_status()
        token = share.json()["token"]

    out.write_text(json.dumps({
        "user_id": user.id,
        "account_id": acct.id,
        "jwt": hdr["Authorization"].split(" ", 1)[1],
        "note_id": note_id,
        "share_token": token,
        "title": title,
        "author_name": AUTHOR_NAME,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"造好：user {user.id} 笔记 {note_id} 码 {token}")
    return 0


def _teardown(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    base = os.environ.get("RULER_BASE", "http://127.0.0.1:8010")
    hdr = {"Authorization": f"Bearer {data['jwt']}"}
    with httpx.Client(base_url=base, timeout=20) as c:
        # 删**这一名账号名下的全部笔记**，不是只删它自己写的那一篇：别人扫它的码存进来的那些
        # 副本也归它名下，只删原文就是拿一台临时库留一地孤儿（10-24 冒烟实测：拆完 users 0、
        # notes 还剩 2）。删除走 HTTP 口而不是直查表——那条路上才会连带关码、清 assets 行。
        raw = c.get("/api/notes/?limit=100", headers=hdr).json()
        rows = raw if isinstance(raw, list) else raw.get("items", [])
        for row in rows:
            c.delete(f"/api/notes/{row['id']}", headers=hdr)
    db = sessionmaker(bind=engine)()
    db.query(Note).filter(Note.user_id == str(data["user_id"])).delete(synchronize_session=False)
    db.query(User).filter(User.id == data["user_id"]).delete(synchronize_session=False)
    # `invitations` 那本账**故意不带外键**（模型写着"源笔记删了也不该把账一起带走"），所以真账号
    # 转存过留下的那行不会随删笔记消失。这一名是造出来的人，账底下那两个 id 都是空的，得一起抹。
    db.query(Invitation).filter(
        (Invitation.inviter_id == data["user_id"]) | (Invitation.invitee_id == data["user_id"])
    ).delete(synchronize_session=False)
    db.query(AccountIdentity).filter(AccountIdentity.account_id == data["account_id"]).delete(synchronize_session=False)
    db.query(Account).filter(Account.id == data["account_id"]).delete(synchronize_session=False)
    db.commit()
    db.close()
    path.unlink(missing_ok=True)
    print(f"拆净：user {data['user_id']} 名下 {len(rows)} 篇一起删掉")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--teardown", type=Path)
    a = ap.parse_args()
    if a.teardown:
        return _teardown(a.teardown)
    if not a.out:
        print("要么 --out <文件>（造），要么 --teardown <那个文件>（拆）", file=sys.stderr)
        return 2
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        # 不带着走就退到 `app.core.config` 里那个默认库。默认那串指向的是这台机器上的开发库，
        # 而不是这一把尺子那份额时的临时库——写进去就是往一个不是本次验收的库里塞假账号。
        print("没带 DATABASE_URL（这一把尺子那份临时库），拒绝跑", file=sys.stderr)
        return 3
    if "sqlite" not in url.lower():
        print(f"DATABASE_URL 不是 sqlite 临时库（读到的是 {url[:12]}…），拒绝跑", file=sys.stderr)
        return 3
    return _make(a.out)


if __name__ == "__main__":
    raise SystemExit(main())
