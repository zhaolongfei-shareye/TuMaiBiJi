"""转存带图这一路（站长 10-24：「转存必须带图。乙，复制一份到自己名下」）的用例。

五条最要紧的形状，红的时候说的假话最贵：

① **必须是真的另一份对象**：`assets.object_key` 那两行不能是同一个 `cloud://`。
   共用一个 fileID 的实现全绿，但 `delete_note` 把 file_ids 交回客户端去 `wx.cloud.deleteFile`
   ⇒ 谁先删笔记，就把另一个人正在用的那张图一起删了。这一条只能靠"新行不落源那一个地址"钉住。
② **顺序与头图跟着走**：源那篇排过序（拖动选过头图），复制出来的那几档必须同序。
③ **一张的失败不许变成整篇的失败**：第二张没跟过来时，第一张与第三张的账必须在。
④ **通道没配＝整条不做，但笔记照建**：转存这一趟不许因为存图通道关着而失败。
⑤ **自己存自己被挡时一趟复制都不该发**：闸门在写之前，不能先复制再拒。

全程不出网：`httpx.Client` 换成记账的替身，存图通道由夹具显式打开。
跑法：cd backend && .venv/bin/python -m pytest tests/test_share_import_images.py -q
"""
import json
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_share_images.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import MAX_ASSETS_PER_NOTE, Asset, next_sort_order, order_by_note
from app.models.note import Note
from app.models.user import User
from app.services import note_images

CF_URL = "https://gateway.test/v1/functions/image_store"
CF_KEY = "pytest-long-lived-admin-key"


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    yield s
    s.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def channel(monkeypatch):
    """把"通道配好了"这一态打开。默认（本地 .env 现读：URL 长度 0）是整条不做。"""
    monkeypatch.setattr(settings, "IMAGE_STORE_CF_URL", CF_URL)
    monkeypatch.setattr(settings, "IMAGE_STORE_CF_KEY", CF_KEY)


@pytest.fixture()
def people(db):
    author = User(openid=f"img-author-{int(time.time() * 1000)}")
    reader = User(openid=f"img-reader-{int(time.time() * 1000)}")
    db.add_all([author, reader])
    db.commit()
    return author, reader


def _note(db, user, title="带图的一篇"):
    n = Note(user_id=str(user.id), title=title, source_type="manual",
             tags=[], key_points=[], key_links=[])
    db.add(n)
    db.commit()
    return n


def _asset(db, note, user, idx, *, key=None, size=20_000, sort=0, status="uploaded",
           mime="image/jpeg", width=800, height=600):
    a = Asset(user_id=str(user.id), note_id=note.id,
              object_key=key or f"cloud://env.a/images/{user.id}/20261024/src{idx}.jpg",
              file_type=mime, file_size=size, width=width, height=height,
              backup_status=status, sort_order=sort)
    db.add(a)
    db.commit()
    return a


def _rows(db, note):
    return (db.query(Asset).filter(Asset.note_id == note.id)
            .order_by(*order_by_note()).all())


# ------------------------------------------------------------------ 替身：存图函数那一趟

class _Resp:
    def __init__(self, status=200, json_body=None, text=None):
        self.status_code = status
        self._json = json_body
        self._text = text if text is not None else (
            json.dumps(json_body) if json_body is not None else "")

    @property
    def text(self):
        return self._text

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


class FakeCopy:
    """只回预置结果的那一趟网关：每次 POST 记一笔，回一个**新的** fileID。

    新地址一律带 `new{序号}`，与源那些 `src{n}` 天然不同——这样 ① 那条判据（不许共用地址）
    是"读出来的"，不是我把断言写松了。
    """

    def __init__(self, script=None, boom_on=None):
        self.script = script or {}
        self.boom_on = boom_on or set()
        self.posts = []
        self.client_kwargs = {}

    def __call__(self, **kw):
        self.client_kwargs.update(kw)
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def post(self, url, json=None, headers=None, **kw):
        self.posts.append({"url": url, "json": json or {}, "headers": headers or {}})
        n = len(self.posts)
        src = (json or {}).get("copy_from")
        if n in self.boom_on:
            return _Resp(200, {"error": "downloadFile 异常：mock 里这张取不到"})
        if src in self.script:
            return self.script[src]
        return _Resp(200, {"fileID": f"cloud://env.a/images/{999}/20261024/new{n}.jpg",
                           "bytes": 20_000})


