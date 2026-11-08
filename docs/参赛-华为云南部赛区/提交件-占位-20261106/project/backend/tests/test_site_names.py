"""来源站名这一格（方案 `docs/方案-来源站点名.md`，②已拍丙＝只存站名）的判据。

这把尺子按"这一格会怎么静默坏掉"分组，不按代码文件分组：

- 第一组（四级链的次序）钉的是"谁说了算"。人工表必须在最前（他要的正是"我写的那一行盖住一切"），
  页面自报在内置词表之前、脏值必须在链上判掉——次序换掉的症状不是报错，是**同一篇换个名字**，
  而没有任何一处日志会喊。
- 第二组（②丙那一条）钉的是"不许拼后缀"。这是他自己改口的地方（原话例子是「网易文章」，
  拍的是「只存网易」），所以这一组里那一条 `不许出现拼出来的串` 就是这一拍的牙：
  谁在中间补两个字，这条当场红。
- 第三组（AI 那一级）钉两件事：通道没配**一次出网都不发**，以及它坏了不许把整篇转存带崩。
- 第四组（写入与下发）钉的是快照那两栏读得回来、`has_source` 放宽到"有作者名**或**有站名"
  （待拍⑤甲），以及私密篇锁着时这两栏漏不出去（挡人的是白名单，不是这段代码的自觉）。
- 第五组（后台那张表）钉形状与"整份退回"，不收半张表。

跑法：cd backend && .venv/bin/python -m pytest tests/test_site_names.py -q
"""
import asyncio
import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_sitenames.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.auth import _create_token
from app.core.config import settings
from app.core.private_access import NOTE_BRIEF_FIELDS, NOTE_DETAIL_FIELDS
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.mp_asset import KIND_SITE_NAMES
from app.models.note import Note
from app.models.user import User
from app.services import llm, mp_assets, site_names

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
TABLE = f"/api/admin/mp/tables/{KIND_SITE_NAMES}"
STATE = "/api/admin/mp/state"
# 他点名的那一族：10-29 表十实测**页面没有自报站名**（`og:site_name` 那一格是空的），
# 所以它必须靠内置词表那一级——这一条就是"主力是词表、不是页面自带"那句读数的落地。
NETEASE = "https://c.m.163.com/news/a/FOO12345.html"


@pytest.fixture()
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def admin_pw(monkeypatch):
    """管理口令。这一组用例打的是 `/api/admin/*`，不 monkeypatch 这一枚就全组红在登录那一步。"""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)


