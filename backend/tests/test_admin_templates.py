"""后台「卡片模板」那一栏（方案 docs/方案-cn后台资产管理.md 的 P1，站长 10-15 一句「先补笔记模板管理界面」）。

分组按"这一栏坏了会有多静默"来分：

- **① 门**：这一栏能改的是"线上跑哪几套卡片"，所以第一组先钉鉴权与"口令没配＝503"。
- **② 改不动的东西**：`recipe` 与 `group_key` 不在写体字段里，请求塞进来应当被丢在门口，
  库里那两个值必须一字不变。**这一条是整个 P1 的安全边界**——在线编辑配方（P2）是
  唯一一个"不发版就能改画面"的口子，它没被拍开，所以也不能被顺手做出来。
- **③ 撞车与半份**：同一个 `template_id` 只允许一版 live（库里那条部分唯一索引就是挡这个的）。
  上架撞车要 400 且**不许自动归档那一版**；一次提交里给多项、任何一项不合格就一条都不写。
- **④ 生效链**：后台改完，用户那道口 `GET /api/poster/templates/` 的回体要跟着变；
  `draft`／`archived` 不许出现在里面。这条不判就只能靠"客户端下次冷启看看"来验，那是把验收外包出去。
- **⑤ 屏上真有一栏**：接口全绿不等于页面上有这一栏（`render()` 少一行不会有任何人报错）。
  顺带钉住"配方只有读的地方、没有写的地方"——页面上给配方长出输入框，等于把 P2 做了。

跑法：cd backend && .venv/bin/python -m pytest tests/test_admin_templates.py -q
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_tpl.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from app.core.admin_access import create_session_token
from app.core.auth import _create_token
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.note_card import NoteCard
from app.models.poster_template import PosterTemplate
from app.models.user import User

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
LIST = "/api/admin/poster/templates"
CLIENT_LIST = "/api/poster/templates/"

RECIPE = {"id": "card", "min_version": 1, "steps": [{"k": "fill", "color": "#F2EFE9"}]}


def _row(template_id="card", label="玉版宣", label_en="Jade", status="live", sort=10,
         min_app="1.0.0", group="classic", recipe=None):
    return PosterTemplate(
        template_id=template_id, label=label, label_en=label_en, group_key=group,
        sort_order=sort, recipe=recipe or dict(RECIPE), status=status,
        min_app_version=min_app, content_hash="a" * 64,
    )


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def hdr():
    return {"Authorization": f"Bearer {create_session_token()}"}


@pytest.fixture()
def rows():
    db = SessionLocal()
    a = _row()
    b = _row(template_id="quote", label="摘句", label_en="Quote", sort=20)
    c = _row(status="draft", sort=30)
    db.add_all([a, b, c])
    db.commit()
    ids = {"card_live": a.id, "quote_live": b.id, "card_draft": c.id}
    db.close()
    return ids


def test_口令没配时这一栏整条是503(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get(LIST).status_code == 503


def test_匿名和用户token都开不了这一栏(client, rows):
    assert client.get(LIST).status_code == 401
    db = SessionLocal()
    u = User(openid="tpl-probe-user")
    db.add(u)
    db.commit()
    user_token = _create_token(u.id, 1)
    db.close()
    # 用户那把钥匙能开下发口，开不了管理口——方向只有一个，反了就是提权
    assert client.get(LIST, headers={"Authorization": f"Bearer {user_token}"}).status_code == 401
    assert client.get(CLIENT_LIST, headers={"Authorization": f"Bearer {user_token}"}).status_code == 200


def test_列表回体带状态计数与被用数(client, rows, hdr):
    db = SessionLocal()
    db.add_all([
        NoteCard(user_id="1", note_id=1, tpl="card", is_current=True, no_qr=False, object_key="cloud://a"),
        NoteCard(user_id="1", note_id=1, tpl="card", is_current=False, no_qr=False, object_key="cloud://b"),
        NoteCard(user_id="1", note_id=2, tpl="quote", is_current=True, no_qr=True, object_key="cloud://c"),
    ])
    db.commit()
    db.close()
    body = client.get(LIST, headers=hdr).json()
    assert body["counts"] == {"live": 2, "draft": 1, "archived": 0}
    card = [r for r in body["rows"] if r["template_id"] == "card" and r["status"] == "live"][0]
    assert card["used"] == 2 and card["used_current"] == 1, "出图总数与当前那张要分开数（口径同「数据」那一栏）"
    quote = [r for r in body["rows"] if r["template_id"] == "quote"][0]
    assert quote["used"] == 1
    assert {"recipe", "group_key", "content_hash", "min_app_version", "updated_at"} <= set(card)


def test_改排序会跟着下发口的顺序走(client, rows, hdr):
    db = SessionLocal()
    u = User(openid="tpl-reader")
    db.add(u)
    db.commit()
    uh = {"Authorization": f"Bearer {_create_token(u.id, 1)}"}
    db.close()
    before = [x["label"] for x in client.get(CLIENT_LIST, headers=uh).json()]
    assert before == ["玉版宣", "摘句"]
    r = client.put(f"{LIST}/{rows['quote_live']}", json={"sort_order": 5}, headers=hdr)
    assert r.status_code == 200 and r.json()["sort_order"] == 5
    assert [x["label"] for x in client.get(CLIENT_LIST, headers=uh).json()] == ["摘句", "玉版宣"], \
        "后台改了排序而下发口没跟着变＝这一栏是摆设"


def test_下架少一套再上架又回来(client, rows, hdr):
    db = SessionLocal()
    u = User(openid="tpl-reader2")
    db.add(u)
    db.commit()
    uh = {"Authorization": f"Bearer {_create_token(u.id, 1)}"}
    db.close()
    assert client.put(f"{LIST}/{rows['card_live']}", json={"status": "archived"}, headers=hdr).status_code == 200
    assert [x["label"] for x in client.get(CLIENT_LIST, headers=uh).json()] == ["摘句"]
    assert client.put(f"{LIST}/{rows['card_live']}", json={"status": "live"}, headers=hdr).status_code == 200
    assert len(client.get(CLIENT_LIST, headers=uh).json()) == 2, "下架再上架应当回到原样（记录不删）"


def test_草稿不进下发口(client, rows, hdr):
    db = SessionLocal()
    u = User(openid="tpl-reader3")
    db.add(u)
    db.commit()
    ids = [x["label"] for x in client.get(CLIENT_LIST, headers={"Authorization": f"Bearer {_create_token(u.id, 1)}"}).json()]
    db.close()
    assert "玉版宣" in ids and len(ids) == 2, "三行里 draft 那一行不许出现在用户口回体里"


def test_上架撞车报400且不自动归档另一版(client, rows, hdr):
    """同 template_id 已有 live 时，上架另一版必须被挡，且**那一版原地不动**。
    自动归档等于替他决定"旧那版不再下发了"——那是他的操作，不是我们的副作用。"""
    db = SessionLocal()
    other = _row(sort=15, status="draft")   # 另一版先躺在草稿（直接建两行 live 会被那条部分唯一索引挡在门口）
    db.add(other)
    db.commit()
    other_id = other.id
    db.close()
    r = client.put(f"{LIST}/{other_id}", json={"status": "live"}, headers=hdr)
    assert r.status_code == 400, r.text
    assert "已经有一版在线上" in r.json()["detail"]
    body = {x["id"]: x["status"] for x in client.get(LIST, headers=hdr).json()["rows"]}
    assert body[rows["card_live"]] == "live", "撞车那一下不许把在位的那版顺手改掉"
    assert body[other_id] == "draft", "被挡下的那版也不许半路改成 live"


def test_非法值整份退回且原值一个字不动(client, rows, hdr):
    bad = [
        {"status": "on"},                      # 状态闭集外
        {"min_app_version": "2.2"},            # 少一段
        {"min_app_version": "v2.2.0"},         # 带字母
        {"label": "   "},                      # 空
        {"label": "玉" * 41},                  # 超列宽
        {"sort_order": 10000},                 # 超出范围
    ]
    for payload in bad:
        r = client.put(f"{LIST}/{rows['card_live']}", json=payload, headers=hdr)
        assert r.status_code == 400, f"{payload} 本该被挡，却回了 {r.status_code}"
        assert isinstance(r.json()["detail"], str), f"{payload} 退回的话必须是给人读的一句中文"
    # 类型都不对的那一种由框架自己挡（422），同样一个字不写——分开设，别把它伪装成业务校验
    assert client.put(f"{LIST}/{rows['card_live']}", json={"sort_order": "前十"}, headers=hdr).status_code == 422
    one = [x for x in client.get(LIST, headers=hdr).json()["rows"] if x["id"] == rows["card_live"]][0]
    assert one["label"] == "玉版宣" and one["status"] == "live" and one["sort_order"] == 10 and one["min_app_version"] == "1.0.0"


def test_类型不对的排序回的是人读得懂的那一句(client, rows, hdr):
    """422 由 `app/main.py` 那个统一 handler 翻成中文，字段名要在那份字典里。
    漏登记不会报错，只会在屏上写出"sort_order格式不对"——操作者不认识那个词。"""
    r = client.put(f"{LIST}/{rows['card_live']}", json={"sort_order": "前十"}, headers=hdr)
    assert r.status_code == 422
    assert r.json()["detail"] == "排序格式不对", r.json()["detail"]


def test_一次给多项_有一项坏就整条不写(client, rows, hdr):
    r = client.put(f"{LIST}/{rows['card_live']}",
                   json={"label": "新名字", "sort_order": 99999}, headers=hdr)
    assert r.status_code == 400
    one = [x for x in client.get(LIST, headers=hdr).json()["rows"] if x["id"] == rows["card_live"]][0]
    assert one["label"] == "玉版宣" and one["sort_order"] == 10, \
        "半份生效的形态是'名字改了、排序没改'，界面上读出来是'我刚才那一下点到没有'"


def test_配方与分组改不动(client, rows, hdr):
    """P1 的边界：这一栏没有改画面的落点。字段不在写体里 ⇒ Pydantic 在门口丢掉，
    这一条钉的就是"哪天有人给 TemplateIn 加了 recipe 字段，这里立刻红"。"""
    r = client.put(f"{LIST}/{rows['card_live']}",
                   json={"label": "改名可以", "recipe": {"id": "card", "steps": []},
                         "group_key": "wild", "content_hash": "b" * 64}, headers=hdr)
    assert r.status_code == 200, r.text
    db = SessionLocal()
    row = db.get(PosterTemplate, rows["card_live"])
    assert row.recipe == RECIPE, "配方被改动了——在线编辑配方是 P2，没拍开"
    assert row.group_key == "classic", "分组归客户端那份名单管，后台不许改"
    assert row.content_hash == "a" * 64, "哈希只能由配方算出来，不是谁想写就写"
    assert row.label == "改名可以"
    db.close()


def test_什么都没给时要求至少一项(client, rows, hdr):
    assert client.put(f"{LIST}/{rows['card_live']}", json={}, headers=hdr).status_code == 400


def test_不存在的行回400并说明(client, rows, hdr):
    r = client.put(f"{LIST}/999999", json={"sort_order": 1}, headers=hdr)
    assert r.status_code == 400 and "没有 id=999999" in r.json()["detail"]


def test_重复点同一侧不报错也不改坏(client, rows, hdr):
    db = SessionLocal()
    u = User(openid="tpl-reader4")
    db.add(u)
    db.commit()
    uh = {"Authorization": f"Bearer {_create_token(u.id, 1)}"}
    db.close()
    for _ in range(2):
        assert client.put(f"{LIST}/{rows['card_live']}", json={"status": "live"}, headers=hdr).status_code == 200
    assert len(client.get(CLIENT_LIST, headers=uh).json()) == 2, \
        "连点两次「上架」不许把下发口改成 1 套或 3 套"


# ---- ⑤ 页面那一头：接口绿了不等于屏上有这一栏。
# `render()` 里少一行 forEach，后端全对、用户那边一切照旧，而站长看到的是"这栏没做"。

def test_页面真有第三屏且切得过去():
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert 'id="view-tpl" class="view hidden"' in body, "第三屏的容器没加"
    assert "{ label: '卡片模板', view: 'tpl', key: 'tpl:list' }" in body, "左栏「配置」那组里没有这一条"
    assert "['stats', 'config', 'tpl']" in body, "showView 还在只管两屏——点「卡片模板」会切不出屏"
    assert "loadTemplates" in body and "renderTemplates" in body and "$('tpls')" in body
    assert "api/admin/poster/templates'" in body and "api/admin/poster/templates/' + r.id" in body, \
        "读口或写口没接上：这一栏会是空的"
    assert "refresh" in body and "Promise.all([loadStats(), loadTemplates()])" in body


def test_保存成功的回执落在重读之后的那一行():
    """本机 10-15 真点出来的一类静默：`loadTemplates()` 会把卡片整栏重建，
    先写 `msg.textContent` 再重读＝写进一个已经离开文档的节点，屏上什么都看不见。
    所以回执必须随重读一起传进去，落在新那一行上。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "card.dataset.id = r.id" in body, "行没有身份，重读之后就找不回来了"
    assert "loadTemplates({ id: r.id" in body, "保存／上下架成功后没带回执"
    assert "box.querySelector('.card[data-id=\"' + flash.id + '\"]')" in body
    assert body.count("msg.textContent = e.message;") >= 2, "红话还是要落在当前那一行上（错了不许重读）"


def test_配方在页面上只有读的地方没有写的地方():
    """P1 的安全边界在界面上的形状：配方只准出现在一个 `<pre>` 里，全页那唯一一枚 `textarea`
    还是 Tips 那一栏的。**给配方长出输入框＝把"不发版就能改画面"做了出来**，那是 P2、没拍。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "el('pre', null, JSON.stringify(r.recipe" in body, "配方连看得见的地方都没有，操作者怎么知道线上跑的是哪一份"
    assert body.count("createElement('textarea')") == 1, "多出来的那枚 textarea 就是给配方开的口子"
    for leaked in ("body.recipe", "body.group_key", "body.content_hash", "body.template_id", "body.status ="):
        assert leaked not in body, f"{leaked} —— 这一栏的写体里不许有它（上下架走 {status: ...} 那句，不是赋值）"
    assert "JSON.stringify({ status: to })" in body