def _wire(monkeypatch, fake):
    # `fake(**kw)` 不是笔误：替身要把 Client(...) 那批构造参数收下记账（钥匙与超时都挂在客户端那层）
    monkeypatch.setattr(note_images.httpx, "Client", lambda **kw: fake(**kw))
    return fake


def _import(client, uid, token):
    return client.post("/api/notes/from-share", headers={"Authorization": "Bearer " + _create_token(uid)},
                       json={"token": token})


def _share(client, uid, note_id):
    r = client.post("/api/shares/", headers={"Authorization": "Bearer " + _create_token(uid)},
                    json={"note_id": note_id, "author_name": "阿飞"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ------------------------------------------------- 一、走真口：转存把那几张一起带过来
def test_转存把源篇那几张逐张复制并落到转存者名下(client, db, channel, people, monkeypatch):
    author, reader = people
    src = _note(db, author)
    for i in (1, 2, 3):
        _asset(db, src, author, i)
    fake = _wire(monkeypatch, FakeCopy())
    token = _share(client, author.id, src.id)

    r = _import(client, reader.id, token)
    assert r.status_code == 200, r.text
    mine = r.json()
    db.expire_all()
    rows = _rows(db, _note_query(db, mine["id"]))
    assert len(rows) == 3, f"三张源图该跟过来三行，实得 {len(rows)}"
    assert all(str(x.user_id) == str(reader.id) for x in rows), "归属串了"
    # ① 核心：一行都不许落在源那三个地址上（共用对象＝一个人删笔记会删掉另一个人正在用的图）
    src_keys = {a.object_key for a in _rows(db, src)}
    assert not (src_keys & {x.object_key for x in rows}), "复制出来的行复用了源那一个对象"
    assert len({x.object_key for x in rows}) == 3, "三张落成了同一个地址"
    # 打的是复制那一型，且带着网关那把钥匙
    assert len(fake.posts) == 3
    assert all(p["json"].get("copy_from") for p in fake.posts)
    hdr = fake.client_kwargs.get("headers") or {}
    assert hdr.get("Authorization", "").startswith("Bearer "), "打网关没带那把钥匙"
    assert fake.client_kwargs.get("timeout") == settings.IMAGE_STORE_CF_TIMEOUT, \
        "这一路没读那条超时配置——配了一行却没人读的开关比没有这行更坏"


def _note_query(db, note_id):
    return db.query(Note).filter(Note.id == note_id).one()


def test_源那几行一个字都没被改动(client, db, channel, people, monkeypatch):
    """复制不是搬运：作者名下那三行必须原样还在他自己那篇上。"""
    author, reader = people
    src = _note(db, author)
    for i in (1, 2, 3):
        _asset(db, src, author, i)
    before = [(a.object_key, a.note_id, a.user_id) for a in _rows(db, src)]
    assert len(before) == 3, "前提：源那篇三行配图得先真的存在"
    fake = _wire(monkeypatch, FakeCopy())
    token = _share(client, author.id, src.id)
    assert _import(client, reader.id, token).status_code == 200

    db.expire_all()
    assert [(a.object_key, a.note_id, a.user_id) for a in _rows(db, src)] == before
    assert db.query(Asset).filter(Asset.note_id == src.id).count() == 3
    assert all(p["json"]["copy_from"] in {k for k, _, _ in before} for p in fake.posts), \
        "打出去取的地址不是源那三张"


def test_复制保住顺序与头图(client, db, channel, people, monkeypatch):
    """源那篇拖动排过序（头图是 sort_order 最小的那张）⇒ 副本的第一张必须是同一张画面。"""
    author, reader = people
    src = _note(db, author)
    # 建行顺序 1,2,3，但拖动后的 sort_order 是 7,1,4 ⇒ 读出来的第一张是"src2"
    _asset(db, src, author, 1, sort=7)
    _asset(db, src, author, 2, sort=1)
    _asset(db, src, author, 3, sort=4)
    sent = {}
    fake = FakeCopy()
    orig_post = fake.post

    def spy(url, json=None, headers=None, **kw):
        resp = orig_post(url, json=json, headers=headers, **kw)
        sent[json["copy_from"]] = len(fake.posts)
        return resp

    fake.post = spy
    _wire(monkeypatch, fake)
    token = _share(client, author.id, src.id)
    mine = _import(client, reader.id, token).json()

    order_of_src = [a.object_key for a in _rows(db, src)]
    assert order_of_src[0].endswith("src2.jpg"), "前提：源篇头图是第二张建的那张"
    db.expire_all()
    rows = _rows(db, _note_query(db, mine["id"]))
    assert [x.sort_order for x in rows] == [1, 2, 3], f"副本自己那一档要连续且从 1 起：{[x.sort_order for x in rows]}"
    # 第一张（头图）对应的是源里读出来的那一张
    assert sent[order_of_src[0]] == 1, "源的头图不是第一个被复制的那一张"
    assert rows[0].object_key.endswith("new1.jpg"), f"副本头图错位：{rows[0].object_key}"


def test_没有图的篇子转存时一趟网关都不打(client, db, channel, people, monkeypatch):
    author, reader = people
    src = _note(db, author, title="纯文字的一篇")
    fake = _wire(monkeypatch, FakeCopy())
    token = _share(client, author.id, src.id)
    assert _import(client, reader.id, token).status_code == 200
    assert fake.posts == [], "没图却打了网关"
    assert fake.posts == [] and db.query(Asset).count() == 0


def test_通道没配时笔记照建且零行配图(client, db, people, monkeypatch):
    """④ 存图通道关着＝整条不做，不许把转存本身变成一次失败。"""
    author, reader = people
    src = _note(db, author)
    for i in (1, 2):
        _asset(db, src, author, i)
    fake = _wire(monkeypatch, FakeCopy())   # 通道没打开，这里一次都不该被用到
    token = _share(client, author.id, src.id)

    r = _import(client, reader.id, token)
    assert r.status_code == 200, r.text
    assert fake.posts == [], "channel_ready 为假还打网关"
    db.expire_all()
    assert db.query(Asset).filter(Asset.note_id != src.id).count() == 0


def test_自己存自己被挡时零复制(client, db, channel, people, monkeypatch):
    """闸在写之前：先复制再拒的话，桶里会留下一堆没人认的对象（对象只能客户端删）。"""
    author, reader = people
    src = _note(db, author)
    for i in (1, 2, 3):
        _asset(db, src, author, i)
    fake = _wire(monkeypatch, FakeCopy())
    token = _share(client, author.id, src.id)

    r = _import(client, author.id, token)
    assert r.status_code == 400 and r.json()["detail"] == "这是你自己的笔记"
    assert fake.posts == [], "自存那一趟在被拒之前就已经往外复制了"
    assert db.query(Asset).count() == 3, "除了源那三行，一行都不许多"


# ------------------------------------------------------- 二、服务本体：失败形状与上限
def test_第二张没跟过来时第一张与第三张的账必须在(db, channel, people, monkeypatch):
    """③ 一张的失败不许变成整篇的失败；也不许因为一张坏就不落其余。"""
    author, reader = people
    src = _note(db, author)
    rows = [_asset(db, src, author, i) for i in (1, 2, 3)]
    fake = _wire(monkeypatch, FakeCopy(boom_on={2}))
    mine = _note(db, reader, title="我的副本")

    out = note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    assert len(out.kept) == 2 and out.failed == [rows[1].object_key]
    db.expire_all()
    assert len(_rows(db, mine)) == 2, "三张里两张跟过来，落账必须跟着真进了桶的那两张走"


def test_函数回错误时不往账上写一行指向空的行(db, channel, people, monkeypatch):
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1)
    fake = _wire(monkeypatch, FakeCopy(script={
        "cloud://env.a/images/1/20261024/src1.jpg": _Resp(200, {"error": "上传被拒"})}))
    mine = _note(db, reader, title="我的副本")

    out = note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    assert out.kept == [] and len(out.failed) == 1
    db.expire_all()
    assert _rows(db, mine) == [], "函数报错了还落一行，那行在配额里却云上没东西"


def test_超过上限的只带前九张且多出来的算进truncated(db, channel, people, monkeypatch):
    author, reader = people
    src = _note(db, author)
    for i in range(1, 13):
        _asset(db, src, author, i)
    fake = _wire(monkeypatch, FakeCopy())
    mine = _note(db, reader, title="我的副本")

    out = note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    assert len(fake.posts) == MAX_ASSETS_PER_NOTE, "不该为超出那几张也各打一趟网关"
    assert len(out.kept) == MAX_ASSETS_PER_NOTE and out.truncated == 3
    db.expire_all()
    assert len(_rows(db, mine)) == MAX_ASSETS_PER_NOTE


def test_备份失败那一行不跟过来(db, channel, people, monkeypatch):
    """`backup_status='failed'` 的行云上没东西：复制它必然失败，且它本来就不该出现在任何读口。"""
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1)
    _asset(db, src, author, 2, key="cloud://env.a/images/1/20261024/lost.jpg", status="failed")
    fake = _wire(monkeypatch, FakeCopy())
    mine = _note(db, reader, title="我的副本")

    out = note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    assert len(out.kept) == 1 and out.total == 1, "failed 那行连计数都不该算（配额里它也不存在）"
    assert [p["json"]["copy_from"] for p in fake.posts] == ["cloud://env.a/images/1/20261024/src1.jpg"]


