"""密钥配置这一条链（10-25）：鉴权、存与读、值不外流、读侧覆盖真生效、读侧不许抛。

尺子按"这一页上现网之后最可能怎么坏"分组，不是按代码文件分组：

- 第一组（鉴权）复用运营图那把现成的门，只补"三个新口都在同一把门后面"这一条。
- 第二组（存与读）钉的是"回体里没有 value 那一个字段"。每一条都拿同一个哨兵原值去扫响应文本，
  因为这类接口坏起来的样子不是报错，是"哪天有人顺手把 value 加回返回体，好让它能回显"。
- 第三组（值不外流）钉日志与那一页 HTML 两处——journald 没有按人隔离，也不随任何东西删掉。
- 第四组（读侧真生效）钉这一页存在的唯一理由：`CONSUMED_NAMES` 里每一个名字，
  都要**真改得出消费者的行为**；改不出，这一页就是一个好看的抽屉。
- 第五组（读侧不许抛）钉 `resolve()` 那一句退回 `.env`：表还没建、库被锁，都不能变成登录 500。
- 第六组（迁移）真跑一遍 alembic：这一条钉的是"部署完那一刻现网行为一行不变"。

跑法：cd backend && .venv/bin/python -m pytest tests/test_service_secrets.py -q
"""
import asyncio
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

import pytest
import sqlalchemy
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_service_secrets.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core import auth as auth_core
from app.core.auth import _create_token
from app.core.config import settings
from app.core.private_access import create_unlock_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.service_secret import ServiceSecret
from app.models.user import User
from app.services import llm, service_secrets, wechat

BACKEND = Path(__file__).resolve().parents[1]
ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
SECRETS = "/api/admin/secrets"
# 哨兵值：三条"不许外流"的尺子（响应体、日志、那一页 HTML）都拿同一个串扫一遍。
SENTINEL = "sk-SENTINEL-绝不该出现在任何一个出口-9f3a"
WECHAT_NEW = "sk-库里这一把-newappsecretvalue001"
CF_NEW = "sk-库里这一把-newcfkeyvalue-002"


@pytest.fixture()
def admin_pw(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)


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


def login(client, pw=ADMIN_PW) -> str:
    r = client.post("/api/admin/login", json={"token": pw})
    assert r.status_code == 200, r.text
    return r.json()["session"]


def ah(client) -> dict:
    return {"Authorization": f"Bearer {login(client)}"}


def put(client, name, value=SENTINEL, note=None, headers=None):
    """`note=None` 是"这一次没写备注"，服务层在覆盖那一趟保留原来那句。"""
    body = {"value": value}
    if note is not None:
        body["note"] = note
    # 名字里可能带空格与中文（坏输入那几条就是来试这个的），路径必须编码后再拼。
    return client.put(f"{SECRETS}/{quote(str(name))}", json=body,
                      headers=headers if headers is not None else ah(client))


def listed(client, headers=None) -> list:
    r = client.get(SECRETS, headers=headers if headers is not None else ah(client))
    assert r.status_code == 200, r.text
    return r.json()["items"]


def one(client, name) -> dict:
    got = [i for i in listed(client) if i["name"] == name]
    assert len(got) == 1, got
    return got[0]


# ---------------------------------------------------------------- 一、鉴权：三个新口在同一把门后面

def test_没配管理口令时三个新口一律503(client, admin_pw, monkeypatch, db):
    """口令没配是"这台服务器还没开这一页"，不是"谁都能进"（与运营图那四个口同一条纪律）。"""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get(SECRETS).status_code == 503
    assert client.put(f"{SECRETS}/DEEPSEEK_API_KEY", json={"value": SENTINEL}).status_code == 503
    assert client.delete(f"{SECRETS}/DEEPSEEK_API_KEY").status_code == 503


def test_匿名打三个新口一律401(client, admin_pw, db):
    assert client.get(SECRETS).status_code == 401
    assert client.put(f"{SECRETS}/DEEPSEEK_API_KEY", json={"value": SENTINEL}).status_code == 401
    assert client.delete(f"{SECRETS}/DEEPSEEK_API_KEY").status_code == 401