@pytest.fixture()
def me(db):
    u = User(openid=f"sn-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def hdr(user) -> dict:
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def admin_h(client) -> dict:
    r = client.post("/api/admin/login", json={"token": ADMIN_PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session']}"}


def note_with(db, user, title="来源的一篇", **kw) -> Note:
    n = Note(user_id=str(user.id), title=title, source_type=kw.pop("source_type", "web_article"), **kw)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def resolve(db, url, meta="", title="", content="正文"):
    return asyncio.run(site_names.resolve(db, url, meta, title=title, content=content))


# ---------------------------------------------------------------- 一、四级链的次序

def test_页面没报名的这一族靠内置词表认出来(db):
    """网易：10-29 实测**没报** `og:site_name`，链必须靠第 3 级把它认成「网易」。"""
    assert resolve(db, NETEASE, meta="")["zh"] == "网易"
    assert resolve(db, NETEASE, meta="")["via"] == "builtin"


def test_人工表那一行盖住页面自报与词表(db):
    """第 1 级在最前，同时是"止血开关"：他写什么就是什么，哪怕页面与词表都另有答案。"""
    mp_assets.set_table(db, KIND_SITE_NAMES, [
        {"domain": "163.com", "zh": "网易新闻", "en": "NetEase News", "note": "就叫这个"}])
    got = resolve(db, NETEASE, meta="网易频道")
    assert (got["zh"], got["en"], got["via"]) == ("网易新闻", "NetEase News", "table")


def test_页面自报的干净值优先于内置词表(db):
    """新浪那族 10-29 报的是「新浪网」——链按次序用它，不在这里替它改口。

    他要是嫌"新浪网"多了两个字，走后台那一行（上一条用例），不是走代码。
    """
    got = resolve(db, "https://news.sina.com.cn/2026-10-29/doc-x.shtml", meta="新浪网")
    assert (got["zh"], got["via"]) == ("新浪网", "meta")


def test_页面自报带slogan的那一等脏值退到词表(db):
    """少数派报的是「少数派 - 高品质数字消费指南」——那不是站名，是一句 slogan。

    这一条就是方案第三节"词表还管脏值"那一句的形状：**整串不许上屏**，
    而判脏的尺子只有"带分隔符／太长"两条（`_META_SEPARATORS`），不认单词。
    """
    got = resolve(db, "https://sspai.com/post/101010", meta="少数派 - 高品质数字消费指南")
    assert (got["zh"], got["via"]) == ("少数派", "builtin")
    assert resolve(db, "https://sspai.com/post/101010", meta="少数派—高品质数字消费指南")["via"] == "builtin"


def test_页面自报太长或带路径的一律不认(db):
    for dirty in ("", "  ", "A very long site name that nobody would ever put in that box",
                  "some.site/x 首页"):
        assert site_names.meta_site(dirty) == {}, f"这一串该判掉：{dirty!r}"


def test_域名后缀匹配认子域不认尾巴相似的站(db):
    assert resolve(db, "https://tech.163.com/read/1.html", meta="")["zh"] == "网易"
    # `163.com.cn` 不是 `163.com`：拿 `endswith(host)` 而不是 `endswith("." + suffix)` 就会被这种尾巴骗到
    assert resolve(db, "https://www.163.com.cn/", meta="") == {}


# ---------------------------------------------------------------- 二、②丙：只存站名，不许拼后缀

def test_词表里每一家存的都是站名本身(db):
    """②拍的是丙（他一句「只存网易」）。这一条扫全表：任何一家带「文章」「笔记」「平台」后缀都算违约。

    为什么扫整张表而不是只挑一家：拼后缀这件事一旦有人在链中间补上，坏的会是**全部**家，
    而屏上看着都挺像话——那种红只有扫一遍才看得见。
    """
    banned = ("文章", "笔记", "贴图", "链接")
    for suffix, zh, en in site_names.BUILTIN:
        for name in (zh, en):
            assert name, f"{suffix} 这一条是空的"
            assert not any(b in name for b in banned), f"{suffix} → {name} 带了后缀，②丙不许"
        got = site_names.builtin_site(f"https://{suffix}/x")
        assert got["zh"] == zh and got["en"] == en, f"{suffix} 读回来不是表里那一份"


def test_写进快照的两栏就是链上那一个名字(db):
    """`snapshot_fields` 是写入的唯一出处：键只有两个，值一个字都不许多。"""
    fields = site_names.snapshot_fields(resolve(db, NETEASE, meta=""))
    assert set(fields) == {"site_name", "site_name_en"}
    assert fields["site_name"] == "网易"
    assert "网易文章" not in str(fields.values())
    assert site_names.snapshot_fields({}) == {}


# ---------------------------------------------------------------- 三、AI 那一级（①默认乙）

def test_通道没配就整级跳过而且一次都不发(db, monkeypatch):
    """测试环境里 `EXTRACT_PROVIDER=none` ⇒ 前三级落空时不许出网（也不许因此报错）。"""
    calls = []

    async def stub(**kw):
        calls.append(kw)
        return "不该被叫到"

    monkeypatch.setattr(llm, "guess_site_name", stub)
    got = resolve(db, "https://nowhere.example.com/article/1", meta="")
    assert got == {} and calls == []


def test_配好通道才发那一发而且只发一次(db, monkeypatch):
    calls = []

    async def stub(**kw):
        calls.append(kw)
        return "长尾小站"

    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "SITE_NAME_CF_URL", "https://example.invalid/site_name")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "a-real-looking-trigger-credential")
    monkeypatch.setattr(llm, "guess_site_name", stub)
    got = resolve(db, "https://nowhere.example.com/article/1", meta="")
    assert (got["zh"], got["via"]) == ("长尾小站", "ai")
    assert len(calls) == 1, "①默认乙＝只在前三级落空时发一发，不许每篇都发"


def test_模型那一发坏了只损失名字不损失这一篇(db, monkeypatch):
    async def boom(**kw):
        raise RuntimeError("云函数没部署")

    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "SITE_NAME_CF_URL", "https://example.invalid/site_name")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "a-real-looking-trigger-credential")
    monkeypatch.setattr(llm, "guess_site_name", boom)
    assert resolve(db, "https://nowhere.example.com/article/1", meta="") == {}


