"""密钥配置这一条链（10-25，站长 10-24 两句「密钥配置功能请加到cn的官网后台，我自己去加」
「配置功能放错地方了，你放在图麦克，应该放在图麦笔记下面进行配置」）：
鉴权、存与读、值不外流、读侧覆盖真生效、读侧不许抛。

尺子按"这一栏上现网之后最可能怎么坏"分组，不是按代码文件分组：

- 第一组（鉴权）复用运营图那把现成的门，只补"三个新口都在同一把门后面"这一条。
- 第二组（存与读）钉的是"回体里没有 value 那一个字段"。每一条都拿同一个哨兵原值去扫响应文本，
  因为这类接口坏起来的样子不是报错，是"哪天有人顺手把 value 加回返回体，好让它能回显"。
- 第三组（值不外流）钉日志与那一页两处——journald 没有按人隔离，也不随任何东西删掉。
- 第四组（读侧真生效）钉这一栏存在的唯一理由：`CONSUMED_NAMES` 里每一个名字，
  都要**真改得出消费者的行为**；改不出，这一栏就是一个好看的抽屉。
- 第五组（读侧不许抛）钉 `resolve()` 那一句退回 `.env`：表还没建、库被锁，都不能变成登录 500。
- 第六组（那一页）钉两条纪律：值不许进 HTML，"读不到"不许写成"一条都没有"。
- 第七组（迁移）真跑一遍 alembic：这一条钉的是"部署完那一刻现网行为一行不变"。

跑法：cd backend && .venv/bin/python -m pytest tests/test_service_secrets.py -q
"""
import asyncio
import hashlib
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
    return r.json()["rows"]


def one(client, name) -> dict:
    got = [i for i in listed(client) if i["name"] == name]
    assert len(got) == 1, got
    return got[0]


def ops_body() -> str:
    return (BACKEND / "app" / "api" / "routes" / "ops_page.py").read_text(encoding="utf-8").split("_PAGE", 1)[1]


# ---------------------------------------------------------------- 一、鉴权：三个新口在同一把门后面

def test_没配管理口令时三个新口一律503(client, admin_pw, monkeypatch, db):
    """口令没配是"这台服务器还没开这一页"，不是"谁都能进"（与运营图那几枚口同一条纪律）。"""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get(SECRETS).status_code == 503
    assert client.put(f"{SECRETS}/DEEPSEEK_API_KEY", json={"value": SENTINEL}).status_code == 503
    assert client.delete(f"{SECRETS}/DEEPSEEK_API_KEY").status_code == 503


def test_匿名打三个新口一律401(client, admin_pw, db):
    assert client.get(SECRETS).status_code == 401
    assert client.put(f"{SECRETS}/DEEPSEEK_API_KEY", json={"value": SENTINEL}).status_code == 401
    assert client.delete(f"{SECRETS}/DEEPSEEK_API_KEY").status_code == 401