def test_用户那两把钥匙都开不了密钥这三个口(client, admin_pw, db):
    """A7 那条反向纪律在新口上重判一遍：能换全站背景图的钥匙不等于能读用户的账，
    反过来用户的登录钥匙也不能往服务器里塞凭据。"""
    u = User(openid="secrets-gate-1")
    db.add(u)
    db.commit()
    for h in (
        {"Authorization": f"Bearer {_create_token(u.id, u.generation)}"},
        {"Authorization": f"Bearer {create_unlock_token(u)}"},
    ):
        assert client.get(SECRETS, headers=h).status_code == 401
        assert put(client, "DEEPSEEK_API_KEY", SENTINEL, headers=h).status_code == 401
        assert client.delete(f"{SECRETS}/DEEPSEEK_API_KEY", headers=h).status_code == 401


# ---------------------------------------------------------------- 二、存与读：回体里没有那一个字段

def test_存一把之后账上有而值不在回体里(client, admin_pw, db):
    r = put(client, "DEEPSEEK_API_KEY", SENTINEL, note="10 新建的那把")
    assert r.status_code == 200, r.text
    body = r.json()
    assert SENTINEL not in r.text, "值出现在回体里 = 这一页能把它显示出来"
    assert "value" not in body, f"回体里多出一个能装值的字段：{sorted(body)}"
    assert body["name"] == "DEEPSEEK_API_KEY"
    assert body["length"] == len(SENTINEL)
    assert re.fullmatch(r"[0-9a-f]{8}", body["fingerprint"])
    assert body["note"] == "10 新建的那把"
    assert body["updated_at"].endswith("Z")
    assert SENTINEL not in json.dumps(listed(client), ensure_ascii=False)


def test_指纹就是原值的sha256前八位(client, admin_pw, db):
    """不是随手取的前八个字符：他要比的是"这两把是不是同一把"，而前缀相同的两把 key 太常见。"""
    import hashlib
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    it = one(client, "DEEPSEEK_API_KEY")
    assert it["fingerprint"] == hashlib.sha256(SENTINEL.encode()).hexdigest()[:8]
    assert it["fingerprint"] != SENTINEL[:8]


def test_名字两边都规范化成大写而库里只有一行(client, admin_pw, db):
    """他手打的 `deepseek_api_key` 与代码里那一个 `DEEPSEEK_API_KEY` 是同一个名字。
    不规范化就会出两行同义、而 `resolve()` 只读得到其中一行的那种"存了没生效"。"""
    assert put(client, "  deepseek_api_key ", "v-第一个").status_code == 200
    assert {i["name"] for i in listed(client)} == {"DEEPSEEK_API_KEY"}
    assert put(client, "DEEPSEEK_API_KEY", "v-第二个").status_code == 200
    items = listed(client)
    assert len(items) == 1, "覆盖存成两行 = 后台看得见两条、代码只读其中一条"
    assert items[0]["length"] == len("v-第二个")


def test_只改值不许把原来那句备注擦掉(client, admin_pw, db):
    put(client, "DEEPSEEK_API_KEY", "v-第一个", note="这一把是 10 新建的")
    put(client, "DEEPSEEK_API_KEY", "v-第二个")
    assert one(client, "DEEPSEEK_API_KEY")["note"] == "这一把是 10 新建的"
    # 反向对照：他真把备注框清空了，那就按清空算，不许"其实还想留着"
    put(client, "DEEPSEEK_API_KEY", "v-第三个", note="   ")
    assert one(client, "DEEPSEEK_API_KEY")["note"] is None


@pytest.mark.parametrize("坏名字,关键词", [
    ("1ABC", "字母开头"),
    ("带 空格", "下划线"),
    ("deepseek-api-key", "下划线"),
    ("中文名字", "字母"),
    ("A" * 65, "最长"),
    ("_", "字母开头"),
])
def test_坏名字逐条拦住且回中文可读(client, admin_pw, db, 坏名字, 关键词):
    r = put(client, 坏名字, SENTINEL)
    assert r.status_code == 400, f"{坏名字!r} 这条居然放行了：{r.status_code} {r.text}"
    assert 关键词 in r.json()["detail"], f"{坏名字!r} 拦住了但话不对：{r.json()['detail']}"
    assert listed(client) == [], "拦住了还写进账上 = 库里多了一把没人认领的值"