def test_新行的每一格都从源那一行抄全(db, channel, people, monkeypatch):
    """张数对不等于内容对：宽高／格式／字节逐格核一遍，别只落一个地址。"""
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1, mime="image/gif", size=123_456, width=480, height=270)
    _wire(monkeypatch, FakeCopy())
    mine = _note(db, reader, title="我的副本")

    out = note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    db.expire_all()
    row = _rows(db, mine)[0]
    assert (row.file_type, row.width, row.height) == ("image/gif", 480, 270)
    assert row.file_size == 20_000, "新行按函数报的真字节落，不照抄源那一格"
    assert row.backup_status == "uploaded"
    assert row.sort_order == next_sort_order(db, mine.id) - 1 == 1
    assert out.kept[0].over_budget is False, "20,000 B 远在 500KB 预算之内，这一格不该是真"


def test_函数没回字节时退回源那一行的数(db, channel, people, monkeypatch):
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1, size=33_333)
    fake = FakeCopy()
    fake.post = lambda url, json=None, headers=None, **kw: _Resp(
        200, {"fileID": "cloud://env.a/images/2/20261024/newx.jpg"})
    _wire(monkeypatch, fake)
    mine = _note(db, reader, title="我的副本")

    note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    db.expire_all()
    assert _rows(db, mine)[0].file_size == 33_333, "函数少回那一格时不该落成空或 0"