def test_模型回的名字带后缀就当没认出(db, monkeypatch):
    """回体是「网易文章」（模型不守提示词）⇒ 这一条**认不下来**，宁可退到通用那档。

    ⚠ 为什么不在这里替它砍掉后缀：砍成「网易」看着更好，但那是拿一条规则去改他家的名字，
    而"这一篇到底叫什么"只有链上那四级说了算。整枚不认＝②丙那句「只存网易」唯一的执行方式。

    ⚠ 10-30 前这一条是**假绿**：docstring 写着测「网易文章」，桩实际回的是一串超长的怪名，
    量的其实是 `MAX_SITE_CHARS` 那道长度闸。桩换成 docstring 说的那一串，牙才长出来（Y7）。
    """
    async def sloppy(**kw):
        return "网易文章"

    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "SITE_NAME_CF_URL", "https://example.invalid/site_name")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "a-real-looking-trigger-credential")
    monkeypatch.setattr(llm, "guess_site_name", sloppy)
    # 用一条**内置词表也不认识**的 URL：换 163 那一族会在第 3 级就命中「网易」，
    # 那一发根本问不到模型，这条就变成"量了别的东西"（10-30 第一版就这么红过一次）。
    got = resolve(db, "https://nowhere.example.com/article/1", meta="")
    assert got == {}, f"带后缀的那一枚该整枚不认，结果读出 {got}"
    assert got.get("zh") != "网易", "不许顺手砍后缀——砍一次就是把『不许加工』反过来执行"


def test_模型回的那种怪串也不上屏(db, monkeypatch):
    """长度超上限（`MAX_SITE_CHARS`）那一族照旧不认——与上面那条是两道不同的闸。"""
    async def sloppy(**kw):
        return "我不知道的一家网站名称长度已经远远超过那一只盒子能放下的字了真的放不下"

    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "SITE_NAME_CF_URL", "https://example.invalid/site_name")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "a-real-looking-trigger-credential")
    monkeypatch.setattr(llm, "guess_site_name", sloppy)
    assert resolve(db, "https://nowhere.example.com/article/1", meta="") == {}


def test_那道后缀闸只管模型那一级(client, admin_pw, db, monkeypatch):
    """他自己在那张表里写「网易文章」，屏上就得念「网易文章」——第 1 级不受这道闸管。

    为什么单独钉这一条：把闸做宽一级，症状是"后台填了、屏上没变"，而这句话在后台那一栏的
    说明里正好是他被警告过的那种形状（改了屏上没变＝最难查的那一类）。
    """
    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "SITE_NAME_CF_URL", "https://example.invalid/site_name")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "a-real-looking-trigger-credential")

    async def 不该被叫到(**kw):
        raise AssertionError("第 1 级命中了就不该问模型")

    monkeypatch.setattr(llm, "guess_site_name", 不该被叫到)
    h = admin_h(client)
    r = client.put(TABLE, json={"value": [
        {"domain": "c.m.163.com", "zh": "网易文章", "en": "NetEase Article"}]}, headers=h)
    assert r.status_code == 200, r.text
    got = resolve(db, "https://c.m.163.com/news/a/BAR9.jpg", meta="")
    assert (got.get("zh"), got.get("via")) == ("网易文章", "table"), got