@pytest.mark.parametrize("值,关键词", [
    ("   \n\t ", "空的"),          # 只有空白：strip 完是空，存进去谁都读不懂
    ("x" * (service_secrets.MAX_VALUE_CHARS + 1), "超过上限"),
])
def test_坏值逐条拦住(client, admin_pw, db, 值, 关键词):
    r = put(client, "DEEPSEEK_API_KEY", 值)
    assert r.status_code == 400, f"这一份值放行了：{r.status_code} {r.text}"
    assert 关键词 in r.json()["detail"]
    assert listed(client) == [], "拦住了还写进账上 = 存了一把空值把 .env 挡住"


def test_缺value字段是422而空串是服务层那一句400(client, admin_pw, db):
    """两道门各有各的话：表单没填（422，pydantic）与填了但是空的（400，服务层）。
    把它们并成一条，页面上一句"空的"就可能变成一串英文校验术语。"""
    assert client.put(f"{SECRETS}/DEEPSEEK_API_KEY", json={}, headers=ah(client)).status_code == 422
    r = put(client, "DEEPSEEK_API_KEY", "")
    assert r.status_code == 400 and "空的" in r.json()["detail"]
    assert listed(client) == []


def test_值两头的空白在写的那一刻就剥掉(client, admin_pw, db):
    """粘贴最常带一个尾空格，而带尾空格的凭据在微信那头发 40009、在云函数那头发 401，
    症状是"明明照着一模一样填的却不通"（同 `admin_access._configured` 那一条的理由）。"""
    put(client, "DEEPSEEK_API_KEY", "  " + WECHAT_NEW + "\t")
    assert service_secrets.resolve("DEEPSEEK_API_KEY") == WECHAT_NEW


def test_删除回的是这一趟真删了东西没有(client, admin_pw, db):
    h = ah(client)
    assert client.delete(f"{SECRETS}/NO_SUCH_NAME", headers=h).json() == {
        "name": "NO_SUCH_NAME", "deleted": False}
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    assert client.delete(f"{SECRETS}/DEEPSEEK_API_KEY", headers=h).json()["deleted"] is True
    assert listed(client) == []


def test_删除不存在的名字不许把已有那行带走(client, admin_pw, db):
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    client.delete(f"{SECRETS}/OTHER_NAME", headers=ah(client))
    assert {i["name"] for i in listed(client)} == {"DEEPSEEK_API_KEY"}


# ---------------------------------------------------------------- 三、值不外流：日志与那一页 HTML

def test_写进日志的只有名字长度与指纹(client, admin_pw, db, caplog):
    with caplog.at_level("INFO"):
        put(client, "DEEPSEEK_API_KEY", SENTINEL, note="哨兵")
    assert SENTINEL not in caplog.text
    assert "DEEPSEEK_API_KEY" in caplog.text and "指纹" in caplog.text


def test_那一页HTML里没有值也没有可回显的地方(client, admin_pw, db):
    """页面是一份常量 HTML，值从没进过它。这一条钉的是"下一次有人觉得回显一下方便"：
    回显一次，就多出三条能把值读出去的路（页面、浏览器历史、任何截图）。"""
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    html = client.get("/ops").text
    assert SENTINEL not in html
    assert "密钥配置" in html
    assert 'id="secValue" type="password"' in html
    assert "不回显" in html


def test_密钥那一栏的日期不许切UTC串当本地那天():
    """静态尺子：接口回的 `updated_at` 是带 Z 的 UTC 串，`slice(0,10)` 切出来是 UTC 那一天。
    本机实测（北京时间 10-25 00:45 存的一把）显示成"更新于 2026-10-24"——刚存完就看到"昨天"，
    正是 `core/timefmt.py` 文件头那条老坑在这一页上的形状。运营图那几栏维持原样是单独一格的
    事（他已经在用的显示），这里只钉新增的这一栏不许重犯。"""
    body = (BACKEND / "app" / "api" / "routes" / "ops_page.py").read_text(encoding="utf-8").split("_PAGE", 1)[1]
    assert "function localDay" in body
    assert "localDay(it.updated_at)" in body
    assert "dayOf(it.updated_at)" not in body


# ---------------------------------------------------------------- 四、读侧真覆盖：名单要改得出行为