# ---------------------------------------------------------------- 三、桶里的路径与尾巴
def test_新路径落在转存者那一层且尾巴跟着源那张(db, channel, people, monkeypatch):
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1, key="cloud://env.a/images/1/20261024/a.gif", mime="image/gif")
    _asset(db, src, author, 2, key="cloud://env.a/images/1/20261024/b.png", mime="image/png")
    fake = _wire(monkeypatch, FakeCopy())
    mine = _note(db, reader, title="我的副本")

    note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    paths = [p["json"]["cloud_path"] for p in fake.posts]
    assert [x.rsplit(".", 1)[-1] for x in paths] == ["gif", "png"], "尾巴跟着源那张，不许全压成 jpg"
    for p in paths:
        assert p.startswith(f"images/{reader.id}/"), f"路径没落进转存者那一层：{p}"
        assert ".." not in p and " " not in p and not p.startswith("/")


def test_源那行的格式栏被污染时尾巴退回jpg不许带分隔符(db, channel, people, monkeypatch):
    """`file_type` 是客户端登记时报上来的；它不能决定桶里的路径长什么样。"""
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1, key="cloud://env.a/x", mime="image/../etc/passwd")
    fake = _wire(monkeypatch, FakeCopy())
    mine = _note(db, reader, title="我的副本")

    note_images.copy_for_import(db, mine, src.id, limit=MAX_ASSETS_PER_NOTE)
    p = fake.posts[0]["json"]["cloud_path"]
    assert p.endswith(".jpg") and ".." not in p, p
    assert p.startswith(f"images/{reader.id}/")


