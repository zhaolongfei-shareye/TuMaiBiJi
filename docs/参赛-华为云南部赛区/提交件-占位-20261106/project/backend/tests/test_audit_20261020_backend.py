"""10-20 第三轮全面代码审计那一批后端修复的用例（N1 与 N13）。

最贵的一条是 N1：分享卡片的路径上带 `?inviter=<id>`，客户端把它存本机、**每次登录都带上**。
原来这一栏没有上界，而 SQLite 驱动绑一个超过 int64 的整数会当场抛 `OverflowError`
（本文件最后一例就是钉这个机制，别哪天驱动换了脾气我们不知道）。
两头都崩在同一行上：`core/auth.py` 里那句归因当时还没包 try ⇒ 一次越界能把这台设备**永久**挡在登录外
（本机那份只在成功时才删）。所以这里钉三件事：
① 越界的邀请人不许挡住登录；② 这一笔归因照实不认（不认就是回 false，不许悄悄认了）；
③ 正常的那一条仍然认——这是反向，少了它，"把整条归因关掉"也能骗绿。
"""
import os
import re
import sqlite3
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_audit1020.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.note import Note
from app.models.user import User

TOO_BIG = 10 ** 21          # 越界：驱动绑不进去
EDGE_OK = 9_223_372_036_854_775_807   # int64 上界本身：驱动绑得进去，只是查不到那一行


@pytest.fixture()
def client():
    app.state.limiter.enabled = False
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.close()


def _fake_code2session(monkeypatch):
    from app.core import auth as auth_core

    async def fake(code):
        return {"openid": f"audit-{code}", "session_key": "k"}

    monkeypatch.setattr(auth_core, "_wechat_code2session", fake)


def _login(client, monkeypatch, tag, inviter=None):
    _fake_code2session(monkeypatch)
    body = {"code": tag}
    if inviter is not None:
        body["inviter"] = inviter
    return client.post("/api/auth/wechat", json=body)