def test_用户那两把钥匙都开不了密钥这三个口(client, admin_pw, db):
    """A7 那条反向纪律在新口上重判一遍：能换全站首页那一张图的钥匙不等于能读用户的账，
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
    assert SENTINEL not in r.text, "值出现在回体里 = 这一栏能把它显示出来"
    assert "value" not in body, f"回体里多出一个能装值的字段：{sorted(body)}"
    assert body["name"] == "DEEPSEEK_API_KEY"
    assert body["length"] == len(SENTINEL)
    assert re.fullmatch(r"[0-9a-f]{8}", body["fingerprint"])
    assert body["note"] == "10 新建的那把"
    assert body["updated_at"].endswith("Z")
    assert SENTINEL not in json.dumps(listed(client), ensure_ascii=False)


def test_指纹就是原值的sha256前八位(client, admin_pw, db):
    """不是随手取的前八个字符：他要比的是"这两把是不是同一把"，而前缀相同的两把 key 太常见。"""
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
    ("", "空的"),
    ("   \n\t ", "空的"),          # 只有空白：strip 完是空，存进去谁都读不懂
    ("x" * (service_secrets.MAX_VALUE_CHARS + 1), "超过上限"),
])
def test_坏值逐条拦住且说的是服务层那句人话(client, admin_pw, db, 值, 关键词):
    """这三条都必须是 400 不是 422：`SecretIn` 故意不带 Field 约束（照 `BlockIn` 那条
    10-19 现网探针撞出来的纪律），否则屏上会冒出操作者不认识的英文校验话。"""
    r = put(client, "DEEPSEEK_API_KEY", 值)
    assert r.status_code == 400, f"这一份值放行了或走错了门：{r.status_code} {r.text}"
    assert 关键词 in r.json()["detail"]
    assert listed(client) == [], "拦住了还写进账上 = 存了一把空值把 .env 挡住"


def test_缺value字段才是pydantic那一扇422(client, admin_pw, db):
    """与上面那条分开钉：**没填**（422，Pydantic 的领域）与**填了但是空的**（400，我们那句人话）
    是两件事；把它们并成一条，屏上那句"空的"就可能变成一串英文术语。"""
    assert client.put(f"{SECRETS}/DEEPSEEK_API_KEY", json={}, headers=ah(client)).status_code == 422


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


def test_回体里带着consumed_names那一格(client, admin_pw, db):
    """页面要说"今天真被代码读的名字有哪几个"，这个名单只能有一个出处（服务层那一份）；
    页面里另抄一份名单，就是名单改了而屏上还在念旧的。"""
    body = client.get(SECRETS, headers=ah(client)).json()
    assert body["consumed_names"] == list(service_secrets.CONSUMED_NAMES)


# ---------------------------------------------------------------- 三、值不外流：日志与那一页

def test_写进日志的只有名字长度与指纹(client, admin_pw, db, caplog):
    with caplog.at_level("INFO"):
        put(client, "DEEPSEEK_API_KEY", SENTINEL, note="哨兵")
    assert SENTINEL not in caplog.text
    assert "DEEPSEEK_API_KEY" in caplog.text and "指纹" in caplog.text


def test_那一页里没有值也没有可回显的地方(client, admin_pw, db):
    """页面是一份常量 HTML，值从没进过它。这一条钉的是"下一次有人觉得回显一下方便"：
    回显一次，就多出三条能把值读出去的路（页面、浏览器历史、任何截图）。"""
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    html = client.get("/ops").text
    assert SENTINEL not in html
    assert "密钥配置" in html
    assert "inValue.type = 'password'" in html
    assert "不回显" in html


def test_密钥那一栏的日期不许切UTC串当本地那天():
    """静态尺子：接口回的 `updated_at` 是带 Z 的 UTC 串，`slice(0,10)` 切出来是 UTC 那一天。
    本机实测（北京时间 10-25 00:2x 存的一把）显示成"更新于 2026-10-24"——刚存完就看到"昨天"，
    正是 `core/timefmt.py` 文件头那条老坑在这一页上的形状。其余几栏维持 `dayOf` 是各自那一格的事，
    这里只钉新增的这一栏不许重犯。"""
    body = ops_body()
    assert "function localDay" in body
    # 只钉自己这一段：`dayOf(r.updated_at)` 在「卡片模板」那一栏是别人那一格的写法（1348 行），
    # 整页一刀切会把不相干的那栏一起判红——那等于替别人的那一格做了决定。
    seg = body.split("function secretRow", 1)[1].split("function renderSecrets", 1)[0]
    assert "localDay(r.updated_at)" in seg
    assert "dayOf(" not in seg


def test_登录那一趟把密钥这一栏也拉一遍(client, admin_pw, db):
    """与 `test_admin_fusion` 里那条"几屏一起拉"同一把尺子：少这一个调用，
    症状是这一栏在配置那一屏里**永远是一片空**，而接口与页面各自都没报错。

    锚钉在 `Promise.all([` 那一段的内容上，不钉整串名字：10-25 上这一栏时，
    「来源黑名单」那一栏的全串钉子红过一次（那一趟只是加了第四只读口）。
    这一句要判的是"在不在同一趟里"，不是那一排恰好有几个名字。"""
    body = ops_body()
    seg = body.split("Promise.all([", 1)[1].split("]", 1)[0]
    assert "loadSecrets()" in seg, "登录那一趟没把密钥这一栏一起拉"
    assert "card.dataset.key = 'secret:list'" in body, "卡没挂 data-key，左栏那一条点不到这一栏"
    assert "box.appendChild(card);" in body, "只造卡不挂卡＝函数跑了、屏上一片空"


def test_生效值那一句不许替env那头下断言(client, admin_pw, db):
    """屏上那两句只说"删掉之后拿不拿得到值"，不说".env 里有没有那一行"。

    服务端能实读的只有 `settings` 这一头：一个没在 `config.py` 声明过的名字（例 `DEEPSEEK_API_KEY`），
    `.env` 里真写着那一行也读不进来（`extra="ignore"`），本机 10-25 真点就是这么一档——
    那一行在文件里、屏上却说"没有"。所以关于**文件**的那半句是量不到的断言，删掉；
    两句话一律只报回退那一路的结果。"""
    body = ops_body()
    # 只量**会上屏的那一串**：这一段禁的是屏上的断言，注释里为了说明"为什么禁"必须
    # 引用那半句原文，把注释也算进去会把尺子钉成自相矛盾（10-25 这条红过一次，红的就是我自己的注释）。
    code = "\n".join(l for l in body.splitlines() if not l.strip().startswith("//"))
    seg = code.split("function secretSourceLine", 1)[1].split("function secretRow", 1)[0]
    assert "库里这一行（删掉回到 .env）" in seg and "库里这一行（删掉就没有值了）" in seg
    assert "env_present" in seg, "两句话没按 flag 分岔，等于只有一句"
    assert ".env 里没有这一行" not in code, "又写成关于 .env 文件的一断言（那一头实读不到）"
    row = code.split("function secretRow", 1)[1].split("function renderSecrets", 1)[0]
    assert "（这个名字现在没有值了）" in row


def test_删掉一把要两下而保存只要一下(client, admin_pw, db):
    """整页那条口径（`arm()` 上面那段注释）：改线上正在用的值＝两下，保存这几项＝一下。
    静态钉的是别把这两类写反——写反的症状是要么删一把凭据一点就断登录，
    要么每存一次都要多点一下。"""
    body = ops_body()
    seg = body.split("function secretRow", 1)[1].split("function renderSecrets", 1)[0]
    assert "arm(btn, '再点一次=删掉'" in seg
    save = body.split("btnSave.addEventListener", 1)[1].split("// 回执落在", 1)[0]
    assert "arm(btnSave" not in save and "busyRun(btnSave" in save


def test_读不到不许写成一条都没有(client, admin_pw, db):
    """401/500 与真空表是两件事，合成一句会让人以为服务器上的凭据全没了
    （与「来源黑名单」那一栏的读法同一条纪律）。"""
    body = ops_body()
    seg = body.split("function loadSecrets", 1)[1]
    assert "这一栏没读到：" in seg
    assert "库里一条都没有" in body, "真空表那一句要留在渲染里，但不能顶掉读不到的那一句"


# ---------------------------------------------------------------- 四、读侧真覆盖：名单要改得出行为

def _resolve_literals() -> set:
    """源码里真出现过的 `resolve("名字")` 字面量集合（测试目录不算：那里的是断言不是读法）。"""
    found = set()
    for f in BACKEND.rglob("app/**/*.py"):
        if f.name == "service_secrets.py":
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
    assert WECHAT_NEW not in str(seen.get("url", "")), "凭据进了 URL = 它会在任何一份访问日志里出现"


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
    它失败的样子必须"和没这一栏时一模一样"，不能是登录 500。"""
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


