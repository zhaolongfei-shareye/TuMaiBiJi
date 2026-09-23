"""入参长度上限：模型上写的 String(500) 在 SQLite 上根本不管事。

实测过（不是推测）：POST 一个 500 万字的标题、2 千万字的正文、100 万字的分类名，
三条全部 200，库文件从 0 涨到 74.6MB。危害不止是磁盘——`title` 会进列表响应，
一条超长标题就能让每个人的首页拉不动；`list_notes` 的搜索还要对 content 做 LIKE
全表扫，几千万字的行会让搜索直接卡死。

上限只能钉在 Pydantic 这一层，所以这个文件断的是"入口拒了"，而不是"库里没有"。

顺带钉住 422 的形状：前端是 `(err.data && err.data.detail) || t('saveFailed')`，
detail 必须是**一句中文字符串**。Pydantic 默认给的是英文报错数组，塞进 errLine
会显示成一串 [object Object]——加了长度上限之后，用户粘贴一篇长文当标题就会撞上，
这是正常路径，不能只有攻击者才看得懂。
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_limits.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.api.routes import notes as notes_route
from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.note import Note
from app.models.user import User


@pytest.fixture(scope="module")
def env():
    app.state.limiter.enabled = False
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    u = User(openid="pytest-openid-limits")
    s.add(u)
    s.commit()
    yield TestClient(app), {"Authorization": "Bearer " + _create_token(u.id, u.generation)}, s
    s.close()


def test_超长标题被拒且没落库(env):
    c, h, s = env
    r = c.post("/api/notes/", headers=h, json={"title": "标" * (notes_route.MAX_TITLE + 1)})
    assert r.status_code == 422
    assert s.query(Note).count() == 0


def test_刚好到上限的标题收下(env):
    """上限本身得是能用的长度，否则卡的就是正常人。"""
    c, h, s = env
    title = "标" * notes_route.MAX_TITLE
    r = c.post("/api/notes/", headers=h, json={"title": title})
    assert r.status_code == 200
    assert r.json()["title"] == title


def test_超长正文与摘要被拒(env):
    c, h, _ = env
    assert c.post("/api/notes/", headers=h, json={
        "title": "正文过长", "content": "正" * (notes_route.MAX_BODY + 1)}).status_code == 422
    assert c.post("/api/notes/", headers=h, json={
        "title": "摘要过长", "summary": "摘" * (notes_route.MAX_SUMMARY + 1)}).status_code == 422


def test_编辑时同样卡(env):
    """PUT 是另一个入口，漏了它等于没卡——先存短的再改成超长是现成的绕过。"""
    c, h, s = env
    nid = c.post("/api/notes/", headers=h, json={"title": "先存短的"}).json()["id"]
    r = c.put(f"/api/notes/{nid}", headers=h, json={"title": "标" * (notes_route.MAX_TITLE + 1)})
    assert r.status_code == 422
    s.expire_all()
    assert s.get(Note, nid).title == "先存短的", "被拒的改动写进去了"


def test_标签条数与单条长度都卡(env):
    c, h, _ = env
    too_many = ["t"] * (notes_route.MAX_LIST_ITEMS + 1)
    assert c.post("/api/notes/", headers=h, json={
        "title": "标签太多", "tags": too_many}).status_code == 422
    too_long = ["x" * (notes_route.MAX_ITEM_LEN + 1)]
    assert c.post("/api/notes/", headers=h, json={
        "title": "标签太长", "tags": too_long}).status_code == 422


def test_标签必须是字符串数组(env):
    """原先声明是裸 list，[1,2,3] 和嵌套数组都能进来，最后原样存进 JSON 列。"""
    c, h, _ = env
    for bad in ([1, 2, 3], [[["nested"]]], {"a": 1}, "不是数组"):
        assert c.post("/api/notes/", headers=h, json={
            "title": "类型不对", "tags": bad}).status_code == 422, f"{bad!r} 被收下了"


def test_分类名与颜色长度卡住(env):
    c, h, s = env
    from app.api.routes import categories as cat_route
    assert c.post("/api/categories/", headers=h, json={
        "name": "类" * (cat_route.MAX_NAME + 1)}).status_code == 422
    assert c.post("/api/categories/", headers=h, json={
        "name": "正常", "color": "#" * (cat_route.MAX_COLOR + 1)}).status_code == 422
    assert s.query(Category).count() == 0
    assert c.post("/api/categories/", headers=h, json={"name": "正常分类"}).status_code == 200


def test_空分类名被拒(env):
    c, h, _ = env
    assert c.post("/api/categories/", headers=h, json={"name": ""}).status_code == 422


def test_422的detail是一句中文而不是英文报错数组(env):
    """前端直接把 detail 塞进 errLine，是数组就显示成 [object Object]。"""
    c, h, _ = env
    r = c.post("/api/notes/", headers=h, json={"title": "标" * (notes_route.MAX_TITLE + 1)})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert isinstance(detail, str), f"detail 不是字符串，前端会显示成乱码：{detail!r}"
    assert "标题" in detail and "500" in detail, detail
    assert not any(ch.isascii() and ch.isalpha() for ch in detail), f"还夹着英文：{detail}"


def test_校验失败的日志里不能出现用户提交的原样内容(env, caplog):
    """Pydantic 的每条 error 都自带 `input`，那是用户正文本身。

    整份打进 journald 等于把私密笔记抄到日志里——日志不按用户隔离，也不会随账号注销
    一起删。只允许记定位信息（loc/type/ctx）。
    """
    import logging

    secret = "这是我私密的笔记内容绝不该出现在日志里" + "填充" * 500
    with caplog.at_level(logging.WARNING):
        r = env[0].post("/api/notes/", headers=env[1], json={"title": secret})
    assert r.status_code == 422
    dumped = caplog.text
    assert "私密的笔记内容" not in dumped, "用户提交的原样正文被写进了日志"
    assert "绝不该出现在日志里" not in dumped, "同上"
    assert "/api/notes/" in dumped, "日志里连路径都没有，等于没记"


def test_各类校验错误都给出可读中文(env):
    c, h, _ = env
    cases = [
        ({"title": "摘" * 99999}, "/api/notes/"),
        ({"name": "类" * 999}, "/api/categories/"),
        ({"title": 12345}, "/api/notes/"),
    ]
    for body, path in cases:
        r = c.post(path, headers=h, json=body)
        assert r.status_code == 422, f"{body} 没被拒"
        detail = r.json()["detail"]
        assert isinstance(detail, str) and detail, f"{body} 的 detail 不可读：{detail!r}"
        assert "[object" not in detail and "type" not in detail


def test_缺标题时的报错也是中文(env):
    c, h, _ = env
    r = c.post("/api/notes/", headers=h, json={})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


def test_正常业务不受影响(env):
    """这一整套卡的是极端值，不能顺手把真人写笔记也挡了。"""
    c, h, _ = env
    r = c.post("/api/notes/", headers=h, json={
        "title": "混元大模型接入记录",
        "summary": "把云函数那一路的坑记下来" * 20,
        "tags": ["后端", "微信"],
        "key_points": ["第一步建 Key", "第二步调网关"],
        "content": "正文" * 500,
    })
    assert r.status_code == 200, r.json()
    got = r.json()
    assert got["source_type"] == "manual"
    assert got["tags"] == ["后端", "微信"]
    assert c.put(f"/api/notes/{got['id']}", headers=h, json={"title": "改个标题"}).status_code == 200
    assert c.get(f"/api/notes/{got['id']}", headers=h).status_code == 200


def test_客户端伪造source_type不再改变审查口径(env):
    """source_type 曾是入参，而它正是"要不要过内容安全"的开关。

    这里只断它不再是入参（服务端钉成 manual）；内容安全那条链的用例在 test_sec_check.py。
    """
    c, h, _ = env
    r = c.post("/api/notes/", headers=h, json={"title": "自称抓来的", "source_type": "url"})
    assert r.status_code == 200
    assert r.json()["source_type"] == "manual", "客户端还是能决定这条笔记的来源类型"
    assert "source_type" not in notes_route.NoteCreate.model_fields


def test_正文上限不超过内容安全的送检窗口():
    """这条钉的是两个常量之间的关系，不是某个具体数值。

    wechat.enforce_text_safety 每个字段只送前 SEC_CHUNK*SEC_MAX_CHUNKS 字，超出部分
    静默不检。入口上限一旦比这个窗口大，用户把违规内容垫在后面就能存下来并且分享出去。
    谁改动其中一个而忘了另一个，这条会红。
    """
    from app.services import wechat

    window = wechat.SEC_CHUNK * wechat.SEC_MAX_CHUNKS
    assert notes_route.MAX_BODY <= window, (
        f"正文上限 {notes_route.MAX_BODY} 超过送检窗口 {window}，"
        f"多出的 {notes_route.MAX_BODY - window} 字永远检不到"
    )
    assert notes_route.MAX_SUMMARY <= window, (
        f"摘要上限 {notes_route.MAX_SUMMARY} 超过送检窗口 {window}"
    )


def test_窗口内的正文确实整篇都送了检(monkeypatch):
    """上一条只保证常量对齐，这条保证对齐之后真的每段都送出去了。"""
    from app.services import wechat

    sent = []
    monkeypatch.setattr(wechat, "check_text", lambda openid, chunk: sent.append(chunk) or "pass")
    text = "字" * wechat.SEC_CHUNK * 3
    wechat.enforce_text_safety("openid-x", text)
    assert len(sent) == 3, f"只送了 {len(sent)} 段，应为 3 段"
    assert "".join(sent) == text, "分段拼回来和原文不一致，说明段与段之间漏字了"