def _resolve_literals() -> set:
    """源码里真出现过的 `resolve("名字")` 字面量集合（测试目录不算：那里的是断言不是读法）。"""
    found = set()
    for f in BACKEND.rglob("app/**/*.py"):
        if f.match("*/service_secrets.py"):
            continue
        found |= set(re.findall(r'resolve\(\s*"([A-Z][A-Z0-9_]{1,63})"', f.read_text(encoding="utf-8")))
    return found


def test_名单与真读它的字面量一字不差():
    """两边都不许多：名单多一个 = 页面对一个没人读的名字说"库里这一行正在生效"（假话）；
    名单少一个 = 存进去根本不生效而页面不说（也是假话）。"""
    assert _resolve_literals() == set(service_secrets.CONSUMED_NAMES), (
        f"CONSUMED_NAMES={sorted(service_secrets.CONSUMED_NAMES)} 与源码里 resolve(\"...\") "
        f"的字面量 {sorted(_resolve_literals())} 对不上"
    )


def test_库里那一把真发给了微信token那一趟(client, admin_pw, db):
    put(client, "WECHAT_APP_SECRET", WECHAT_NEW)
    assert wechat._token_body()["secret"] == WECHAT_NEW
    # 反向对照：没被覆盖的名字仍然走 .env——覆盖不是"所有配置都改从库里来"
    assert wechat._token_body()["appid"] == settings.WECHAT_APP_ID


def test_库里那一把真发给了code2session那一趟(client, admin_pw, db, monkeypatch):
    """两处读法必须一起改：只改 token 那一头，症状是"登录用新钥匙、取 token 用旧的那把"，
    两边都回 200，只在偶发的 40001 里露出来，是最难查的一类不一致。"""
    seen = {}

    class _Ctx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None):
            seen.update(params or {})

            class R:
                status_code = 200
                text = '{"openid":"o1","session_key":"k"}'

                def json(self):
                    return {"openid": "o1", "session_key": "k"}
            return R()

    monkeypatch.setattr(auth_core.httpx, "AsyncClient", lambda *a, **k: _Ctx())
    put(client, "WECHAT_APP_SECRET", WECHAT_NEW)
    asyncio.run(auth_core._wechat_code2session("x"))
    assert seen["secret"] == WECHAT_NEW


def test_库里那一把真发给了提炼云函数那一趟(client, admin_pw, db, monkeypatch):
    seen = {}

    class _Ctx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            seen.update({"url": url, "headers": headers or {}})

            class R:
                status_code = 401       # 4xx 按"重试也不会好"直接抛：不必真等 1+2+4 秒退避
                text = "unauthorized"

                def json(self):
                    return {}
            return R()

    monkeypatch.setattr(settings, "HUNYUAN_CF_URL", "https://cf.example/functions/extract")
    monkeypatch.setattr(llm.httpx, "AsyncClient", lambda *a, **k: _Ctx())
    put(client, "HUNYUAN_CF_KEY", CF_NEW)
    with pytest.raises(RuntimeError):
        asyncio.run(llm._call_hunyuan_cloud_function("正文", "标题", None))
    assert seen["headers"]["Authorization"] == f"Bearer {CF_NEW}"
    assert CF_NEW not in seen["url"], "凭据进了 URL = 它会在任何一份访问日志里出现"


def test_删掉一行那个名字立刻回到env值(client, admin_pw, db):
    """这是"撤回一次改动不需要知道旧值"那一条的落地，也是这张表敢上现网的前提。"""
    env = settings.WECHAT_APP_SECRET
    assert service_secrets.resolve("WECHAT_APP_SECRET", env) == env
    put(client, "WECHAT_APP_SECRET", WECHAT_NEW)
    assert service_secrets.resolve("WECHAT_APP_SECRET", env) == WECHAT_NEW
    client.delete(f"{SECRETS}/WECHAT_APP_SECRET", headers=ah(client))
    assert service_secrets.resolve("WECHAT_APP_SECRET", env) == env


def test_存一把没人读的名字不改变任何消费者(client, admin_pw, db):
    """一个还没接上的名字存进去 = 只是躺在库里。页面靠 `consumed` 这一格把这句话说明白，
    而不是等他的 DeepSeek 调用出不来再回来查。"""
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    assert one(client, "DEEPSEEK_API_KEY")["consumed"] is False
    assert wechat._token_body()["secret"] == settings.WECHAT_APP_SECRET