def test_闸门与真调用取的是同一把凭据(db, monkeypatch):
    """Y3：把钥存进后台「密钥配置」、`.env` 那一行删掉 ⇒ 第四级**不许**静默关。

    旧写法闸门只看 `.env`、真调用走"库优先"，两处不同源；那一页存在的理由就是不重启换钥匙，
    所以这条路早晚有人走，而走完的症状是"提炼照常、站名那一格从此永远是通用的"，一行日志都不打。
    """
    from app.services import service_secrets

    monkeypatch.setattr(settings, "EXTRACT_PROVIDER", "hunyuan_cf")
    monkeypatch.setattr(settings, "SITE_NAME_CF_URL", "https://example.invalid/site_name")
    monkeypatch.setattr(settings, "HUNYUAN_CF_KEY", "sk-your-key")   # `.env` 里只剩占位符
    monkeypatch.setattr(service_secrets, "resolve",
                        lambda name, fallback="": "库里那一把真凭据" if name == "HUNYUAN_CF_KEY" else fallback)
    assert asyncio.run(llm.site_channel_ready()) is True, \
        "凭据在库里而 `.env` 没写 ⇒ 闸门该开（与 `guess_site_name` 同一把钥）"

    monkeypatch.setattr(service_secrets, "resolve", lambda name, fallback="": fallback)
    assert asyncio.run(llm.site_channel_ready()) is False, "两处都只有占位符时闸门必须关着"


# ---------------------------------------------------------------- 四、写入、下发与那枚来源标

def test_只有站名也算来源篇(client, db, me):
    """待拍⑤甲：网易那一类页没有作者名，原来 `has_source` 回 False ⇒ 那一整行不画。"""
    n = note_with(db, me, imported_from={
        "title_at_import": "网易的一篇", "imported_at": "2026-10-29T06:00:00+00:00",
        "source_url": NETEASE, "site_name": "网易", "site_name_en": "NetEase"})
    row = {x["id"]: x for x in client.get("/api/notes/?limit=50", headers=hdr(me)).json()}[n.id]
    assert row["has_source"] is True
    assert (row["source_site"], row["source_site_en"]) == ("网易", "NetEase")


def test_只有作者名时这两栏是空的(client, db, me):
    """老形状不许跟着变：公众号那一路本来就有作者名，站名那两栏空着，屏上退到六档。"""
    n = note_with(db, me, source_type="wechat_article",
                  imported_from={"author_name": "玉树芝兰", "source_url": "https://mp.weixin.qq.com/s/x"})
    row = {x["id"]: x for x in client.get("/api/notes/?limit=50", headers=hdr(me)).json()}[n.id]
    assert row["has_source"] is True and row["source_site"] == ""


def test_两个名字都没有就整份不算来源(client, db, me):
    n = note_with(db, me, imported_from={"images_kept": 3, "images_failed": 0})
    row = {x["id"]: x for x in client.get("/api/notes/?limit=50", headers=hdr(me)).json()}[n.id]
    assert row["has_source"] is False and row["source_site"] == ""


def test_详情那条路也带出这两栏(client, db, me):
    n = note_with(db, me, imported_from={"author_name": "某作者", "site_name": "博客园"})
    body = client.get(f"/api/notes/{n.id}", headers=hdr(me)).json()
    assert body["source_site"] == "博客园"
    # 英文门只给了一个名字 ⇒ 两门共用它（站名是专有名词，不造第二份真相）
    assert body["source_site_en"] == "博客园"


def test_英文栏空时英文门读主名(db, me):
    n = note_with(db, me, imported_from={"site_name": "澎湃新闻"})
    assert (n.source_site, n.source_site_en) == ("澎湃新闻", "澎湃新闻")
    empty = note_with(db, me, title="没来源的一篇")
    assert (empty.source_site, empty.source_site_en) == ("", "")


