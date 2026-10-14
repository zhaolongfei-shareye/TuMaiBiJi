"""§8.232 新用户那一篇预置笔记：只在"这一次登录真的生出一个新账号"那一次写。

这批只管两件事，第二件比第一件更容易做错：

1. **种得对**——四字段逐字等于种子、回体带 id、页头那一列照实算成 1。
2. **不许复活**——用户把它删掉、下次冷启（真走一遍 `login_or_register`），它不能再回来。
   这一条是唯一能证明"种子没挂在每次 `_doLogin` 上"的判据（§8.232 判据 2），
   所以它是这批里最硬的一条；下面 `test_删掉预置那一篇之后_再冷启三次也不许回来`。

顺带钉住两条被这一改**威胁到**的旧口径（都是钱，不是观感）：
- 邀请归因那条不认的判据是"名下已经有笔记"——先种后认会让每个新用户永久无法被归因；
- "动笔首篇 +10"判的是"他名下第一条"——预置那一篇先占掉那一名，邀请人就永远收不到那 +10。
两条都由 `preset_note.authored_count`（只数他自己写的）兜住，各钉一条用例。

不测的：卡片那一张是端上出的（服务端没有画布，§8.232 口径 5），这里钉不到。
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_v1_account_deletion import _fresh_session  # noqa: E402
from test_v1_auth_and_link import _bearer, _reload  # noqa: E402

from app.models.note import Note  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import preset_note  # noqa: E402


@pytest.fixture
def db():
    session = _fresh_session()
    # 分享那一组用例要 `shares`/`note_cards`，而 `_fresh_session` 只删建它那六张——
    # 这里补齐"全部表都在"这个前提（create_all 对已存在的表一个字不动），
    # 否则本文件单独跑是绿的、跟着整批跑因为别人先建过表也是绿的，两种绿都不是自证。
    from app.db.database import Base, engine
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


def _login(client, monkeypatch, openid, inviter=None):
    """走真那条注册/登录路（`_wechat_code2session` 换成假 openid），回登录响应体。"""
    from app.core import auth as auth_core

    async def fake(code):
        return {"openid": openid, "session_key": "sk", "unionid": None}

    monkeypatch.setattr(auth_core, "_wechat_code2session", fake)
    body = {"code": "pytest"}
    if inviter is not None:
        body["inviter"] = inviter
    resp = client.post("/api/auth/wechat", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _notes_of(db, openid):
    user = _reload(db).query(User).filter(User.openid == openid).one()
    return (
        _reload(db).query(Note).filter(Note.user_id == str(user.id)).order_by(Note.id).all()
    )


def test_新用户第一次登录就有那一篇预置笔记(client, db, monkeypatch):
    resp = _login(client, monkeypatch, "pm-new-1")
    rows = _notes_of(db, "pm-new-1")
    seed = preset_note.seed_row()
    assert len(rows) == 1, [r.title for r in rows]
    got = rows[0]
    assert got.source_type == preset_note.PRESET_SOURCE_TYPE
    # 四字段逐字等于种子：种下去的必须是盘上那一份，不是路由里现拼的第二份真相。
    assert (got.title, got.summary, got.tags, got.key_points) == (
        seed["title"], seed["summary"], seed["tags"], seed["key_points"]
    )
    assert got.content and got.original_content == got.content
    assert resp["seeded_note_id"] == got.id


def test_第二次登录不许再种第二篇(client, db, monkeypatch):
    _login(client, monkeypatch, "pm-new-2")
    resp = _login(client, monkeypatch, "pm-new-2")   # 冷启重跑一次 _doLogin
    assert len(_notes_of(db, "pm-new-2")) == 1
    assert resp["seeded_note_id"] is None


def test_删掉预置那一篇之后_再冷启三次也不许回来(client, db, monkeypatch):
    """§8.232 判据 2 的唯一证明：种子挂在建号那一个分支上，不是挂在登录回调上。"""
    first = _login(client, monkeypatch, "pm-kill-3")
    headers = _bearer(first["token"])
    assert client.delete(f"/api/notes/{first['seeded_note_id']}", headers=headers).status_code == 200
    for _ in range(3):
        resp = _login(client, monkeypatch, "pm-kill-3")
        assert resp["seeded_note_id"] is None
    assert _notes_of(db, "pm-kill-3") == []


def test_老用户登录永远不会种(client, db, monkeypatch):
    """升级之前就已经有笔记的人：不许因为他名下"看起来"少了什么就给他补一篇。"""
    from app.services import accounts

    s = _reload(db)
    old = User(openid="pm-old-1", generation=1)
    s.add(old)
    s.commit()
    accounts.ensure_for_user(s, old)
    for _ in range(2):
        resp = _login(client, monkeypatch, "pm-old-1")
        assert resp["seeded_note_id"] is None
    assert _notes_of(db, "pm-old-1") == []


def test_页头那一列笔记照实算成一(client, db, monkeypatch):
    """§8.232 口径 6：预置那一篇进计数（新用户看到 1 而不是 0）。"""
    resp = _login(client, monkeypatch, "pm-count-1")
    got = client.get("/api/user/quota", headers=_bearer(resp["token"])).json()
    assert got["used"] == 1, got


def test_带着邀请人来注册_归因照样认(client, db, monkeypatch):
    """归因那条不认的判据是"名下已经有他自己写的笔记"——所以播种必须排在归因之后。

    这一条是这一批最容易被下一次改动撞掉的一条：把两行的顺序换一下，
    库里不会报错、接口不会变红，只是**所有通过邀请进来的新用户从此不能被归因**，
    那 +10 从此结不出来。
    """
    inviter = _login(client, monkeypatch, "pm-inviter")
    inviter_id = inviter["user_id"]
    resp = _login(client, monkeypatch, "pm-invitee-1", inviter=inviter_id)
    user = _reload(db).query(User).filter(User.openid == "pm-invitee-1").one()
    assert user.invited_by == inviter_id, user.invited_by
    rows = _notes_of(db, "pm-invitee-1")
    assert len(rows) == 1 and rows[0].source_type == preset_note.PRESET_SOURCE_TYPE


def test_预置篇存在时他自己写的第一篇_邀请人那十仍然结得出来(client, db, monkeypatch):
    """`_is_his_first_note` 原来判的是"名下正好一条"——预置那一篇会把那一名占掉。

    换成"他自己写的那几篇正好一条"之后，这一笔照结；改回去（读 used_count）这条就红，
    而线上表现是：邀请人少 10 分，没有任何一处报错。
    """
    from app.services import quota

    inviter_row = _login(client, monkeypatch, "pm-inviter-2")
    inviter_id = inviter_row["user_id"]
    before = quota.mind_score(_reload(db).query(User).filter(User.id == inviter_id).one())
    resp = _login(client, monkeypatch, "pm-invitee-2", inviter=inviter_id)
    headers = _bearer(resp["token"])

    created = client.post("/api/notes/", headers=headers, json={
        "title": "他自己写的第一篇", "summary": "两句摘要。", "tags": ["测试"],
        "key_points": ["一条要点"], "content": "正文", "original_content": "正文",
    })
    assert created.status_code == 200, created.text
    after = quota.mind_score(_reload(db).query(User).filter(User.id == inviter_id).one())
    assert after - before == quota.INVITE_REWARD, (before, after)

    # 第二次动笔不许再结（那半边的部分唯一索引本来就在管这件事，这里钉的是它没被绕开）。
    again = client.post("/api/notes/", headers=headers, json={
        "title": "他自己写的第二篇", "summary": "", "tags": [], "key_points": [],
        "content": "正文", "original_content": "正文",
    })
    assert again.status_code == 200
    latest = quota.mind_score(_reload(db).query(User).filter(User.id == inviter_id).one())
    assert latest == after, (after, latest)


def test_那一篇走的是普通笔记那条链(client, db, monkeypatch):
    """§8.232 判据 4：能改、能删、能分享，服务端不为它开任何特殊分支。"""
    resp = _login(client, monkeypatch, "pm-plain-1")
    headers = _bearer(resp["token"])
    nid = resp["seeded_note_id"]

    got = client.get(f"/api/notes/{nid}", headers=headers)
    assert got.status_code == 200 and got.json()["source_type"] == preset_note.PRESET_SOURCE_TYPE

    put = client.put(f"/api/notes/{nid}", headers=headers, json={"title": "改过的标题"})
    assert put.status_code == 200 and put.json()["title"] == "改过的标题", put.text

    share = client.post("/api/shares/", headers=headers, json={"note_id": nid})
    assert share.status_code == 200, share.text
    assert share.json().get("token")


def test_种子读不出来时登录照样成(client, db, monkeypatch):
    """首屏空着比进不了门轻。种子那一份 JSON 坏掉（少键／文件没进镜像）不许把登录回成 500。"""
    from app.services import preset_note as pn

    def boom(path: str = "") -> dict:
        raise ValueError("种子读不到")

    monkeypatch.setattr(pn, "seed_row", boom)
    resp = _login(client, monkeypatch, "pm-bad-seed-1")
    assert resp["seeded_note_id"] is None
    assert _notes_of(db, "pm-bad-seed-1") == []


def test_authored_count_与_used_count_是两条口径(client, db, monkeypatch):
    """一条数全表（页头那一列照实算），一条只数他自己写的（归因与结钱判的是它）。

    谁哪天把这两条并成一条，就有一边是假的：并成 used_count → 邀请奖励结不出来；
    并成 authored_count → 新用户页头那一列读 0，而他屏上明明有一篇。
    """
    from app.services import quota

    resp = _login(client, monkeypatch, "pm-two-counts")
    user = _reload(db).query(User).filter(User.openid == "pm-two-counts").one()
    assert quota.used_count(db, user) == 1
    assert preset_note.authored_count(db, user.id) == 0
