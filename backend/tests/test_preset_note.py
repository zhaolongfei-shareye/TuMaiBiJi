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
    """§8.232 判据 2 的唯一证明：种子挂在建号那一个分支上，不是挂在登录回调上。

    ⚠ 10-14 起这一篇**从接口删不掉了**（站长「默认的不能删除」，见下面两条），所以这里改成
    直接从库里抹掉那一行。这不影响这一条证明的东西——它判的是"名下没有预置篇了，再登录会不会补一篇"，
    抹掉的方式是 API 还是 ORM 与那个分支无关。用 API 删反而会被新那道闸挡成 400。
    """
    first = _login(client, monkeypatch, "pm-kill-3")
    s = _reload(db)
    row = s.query(Note).filter(Note.id == first["seeded_note_id"]).one()
    s.delete(row)
    s.commit()
    for _ in range(3):
        resp = _login(client, monkeypatch, "pm-kill-3")
        assert resp["seeded_note_id"] is None
    assert _notes_of(db, "pm-kill-3") == []


def test_那一篇删不掉_接口回那一句而且行还在(client, db, monkeypatch):
    """站长 10-14「默认的不能删除」：闸在服务端，回体带一句能念给人听的原因。

    钉三样：状态码是 400（不是 403／500——403 会被客户端念成"票坏了"去重登）、
    那句原因是 `preset_note.PRESET_NOTE_KEEP_MSG` 那一枚（客户端原样当吐司念，两处不许各写一遍）、
    库里那一行还在（只回一句话、把行删了，是最坏的那一种组合）。
    """
    resp = _login(client, monkeypatch, "pm-keep-1")
    headers = _bearer(resp["token"])
    nid = resp["seeded_note_id"]
    got = client.delete(f"/api/notes/{nid}", headers=headers)
    assert got.status_code == 400, got.text
    assert got.json()["detail"] == preset_note.PRESET_NOTE_KEEP_MSG, got.json()
    assert [n.id for n in _notes_of(db, "pm-keep-1")] == [nid]
    # 页头那一列也不许跟着掉：它判的是"名下有几篇"，不是"删得掉几篇"
    assert client.get("/api/user/quota", headers=headers).json()["used"] == 1


def test_他自己写的那一篇照旧删得掉(client, db, monkeypatch):
    """反向对照：这道闸只认 `source_type == "preset"`，不许顺手把普通笔记一起锁上。

    把判据写成"名下第一条／id 最小的那条"的话，这一条会红——那正是最容易写错的那一种形状：
    他自己的第一篇恰好也占那个位置，从此他删不掉自己写的东西。
    """
    resp = _login(client, monkeypatch, "pm-keep-2")
    headers = _bearer(resp["token"])
    s = _reload(db)
    mine = Note(user_id=str(s.query(User).filter(User.openid == "pm-keep-2").one().id),
                title="他自己写的一篇", content="正文", source_type="manual")
    s.add(mine)
    s.commit()
    got = client.delete(f"/api/notes/{mine.id}", headers=headers)
    assert got.status_code == 200, got.text
    assert [n.id for n in _notes_of(db, "pm-keep-2")] == [resp["seeded_note_id"]]


def test_那一篇的卡片撤不掉_普通那篇的卡片照旧撤得掉(client, db, monkeypatch):
    """同一把闸的第二半：「默认的不能删除」说的是那一篇，也说的是那一张。

    代价记在台账 §8.236：一篇一张，而界面上"换一套模板"是先删再画 ⇒ 这一张会把预置那篇的模板钉死。
    这一条同时钉住"只锁那一篇的卡片"——他自己那篇的卡片必须照旧撤得掉。
    """
    resp = _login(client, monkeypatch, "pm-keep-3")
    headers = _bearer(resp["token"])
    uid = resp["user_id"]
    nid = resp["seeded_note_id"]
    assert client.post(f"/api/notes/{nid}/card", headers=headers,
                       json={"file_id": f"cloud://tumaibiji.abc/cards/preset-{nid}.jpg",
                             "tpl": "classic", "no_qr": False}).status_code == 200

    got = client.delete(f"/api/notes/{nid}/card", headers=headers)
    assert got.status_code == 400, got.text
    assert got.json()["detail"] == preset_note.PRESET_CARD_KEEP_MSG, got.json()
    assert client.get(f"/api/notes/{nid}/card", headers=headers).json()["card"], "那一行不许被撤掉"

    s = _reload(db)
    mine = Note(user_id=str(uid), title="他自己写的一篇", content="正文", source_type="manual")
    s.add(mine)
    s.commit()
    assert client.post(f"/api/notes/{mine.id}/card", headers=headers,
                       json={"file_id": f"cloud://tumaibiji.abc/cards/mine-{mine.id}.jpg",
                             "tpl": "classic", "no_qr": False}).status_code == 200
    assert client.delete(f"/api/notes/{mine.id}/card", headers=headers).status_code == 200


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
    """§8.232 判据 4：能读、能改、能分享，服务端不为它开特殊分支。

    ⚠ 这一条原来还写着"能删"——10-14 站长改口「默认的不能删除」，那半句作废，
    删的那一半由上面 `test_那一篇删不掉_接口回那一句而且行还在` 钉。除"删"之外仍然没有分支。
    """
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