def test_私密篇锁着时这两栏漏不出去(client, db, me):
    cat = Category(user_id=str(me.id), name="私密", color="#23252C")
    db.add(cat)
    db.commit()
    n = note_with(db, me, category_id=cat.id,
                  imported_from={"author_name": "他自己", "site_name": "知乎"})
    row = {x["id"]: x for x in client.get("/api/notes/?limit=50", headers=hdr(me)).json()}[n.id]
    assert not row.get("source_site") and not row.get("source_site_en"), \
        "没解锁就把私密篇的来源那一格发出去了"
    assert not row.get("imported_from"), "锁着的时候整份快照都不该在"


def test_白名单里不许出现这两栏():
    """正向钉一次"挡人的是名单本身"：这条红＝有人把站名加进了重建行用的那两份名单。"""
    assert "source_site" not in NOTE_BRIEF_FIELDS and "source_site_en" not in NOTE_BRIEF_FIELDS
    assert "source_site" not in NOTE_DETAIL_FIELDS and "source_site_en" not in NOTE_DETAIL_FIELDS


def test_外链快照不会被转存去重误认成已存过(client, db, me):
    """`imported_from` 多两栏 ⇒ 「同一人对同一篇只留一份」那一判仍只认 `source_note_id`。

    这条是 10-29 那一刀最容易被撞到的旁路：去重那一路读的是这份快照（`notes._find_share_import_copy`），
    它靠"外链那一路根本不写 `source_note_id`"才安全。站名写进同一份快照，这条前提必须复量一次。
    """
    other = User(openid=f"sn-other-{int(time.time() * 1000)}")
    db.add(other)
    db.commit()
    mine = note_with(db, other, title="别人的一篇", source_type="web_article",
                     imported_from={"site_name": "网易", "source_url": NETEASE})
    from app.api.routes.notes import _find_share_import_copy
    assert _find_share_import_copy(db, str(me.id), mine.id) is None


# ---------------------------------------------------------------- 五、后台那张表（第 1 级）

def test_保存一张表并且立刻被链读到(client, admin_pw, db):
    h = admin_h(client)
    r = client.put(TABLE, json={"value": [
        {"domain": "example.com", "zh": "示例网", "en": "Example", "note": "举了个例"}]}, headers=h)
    assert r.status_code == 200, r.text
    assert site_names.table_site(db, "https://www.example.com/post/1")["zh"] == "示例网"


def test_坏形状整份退回不收半张表(client, admin_pw, db):
    h = admin_h(client)
    bad = [
        ({"domain": "https://example.com", "zh": "带协议的域名"}, "域名不许带协议"),
        ({"domain": "example.com/path", "zh": "带路径"}, "域名不许带路径"),
        ({"domain": "-bad.com", "zh": "怪开头"}, "域名形状"),
        ({"domain": "example.com"}, "两个名字都没填"),
        ({"domain": "example.com", "zh": "超" * 25}, "站名超上限"),
    ]
    for row, why in bad:
        r = client.put(TABLE, json={"value": [row]}, headers=h)
        assert r.status_code == 400, f"{why}这一条本该被挡，结果收了：{r.text}"


def test_同一域名不许出现两次(client, admin_pw, db):
    """两行同一家＝第二行永远不生效（链取的是第一行命中），那种"填了没用"的格子比报错更气人。"""
    h = admin_h(client)
    rows = [{"domain": "example.com", "zh": "第一家"}, {"domain": "example.com", "zh": "第二家"}]
    r = client.put(TABLE, json={"value": rows}, headers=h)
    assert r.status_code == 400 and "两次" in r.text, r.text


def test_一行都不合格时先那一版还在(client, admin_pw, db):
    """整份退回＝库里那一份不许被半张表换掉（红着比"生效了一家"好查）。"""
    h = admin_h(client)
    assert client.put(TABLE, json={"value": [{"domain": "ok.com", "zh": "好的一家"}]}, headers=h).status_code == 200
    assert client.put(TABLE, json={"value": [{"domain": "bad.com", "zh": "超" * 30}]}, headers=h).status_code == 400
    state = client.get(STATE, headers=h).json()
    tables = {t["kind"]: t for t in state["tables"]}
    assert [r["domain"] for r in tables[KIND_SITE_NAMES]["current"]] == ["ok.com"]