# ---------------------------------------------------------------- 四、接线本身有牙
def test_撤掉自存那一判时同一把尺子会红(client, db, channel, people, monkeypatch):
    """反向验证：上面那条"自存零复制"不是空闸。

    做法是把闸门的前提抽掉（让路由以为这张码不是本人分享的，等价于把那两行删掉），
    同一组断言必须整个反过来：200 而不是 400、网关真被打两趟。
    只在内存里改一个属性、且先把那一行从会话摘出来（`expunge`），不落库、不动源码。
    """
    author, reader = people
    src = _note(db, author)
    for i in (1, 2):
        _asset(db, src, author, i)
    token = _share(client, author.id, src.id)
    fake = _wire(monkeypatch, FakeCopy())

    from app.services import sharing
    real = sharing.active_share_by_token

    def spoofed(session, tok):
        s = real(session, tok)
        if s is not None:
            session.expunge(s)
            s.user_id = "不是本人"
        return s

    monkeypatch.setattr(sharing, "active_share_by_token", spoofed)
    r = _import(client, author.id, token)
    assert r.status_code == 200, "闸门的前提被抽掉了还回 400，说明这一判据没在测那两行"
    assert len(fake.posts) == 2, "撤闸后不复制 ⇒ 上面那条「零复制」是空闸"


def test_复制整段炸了转存这一次仍然成功(client, db, channel, people, monkeypatch):
    """图是加值：服务本体抛没预期的错，也不许把已经建好的笔记退成一次失败。"""
    author, reader = people
    src = _note(db, author)
    _asset(db, src, author, 1)
    token = _share(client, author.id, src.id)

    def boom(*a, **kw):
        raise RuntimeError("mock：存图那条整段崩了")

    monkeypatch.setattr(note_images, "copy_for_import", boom)
    r = _import(client, reader.id, token)
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.query(Note).filter(Note.id == r.json()["id"]).count() == 1


def test_第二次存同一篇不许把那几张再复制一遍(client, db, channel, people, monkeypatch):
    """去重那道闸必须排在复制这一段**前面**。

    挡在后面的话，同一篇第二次点照样回 200、但名下多三行配图、网关多打三趟——
    站长 10-25「避免冗余数据」要清的正是这两笔。
    """
    author, reader = people
    src = _note(db, author)
    for i in (1, 2, 3):
        _asset(db, src, author, i)
    fake = _wire(monkeypatch, FakeCopy())
    token = _share(client, author.id, src.id)

    mine = _import(client, reader.id, token).json()["id"]
    assert len(fake.posts) == 3, "前提没成立：第一趟没真复制三张，下面那句「不多打」就是空话"

    again = _import(client, reader.id, token)
    assert again.status_code == 200, again.text
    assert again.json()["id"] == mine
    assert len(fake.posts) == 3, f"第二趟又打了网关 {len(fake.posts) - 3} 趟"
    db.expire_all()
    assert db.query(Asset).filter(Asset.note_id == mine).count() == 3, "副本那篇三行配图被翻成了六行"