# ==== 10-18 起这一篇归后台管（站长「默认笔记请在管理后台配置，我可以编辑修改，日后更新不需要发版」）====
#
# 这批钉的是"库里那份优先、坏了要落回包里、改它不许回头改已经种下去的那几篇"。
# 三条里最硬的是第三条：它的反面是"后台一改，全站用户那篇自带的说明跟着变"，
# 那是替用户改掉他自己名下的一条数据，比不生效危险得多。

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
GOOD = {
    "title": "后台写的那一句标题",
    "summary": "后台写的摘要",
    "tags": ["后台标签", "产品说明"],
    "key_points": ["第一条", "第二条"],
    "content": "后台写的正文第一段。\n第二段。",
}


@pytest.fixture
def seed_clean(db):
    """`_fresh_session` 只删它那六张表，`mp_settings` 不在里面——不清就有一条跨用例活着，
    而它一旦活着，本文件前面那批"种下去的必须逐字等于盘上那份种子"就成了假绿或假红。"""
    from app.models.mp_asset import MpSetting

    def wipe():
        db.query(MpSetting).filter(MpSetting.kind == "preset_note").delete()
        db.commit()

    wipe()
    yield
    wipe()


def _admin_h(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    r = client.post("/api/admin/login", json={"token": ADMIN_PW})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["session"]}


def _put_note(client, headers, value):
    return client.put("/api/admin/preset-note", json={"value": value}, headers=headers)


def test_后台填过之后新号种的是库里那一份(client, db, monkeypatch, seed_clean):
    h = _admin_h(client, monkeypatch)
    assert _put_note(client, h, GOOD).status_code == 200
    _login(client, monkeypatch, "pm-cfg-1")
    got = _notes_of(db, "pm-cfg-1")[0]
    assert (got.title, got.summary, got.tags, got.key_points) == (
        GOOD["title"], GOOD["summary"], GOOD["tags"], GOOD["key_points"]
    )
    assert got.content == GOOD["content"] and got.original_content == got.content
    # 仍然走的是预置那一条：删不掉那道闸吃的是 source_type，不是内容。
    assert got.source_type == preset_note.PRESET_SOURCE_TYPE


def test_停用之后新号落回包里那一份(client, db, monkeypatch, seed_clean):
    h = _admin_h(client, monkeypatch)
    assert _put_note(client, h, GOOD).status_code == 200
    assert _put_note(client, h, None).status_code == 200
    _login(client, monkeypatch, "pm-cfg-2")
    seed = preset_note.seed_row()
    got = _notes_of(db, "pm-cfg-2")[0]
    assert got.title == seed["title"], "停用没落回包里那份"


def test_改后台不回头改已经种下去的那一篇(client, db, monkeypatch, seed_clean):
    """这一条是这批的正面：生效面只往前。已经种下去的那一篇属于那个用户，后台改不动它。"""
    _login(client, monkeypatch, "pm-cfg-3")
    before = _notes_of(db, "pm-cfg-3")[0].title
    h = _admin_h(client, monkeypatch)
    assert _put_note(client, h, GOOD).status_code == 200
    _login(client, monkeypatch, "pm-cfg-3")          # 老号再登录一次，不会再种
    rows = _notes_of(db, "pm-cfg-3")
    assert len(rows) == 1 and rows[0].title == before


