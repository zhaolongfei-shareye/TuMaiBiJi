"""后台「卡片模板」那一栏的**预览**（站长 10-16「卡片模版要增加预览功能」）。

这一栏的预览走的是"浏览器里跑客户端那一份绘制代码"，不是"后台存一张缩略图"。理由记在
`app/services/poster_engine.py` 顶上，一句话：缩略图与配方没有绑定关系，改了配方图还是旧的。
所以这一批判据全部围绕**同一份实现**这一件事——它是这条路上唯一真正有风险的地方：
一旦副本与源文件分叉，屏上那张就成了看着像的假图，而它比"没有预览"更坏。

- **① 同源性**：名单与 md5 逐只对得上客户端源文件；名单本身是顺着 `require` 走出来的真闭包。
- **② 门**：这一口吐的是自家源码，要管理票；口令没配 503；用户那把开不了。
- **③ 宁缺勿假**：副本被改过／没拷全 ⇒ 整口 503，而不是回一份能 parse 但少几个函数的引擎。
- **④ 走不出去**：名单是唯一入口，`../` 这类名字进不来也读不到。
- **⑤ 屏上那几句话是真的**：caption 里那四条限定、"画不出来就写原因"那两分支、strict 那一档。
- **⑥ 这一栏不许长出第二份画法**：页面与服务里都不许出现一笔自己画的画。

跑法：cd backend && .venv/bin/python -m pytest tests/test_admin_poster_preview.py -q
"""
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_prev.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import pytest
from fastapi.testclient import TestClient

from app.core.admin_access import create_session_token
from app.core.auth import _create_token
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.user import User
from app.services import poster_engine

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
ENGINE = "/api/admin/poster/engine"
ROOT = HERE.parents[1]
CLIENT_DIR = ROOT / "miniprogram" / "utils"
OPS_PAGE = HERE.parent / "app" / "api" / "routes" / "ops_page.py"

# 闭包规则只有一份出处：就是同步脚本那一条。测试另写一遍等于把规则复制成两份，
# 以后改一处漏一处，红的是测试而不是那条真规则。
_spec = importlib.util.spec_from_file_location("sync_prev_engine", ROOT / "docs" / "工具" / "同步-后台预览引擎.py")
_sync = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sync)


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def hdr():
    return {"Authorization": f"Bearer {create_session_token()}"}


def _manifest():
    return json.loads(poster_engine.MANIFEST.read_text(encoding="utf-8"))


# ── ① 同源性 ──────────────────────────────────────────────────────────────
def test_副本与客户端那一份逐字相同():
    """这条是整个预览的命门：后台画的是不是真机那张，全看这几只字节有没有分叉。"""
    for f in _manifest()["files"]:
        src = (CLIENT_DIR / f["name"]).read_bytes()
        assert hashlib.md5(src).hexdigest() == f["md5"], (
            f"{f['name']} 的副本与 miniprogram/utils 那份不一样了——"
            f"跑 python3 docs/工具/同步-后台预览引擎.py 刷新，别手改副本")
        assert len(src) == f["bytes"]


def test_名单就是真依赖闭包而不是手写的一串():
    """客户端新加一只 `require('./x.js')` 而名单没跟着长 ⇒ 这一条红。
    少了它，症状是后台"预览引擎没加载成：名单里没有 x.js"——那要等到有人点开那一栏才发现。"""
    assert _sync.closure() == sorted(f["name"] for f in _manifest()["files"])
    assert _manifest()["entry"] == "poster.js"


def test_入口那一只导出的东西页面真的在用():
    """预览只吃这四个名字。少一个就是屏上一句"预览引擎没加载成"，而它多半是被重构掉的。"""
    poster = (CLIENT_DIR / "poster.js").read_text(encoding="utf-8")
    exports = poster.split("module.exports = {", 1)[1]
    for name in ("planPoster", "paintLayers", "applyRemoteTemplates", "recipeSource", "SAMPLE_NOTE"):
        assert re.search(rf"^\s*{name},\s*$", exports, re.M), f"poster.js 不再导出 {name}"