def test_越界的邀请人挡不住登录_且不认这笔归因(client, db, monkeypatch):
    inviter = User(openid="audit-inviter")
    db.add(inviter)
    db.commit()

    r = _login(client, monkeypatch, "new-1", inviter=TOO_BIG)
    assert r.status_code == 200, f"越界的 inviter 把登录打回了 {r.status_code}：{r.text}"
    me = db.get(User, r.json()["user_id"])
    assert me.invited_by is None, "越界的编号被认成归属了，那笔 +10 就是凭空多出来的"
    # 登录成功后这个人必须还能用：拿这把钥匙读一次列表，不许是 401/500
    assert client.get("/api/notes/", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200


def test_归因那一趟整体出岔子也不许挡住登录(client, db, monkeypatch):
    """上面那条靠"越界先被上界挡回"走的是 `return False`；这一条打的是 `core/auth.py` 那一层 try。

    少这一例，把 try 撤掉照样全绿——那就等于没钉。
    """
    from app.services import quota

    def boom(user, db_, inviter_id):
        raise RuntimeError("归因这一趟自己崩了")

    monkeypatch.setattr(quota, "attribute_inviter", boom)
    r = _login(client, monkeypatch, "new-boom", inviter=7)
    assert r.status_code == 200, f"归因一崩就把人关在门外：{r.status_code} {r.text}"
    assert r.json()["token"], r.text


def test_越界提示里不许露出英文字段名(client, db, monkeypatch):
    """长度上限那句中文由 `_FIELD_LABELS` 翻译，漏一格就变成"search太长了"这种半英文话。"""
    r = _login(client, monkeypatch, "new-label")
    token = r.json()["token"]
    got = client.get("/api/notes/?search=" + "搜" * 300, headers={"Authorization": f"Bearer {token}"})
    detail = got.json()["detail"]
    assert "search" not in detail, f"这句话把字段名原样甩上屏了：{detail}"
    assert "搜索" in detail, detail


def test_正常的邀请人照样认_这是上一条的反向(client, db, monkeypatch):
    inviter = User(openid="audit-inviter-2")
    db.add(inviter)
    db.commit()

    r = _login(client, monkeypatch, "new-2", inviter=inviter.id)
    assert r.status_code == 200, r.text
    assert db.get(User, r.json()["user_id"]).invited_by == inviter.id


def test_int64上界本身不越界_查不到就是不认(client, db, monkeypatch):
    """`2^63-1` 驱动绑得进去（与 `10^21` 不同），所以它走的是"没有这个人"那一支，不是崩。"""
    r = _login(client, monkeypatch, "new-3", inviter=EDGE_OK)
    assert r.status_code == 200, r.text
    assert db.get(User, r.json()["user_id"]).invited_by is None


def test_补报邀请人那一口也不许500(client, db, monkeypatch):
    r = _login(client, monkeypatch, "new-4")
    token = r.json()["token"]
    got = client.post("/api/user/inviter", json={"inviter": TOO_BIG},
                      headers={"Authorization": f"Bearer {token}"})
    assert got.status_code == 200, f"补报口把越界的编号打回 {got.status_code}：{got.text}"
    assert got.json()["applied"] is False


def test_路径参数越界回的是中文400而不是500(client, db, monkeypatch):
    """其余三十多处裸 `int` 入口收在一次全局出口里（N1 剩下的那一半）。

    逐栏补 `le=` 要改三十多个签名，而它们的错法是同一条：整数进 SQLite 绑定。
    `main.py` 那支处理器只挡 `OverflowError`——扩到 `Exception` 会把真正的编程错误抹成 400。
    """
    r = _login(client, monkeypatch, "new-5")
    token = r.json()["token"]
    got = client.get(f"/api/notes/{TOO_BIG}", headers={"Authorization": f"Bearer {token}"})
    assert got.status_code < 500, f"越界的笔记编号还是把接口打崩了：{got.status_code} {got.text}"
    assert got.status_code == 400, got.text
    detail = got.json()["detail"]
    assert isinstance(detail, str) and re.search(r"[一-鿿]", detail), f"这句话不许是英文：{detail!r}"


def test_抓取的链接有长度上限(client, db, monkeypatch):
    """`url` 原来什么长度都收：一条百 MB 的"URL"原样进 Redis job，worker 解包时进内存（N13①）。"""
    r = _login(client, monkeypatch, "new-6")
    token = r.json()["token"]
    got = client.post("/api/ingest/url", data={"url": "https://e.com/" + "a" * 5000},
                      headers={"Authorization": f"Bearer {token}"})
    assert got.status_code == 422, got.text
    assert "太长" in got.json()["detail"], got.json()["detail"]


def test_搜索串有长度上限(client, db, monkeypatch):
    """这一栏原样进 `LIKE '%…%'` 扫全表正文，没有上界等于一条请求烧一轮 CPU（N13①）。"""
    r = _login(client, monkeypatch, "new-7")
    token = r.json()["token"]
    got = client.get("/api/notes/?search=" + "搜" * 300, headers={"Authorization": f"Bearer {token}"})
    assert got.status_code == 422, got.text


def test_一篇的张数上限在提交前也数一遍(client, db, monkeypatch):
    """上面那道"现集合 ∪ 新送来"是读头写尾，两趟并发各自读到旧集合就都能放行（N13②）。

    这一例钉的是加完事后那一道仍然成立的不变量：**一次被拒的请求不许在库里留下行**。
    写不出真并发的用例（TestClient 不是并发驱动器），所以这条只算不变量的一半，
    另一半留给现网探针去数——不许把它读成"并发已经测过了"。
    """
    r = _login(client, monkeypatch, "new-8")
    hdr = {"Authorization": f"Bearer {r.json()['token']}"}
    note = Note(user_id=str(r.json()["user_id"]), title="计数这一篇", source_type="manual")
    db.add(note)
    db.commit()

    def items(n, tag):
        return [{"file_id": f"cloud://pytest-env.xxxx/images/{tag}/{i}.jpg", "size": 400 * 1024}
                for i in range(n)]

    assert client.post(f"/api/notes/{note.id}/assets", json={"items": items(9, "a")}, headers=hdr).status_code == 200
    got = client.post(f"/api/notes/{note.id}/assets", json={"items": items(1, "b")}, headers=hdr)
    assert got.status_code == 400, got.text
    assert db.query(Asset).filter(Asset.note_id == note.id).count() == 9, \
        "被拒那一次在库里留下了一行，那就是「看不见又占配额」的幽灵"


def test_越界的整数在驱动层就是会抛_这是上面那一组的机制底(client, db, monkeypatch):
    """不把这条钉住，将来驱动行为一变（比如它开始自己截断），"越界会崩"就变成一句空话。"""
    conn = sqlite3.connect(":memory:")
    with pytest.raises(OverflowError):
        conn.execute("select 1 where 1 = ?", (TOO_BIG,))
    conn.execute("select 1 where 1 = ?", (EDGE_OK,))