def test_库里那份不合格时落回包里而不是种一半(client, db, monkeypatch, seed_clean):
    """绕过那道口直接往库里写一份超限的（模拟人工改库/更早一版写进去的）。"""
    from app.models.mp_asset import MpSetting

    db.merge(MpSetting(kind="preset_note", asset_id=None,
                       text_value={**GOOD, "title": "字" * 300}))
    db.commit()
    assert preset_note.seed_row_from_db(db) is None
    assert preset_note.live_seed(db)["title"] == preset_note.seed_row()["title"]
    _login(client, monkeypatch, "pm-cfg-4")
    assert _notes_of(db, "pm-cfg-4")[0].title == preset_note.seed_row()["title"]


def test_不合格整份退回而且库里那份没动(client, db, monkeypatch, seed_clean):
    h = _admin_h(client, monkeypatch)
    assert _put_note(client, h, GOOD).status_code == 200
    bad = {**GOOD, "title": "   "}
    r = _put_note(client, h, bad)
    assert r.status_code == 400, r.text
    assert "标题" in r.json()["detail"]
    assert preset_note.live_seed(db)["title"] == GOOD["title"], "退回是退了，库里那份却被半份盖掉了"


def test_标题超过客户端那一栏的上限被拒(client, db, monkeypatch, seed_clean):
    """后台放行 101 字的标题不是"长一点"，是用户点开编辑再保存时被截短——那一步没有提示。"""
    h = _admin_h(client, monkeypatch)
    r = _put_note(client, h, {**GOOD, "title": "字" * (preset_note.MAX_SEED_TITLE + 1)})
    assert r.status_code == 400 and str(preset_note.MAX_SEED_TITLE) in r.json()["detail"]


def test_要点与标签一行一条空行丢掉(client, db, monkeypatch, seed_clean):
    h = _admin_h(client, monkeypatch)
    r = _put_note(client, h, {**GOOD, "tags": "甲\n\n 乙 \n", "key_points": "一\n二\n\n"})
    assert r.status_code == 200, r.text
    cur = r.json()["current"]
    assert cur["tags"] == ["甲", "乙"] and cur["key_points"] == ["一", "二"]


def test_两个口都要管理凭证(client, db, monkeypatch, seed_clean):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    assert client.get("/api/admin/preset-note").status_code == 401
    assert _put_note(client, {}, GOOD).status_code == 401
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get("/api/admin/preset-note").status_code == 503


def test_这一栏不往小程序回体里下发(db, seed_clean):
    """播种在服务端完成，客户端从来不需要这份文案；下发出去只是白占一次登录回体。"""
    from app.services import mp_assets

    preset_note.save_seed(db, GOOD)
    assert "preset_note" not in mp_assets.config_payload(db)


def test_两把尺与客户端编辑那两栏相等():
    """标题/摘要那两枚上限的唯一理由是 `pages/write/write.wxml` 里那两个 maxlength。
    那边改了数而这边没改，后台就会放进来存不进用户编辑器的内容。"""
    import re
    from pathlib import Path

    wxml = (Path(__file__).resolve().parents[2] / "miniprogram/pages/write/write.wxml").read_text(encoding="utf-8")
    for handler, want in (("onTitleInput", preset_note.MAX_SEED_TITLE),
                          ("onSummaryInput", preset_note.MAX_SEED_SUMMARY)):
        tail = wxml.split(handler, 1)[1][:200]
        got = re.search(r'maxlength="(\d+)"', tail)
        assert got, f"{handler} 那一栏没读到 maxlength，判据要跟着界面改"
        assert int(got.group(1)) == want, f"{handler} 那栏是 {got.group(1)}，这边写着 {want}"


def test_三把尺与建笔记那道口同源():
    """正文/每条/条数那三枚与 `routes/notes.py` 必须是同一组数——那边才是存一篇笔记的闸。
    不 import 是因为 `core/auth.py` 已经 import 本模块，反向 import 会成环，所以靠这条用例钉。"""
    from app.api.routes import notes

    assert (notes.MAX_BODY, notes.MAX_ITEM_LEN, notes.MAX_LIST_ITEMS) == (
        preset_note.MAX_SEED_CONTENT, preset_note.MAX_SEED_ITEM_LEN, preset_note.MAX_SEED_ITEMS
    )


def test_后台那一页真有默认笔记这一格():
    """静态钉页面：少一行 `state.note` 渲染，后端全对、那一页上也还是没有这一栏。"""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "noteCardFor" in body and "state.note" in body
    assert "api/admin/preset-note" in body
    assert "note:preset_note" in body, "导航那一行没加，他点开后台找不到这一栏"