# ---------------------------------------------------------------- 五、读侧不许抛：坏了只能退回 .env

def test_表还没建出来时照常回env值而不是抛(db):
    """迁移还没跑、或有人手工删了这张表：这一句站在登录那条链上，
    它失败的样子必须"和没这一页时一模一样"，不能是登录 500。"""
    db.execute(sqlalchemy.text("drop table service_secrets"))
    db.commit()
    assert service_secrets.resolve("WECHAT_APP_SECRET", "env-那一份") == "env-那一份"


def test_库里是一行空值时不算覆盖(db):
    """手工 UPDATE 出来的空行不许把 .env 挡住：这一层的判据是"有没有一把能用的值"，
    不是"有没有这一行"。"""
    db.merge(ServiceSecret(name="WECHAT_APP_SECRET", value="   "))
    db.commit()
    assert service_secrets.resolve("WECHAT_APP_SECRET", "env-那一份") == "env-那一份"


@pytest.mark.parametrize("脏名字", ["", "  ", "小写也行", "带 空格", "wechat_app_secret"])
def test_读侧对任何脏名字只回值不抛(脏名字, db):
    """读侧不调 `canonical_name`：那一句会抛，而这里任何输入只能有一个结果——退回 fallback。
    最后一条（小写）是真读法那一侧的形状：代码里写的是大写，谁哪天手滑传了小写，
    结果必须是"退回 .env"，不是"读到一把另一个名字的值"。"""
    assert service_secrets.resolve(脏名字, "fallback") == "fallback"


def test_sessionlocal抛异常时退回env值(db, monkeypatch):
    """库被锁 / 连接打满 / 表还没建，三种原因只该有一个结果：照旧用 .env。"""
    def boom():
        raise RuntimeError("database is locked")

    monkeypatch.setattr(service_secrets, "SessionLocal", boom)
    assert service_secrets.resolve("WECHAT_APP_SECRET", "env-那一份") == "env-那一份"


# ---------------------------------------------------------------- 六、那两格 flags：能不能回去、有没有人读

def test_env_present说的是env那头而不是库里(client, admin_pw, db):
    """他必须能看出"存这一把到底是覆盖了 .env，还是 .env 本来就没有这一行"——
    后一种情况下删除那一行的后果完全不同（没值可用）。"""
    put(client, "WECHAT_APP_SECRET", WECHAT_NEW)
    assert one(client, "WECHAT_APP_SECRET")["env_present"] is True
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    assert one(client, "DEEPSEEK_API_KEY")["env_present"] is False


def test_env_present只看值不看名字在不在(db):
    """.env 里有这一行但是空的，回"没有值"才是真话——否则删除那一格的说明会骗人。"""
    assert service_secrets._env_present("DATABASE_URL") is True
    assert service_secrets._env_present("NO_SUCH_NAME_AT_ALL") is False


# ---------------------------------------------------------------- 七、迁移：部署完那一刻现网行为一行不变

def test_迁移建出这张表而且空表时读的就是env那一份(tmp_path):
    """这一条只能真跑 alembic：用例建表走 `create_all`，线上走迁移，两条对不上时
    测试全绿而线上第一条写入就报 no such table（同 `test_quota_and_invite.py` 那把尺子）。

    后半句是这一版上线的副作用声明：表建出来是空的，而空表时 `resolve()` 回的就是
    `.env` 的值——所以现网那三条消费者（登录、微信 token、提炼）在部署完那一刻一行都不变。
    """
    db_file = tmp_path / "mig.db"
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{db_file}", JWT_SECRET_KEY="x")
    r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                       cwd=str(BACKEND), env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-600:]
    conn = sqlite3.connect(db_file)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(service_secrets)")}
    assert cols == {"name", "value", "note", "created_at", "updated_at"}, cols
    assert conn.execute("select count(*) from service_secrets").fetchone()[0] == 0, \
        "这张表预建了行：那一页会显示一批没人配过的名字"
    # 名字直接当主键，所以库里天然不可能出现两行同名（服务层那句"覆盖"靠的就是这一条）
    assert conn.execute(
        "select sql from sqlite_master where name='service_secrets'"
    ).fetchone()[0].count("PRIMARY KEY") == 1