def test_库里是大写那一行而读侧传小写也要拿得到它(db):
    """上一条只量到"小写不抛"，量不到"小写读得着"：那一趟库里根本没有行，
    把 `resolve` 里那一句 `.upper()` 抹掉照样全绿（10-25 那把反向探针就是这么漏的）。
    这一条补上"存的是大写、读的是小写"那一格——大小写不该是第二次身份。"""
    db.merge(ServiceSecret(name="WECHAT_APP_SECRET", value="库里那一把"))
    db.commit()
    assert service_secrets.resolve("wechat_app_secret", "env-那一份") == "库里那一把"
    assert service_secrets.resolve(" WECHAT_APP_SECRET ", "env-那一份") == "库里那一把"


def test_sessionlocal抛异常时退回env值(db, monkeypatch):
    """库被锁 / 连接打满 / 表还没建，三种原因只该有一个结果：照旧用 .env。"""
    def boom():
        raise RuntimeError("database is locked")

    monkeypatch.setattr(service_secrets, "SessionLocal", boom)
    assert service_secrets.resolve("WECHAT_APP_SECRET", "env-那一份") == "env-那一份"


# ---------------------------------------------------------------- 六、那两格 flags：能不能回去、有没有人读

def test_env_present说的是env那头而不是库里(client, admin_pw, db):
    """他必须能看出"存这一把到底是覆盖了 .env，还是回退那一路根本没有值可用"——
    两种情况下删除那一行的后果完全不同。

    ⚠ 这一格读的是 `settings`（回退那一路真拿得到的那一份），不是 `.env` 那个文件：
    `DEEPSEEK_API_KEY` 本机 `.env` 里**写着那一行**，但 `config.py` 没声明它、`extra="ignore"`
    把它丢在装载那一步，所以这里回 False 是对的。屏上那一句因此不许提文件（见上一条尺子）。"""
    put(client, "WECHAT_APP_SECRET", WECHAT_NEW)
    assert one(client, "WECHAT_APP_SECRET")["env_present"] is True
    put(client, "DEEPSEEK_API_KEY", SENTINEL)
    assert one(client, "DEEPSEEK_API_KEY")["env_present"] is False


def test_env_present只看值不看名字在不在(db):
    """名字要在，值空着照样回"没有值可用"——否则删除那一格的说明会骗人。
    这一格走的是 `os.getenv` 那一条腿（pytest 那几行环境头就是它的样本）。"""
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
        "这张表预建了行：那一栏会显示一批没人配过的名字"
    # 名字直接当主键，所以库里天然不可能出现两行同名（服务层那句"覆盖"靠的就是这一条）
    assert conn.execute(
        "select sql from sqlite_master where name='service_secrets'"
    ).fetchone()[0].count("PRIMARY KEY") == 1