def test_停用之后退到后面那三级(client, admin_pw, db):
    h = admin_h(client)
    client.put(TABLE, json={"value": [{"domain": "163.com", "zh": "网易新闻"}]}, headers=h)
    assert client.put(TABLE, json={"value": None}, headers=h).status_code == 200
    assert site_names.table_site(db, NETEASE) == {}
    assert resolve(db, NETEASE, meta="")["via"] == "builtin"
    state = client.get(STATE, headers=h).json()
    tables = {t["kind"]: t for t in state["tables"]}
    assert tables[KIND_SITE_NAMES]["registered"] is True
    assert tables[KIND_SITE_NAMES]["current"] == []
    # 停用那一句要说实话：这一栏空着不是"没有名字"，是"退到后面那三级"
    assert "页面自报" in tables[KIND_SITE_NAMES]["empty_text"]


def test_表栏那一组带着上限进后台(client, admin_pw, db):
    """界面上那句"最多几家、每格几字"与服务层那张表必须同一个出处（Tips 那条口径不变）。"""
    state = client.get(STATE, headers=admin_h(client)).json()
    table = {t["kind"]: t for t in state["tables"]}[KIND_SITE_NAMES]
    spec = mp_assets.table_spec(KIND_SITE_NAMES)
    assert table["max_rows"] == spec["max_rows"]
    assert table["max_site_chars"] == spec["max_site_chars"] == mp_assets.MAX_SITE_CHARS
    assert table["columns"] == list(spec["columns"])


def test_文案栏与图片栏两口不收这一栏(client, admin_pw, db):
    """三道闸门互不收对方的 kind：混进去的症状是"点得动、存进库、屏上永远读不到"。"""
    h = admin_h(client)
    for wrong in (f"/api/admin/mp/texts/{KIND_SITE_NAMES}",
                  f"/api/admin/mp/settings/{KIND_SITE_NAMES}"):
        body = {"value": None} if "texts" in wrong else {"asset_id": None}
        assert client.put(wrong, json=body, headers=h).status_code == 400, wrong


def test_脏表不会把转存那一趟带崩(db):
    """手工 SQL 写进去的东西也要扛得住：读的那一层永远不抛。"""
    row = mp_assets.setting_row(db, KIND_SITE_NAMES, create=True)
    row.text_value = {"不是": "行的列表"}
    db.commit()
    assert site_names.table_site(db, NETEASE) == {}
    row.text_value = [{"domain": "ok.com"}, "一个字符串混在行里"]
    db.commit()
    assert site_names.table_site(db, "https://ok.com/") == {}


def test_后台那一页有表栏那一组可编辑的格子():
    """静态钉页面：这一栏要真挂进主区那一格、真走那个新口、左栏还点得到。
    这条不是装饰——`render()` 里少那一句 `appendChild`，卡片照样造得出来、函数照样跑得完，
    屏上却是一片空（10-19 那次「函数跑了、一个字没抛、屏上什么都没有」就是这一型）；
    而本文件其余那二十八条查的全是回体，一条都不会跟着红。
    真正会跟着红的是那把真点尺子 `docs/工具/验-后台来源站点名栏.mjs`（它第一条就是这个）。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "tableCardFor" in body
    assert "api/admin/mp/tables/" in body, "页面没走表栏那一个新口（多半是手拼了别的地址）"
    assert "state.tables" in body, "render() 没把表栏那一组渲染出来"
    assert "tbbox.appendChild(tableCardFor(b))" in body, "卡片造出来了却没挂进那一格"
    assert "'来源站点名'" in body, "左栏没有那一条：一栏一屏之后，点不到就等于这一栏不存在"
    # 加行/删行之前那一步收字：漏了它不报错，症状是"打到一半点一下加一行，那几个字没了"。
    assert "harvestTable(key, rows)" in body