# ── ② 门 ─────────────────────────────────────────────────────────────────
def test_口令没配这一口是503而不是空包(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get(ENGINE).status_code == 503


def test_匿名与用户票都开不了这一口(client):
    assert client.get(ENGINE).status_code == 401
    db = SessionLocal()
    u = User(openid="prev-probe-user")
    db.add(u)
    db.commit()
    user_token = _create_token(u.id, 1)
    db.close()
    r = client.get(ENGINE, headers={"Authorization": f"Bearer {user_token}"})
    assert r.status_code == 401, "用户那把能吐出自家源码，等于把管理口开给了所有人"


def test_回体是数据不是脚本(client, hdr):
    """回 `application/json`：源码在这里是被当数据交出去的，页面里因此少一次 `eval`。"""
    r = client.get(ENGINE, headers=hdr)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    d = r.json()
    assert set(d) == {"entry", "files"} and d["entry"] in d["files"]
    assert "poster.js" in d["files"] and "planPoster" in d["files"]["poster.js"]


def test_内容没变回304(client, hdr):
    first = client.get(ENGINE, headers=hdr)
    etag = first.headers["etag"]
    again = client.get(ENGINE, headers=dict(hdr, **{"If-None-Match": etag}))
    assert again.status_code == 304 and not again.content
    assert client.get(ENGINE, headers=dict(hdr, **{"If-None-Match": '"deadbeef"'})).status_code == 200


# ── ③④ 宁缺勿假 / 走不出去 ────────────────────────────────────────────────
def test_副本被改过就整口503不许画出一张像的(client, hdr, monkeypatch):
    """半只 js 往往照样能 parse（少的是尾巴上几个函数）。不校验 md5，症状是
    "预览能画，但少了几个图层"——这种假图比没有图坏得多。"""
    files = dict(poster_engine._MANIFEST["files"])
    name = sorted(files)[0]
    files[name] = dict(files[name], md5="0" * 32)
    monkeypatch.setattr(poster_engine, "_MANIFEST", {"entry": "poster.js", "files": files})
    r = client.get(ENGINE, headers=hdr)
    assert r.status_code == 503 and "预览引擎" in r.json()["detail"]


def test_名单是唯一入口路径走不出去():
    for name in ("../../app/main.py", "../main.py", "main.py", "poster.js\u0000.png", ""):
        with pytest.raises(FileNotFoundError):
            poster_engine.source(name)
    assert poster_engine.NAME_RE.match("poster.js") and not poster_engine.NAME_RE.match("a/b.js")


def test_名单缺文件时这一口不ready(client, hdr, monkeypatch):
    """`poster_engine.ready()` 是这一栏能不能预览的总闸：入口不在名单里就必须整口 503。"""
    monkeypatch.setattr(poster_engine, "_MANIFEST", {"entry": "poster.js", "files": {"date.js": {}}})
    assert poster_engine.ready() is False
    assert client.get(ENGINE, headers=hdr).status_code == 503


# ── ⑤⑥ 屏上那几句话 ──────────────────────────────────────────────────────
@pytest.fixture()
def body():
    return OPS_PAGE.read_text(encoding="utf-8").split("_PAGE", 1)[1]


def test_画不出来必须说原因不许留一个空白格子(body):
    """三条出口各有一句屏上的话：这一行没过客户端那道闸／配方跑不出图／引擎没加载成。
    少了任何一条，症状都是一个安静的空白——而安静的空白会被读成"这套模板是白屏"。"""
    seg = body.split("function drawInto", 1)[1].split("function paintPreviews", 1)[0]
    assert "客户端不会收下" in seg and "applyRemoteTemplates([r])" in seg
    assert "这一行配方跑不出图" in seg and "strict: true" in seg
    assert "预览引擎没加载成" in body.split("function paintPreviews", 1)[1]


def test_那一格只画remote那一版不许悄悄退回包里那份(body):
    """`recipeSource(...) !== 'remote'` 那一句是防"画的是 bundled/js 那一版却标着这一行的名字"。
    删掉它，测试全绿、屏上照样有图，只有内容不对——所以这条得钉在源码上。"""
    seg = body.split("function drawInto", 1)[1].split("function paintPreviews", 1)[0]
    assert "recipeSource(r.template_id) !== 'remote'" in seg
    assert "PREVIEW_PROFILE" in seg and "SAMPLE_NOTE" in seg


def test_预览那四句限定写在屏上不是只写在注释里(body):
    """站长被打回过"效果图与真机不是一回事"。这一格确实有四条边界：
    内置小样／署名占位／码是占位方块／字宽按浏览器本机字体量。少一句就是让它替我们背书。"""
    cap = body.split("现画：这一行的配方", 1)[1].split("'));", 1)[0]
    for phrase in ("内置小样", "不是任何人的笔记", "占位", "真机上断行可能略有差"):
        assert phrase in cap, f"caption 里少了「{phrase}」那一条限定"


def test_装载器的require必须是同步的(body):
    """异步装载器会让 `require` 返回一个 Promise，解构它不报错、每个名字都是 undefined，
    症状是引擎跑到第 800 行才抛一句看着像源文件毛病的错。这条踩过，钉住。"""
    seg = body.split("function makeRequire", 1)[1].split("function loadEngine", 1)[0]
    assert "async" not in seg
    assert "new Function(" in seg and "eval(" not in body


def test_这一栏不许长出第二份画法(body):
    """预览的全部意义在于"画它的就是真机那一份代码"。页面或服务里多出一笔自己画的画，
    这条链就悄悄变成两份实现——而两份实现一定会分叉，那正是 §六 第 7 条当初要防的事。"""
    js = body.split("<script>", 1)[1]
    for call in ("fillRect", "strokeText", "createLinearGradient", "drawImage", "measureText", "globalAlpha"):
        assert call not in js, f"后台那一页里出现了 {call}——画这件事只能有一份出处"
    svc = (HERE.parent / "app" / "services" / "poster_engine.py").read_text(encoding="utf-8")
    for call in ("fillRect", "measureText", "PIL", "ImageDraw"):
        assert call not in svc, f"服务端不该有任何画代码（方案 §六 第 7 条那条前提仍然成立）"
    assert 'canvas' in svc, '服务那份的 docstring 里得留着「服务端没有 canvas」那句理由，别把它删丢了'
