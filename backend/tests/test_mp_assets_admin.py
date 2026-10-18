"""运营图这条链（方案 docs/方案-cn后台资产管理.md P0-a）：鉴权、上传、发图、下发、冻结闸、生效位。

这把尺子按"一条链走不通会有多静默"来分组，不是按代码文件分组：

- 第一组（鉴权）钉的是 A7 那句"与用户体系完全隔离"。**正反两个方向都要判**：管理凭证开不了
  用户那一排门，用户/解锁/`/v1` 那三把钥匙也开不了管理门。只判一个方向的用例等于没牙——
  少一个方向的症状是"提权"或"打不开"，两者都不会有中间态可以察觉。
- 第二组（上传与校验）钉的是"上限真的咬得住"。每条坏输入单独越一条线（字节、边长、格式、
  假头），否则红了不知道是哪道门拦的。
- 第三组（生效位）钉的是 A1：「没登记过」与「登记成停用」是两个值。这一组的最后一条
  真跑一遍 alembic，因为**这一格是迁移写进去的**，只测 `create_all` 的那条路永远碰不到它。
- 第四组（下发与发图）钉的是 A5/A6：三种"没图"的状态在客户端那一头必须塌成同一条分支。
- 第五组（那一页 HTML）钉两条纪律：页面里不许出现口令值，也不许把任何动态串当 HTML 拼进去。

跑法：cd backend && .venv/bin/python -m pytest tests/test_mp_assets_admin.py -q
"""
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.exc import IntegrityError

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_mpassets.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.auth import _create_token, _create_account_token
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.account import Account
from app.models.mp_asset import KIND_HOME_BG, KIND_PRESET_NOTE_IMAGE, KIND_TIPS, MpAsset, MpSetting
from app.models.user import User
from app.services import mp_assets

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
CONFIG = "/api/mp/config"
STATE = "/api/admin/mp/state"
UPLOAD = "/api/admin/mp/assets"
SETTING = f"/api/admin/mp/settings/{KIND_HOME_BG}"
TEXT = f"/api/admin/mp/texts/{KIND_TIPS}"


def png(w=40, h=60, color=(200, 180, 150)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def jpg(w=40, h=60) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (w, h), (120, 140, 160)).save(buf, "JPEG", quality=90)
    return buf.getvalue()


def huge_png() -> bytes:
    """随机噪声 PNG：压不动，字节数直接爆表，但边长仍在界内——只越"字节"那一条线。"""
    side = 700
    buf = BytesIO()
    Image.frombytes("RGB", (side, side), os.urandom(side * side * 3)).save(buf, "PNG")
    data = buf.getvalue()
    assert len(data) > mp_assets.MAX_BYTES and side <= mp_assets.MAX_EDGE
    return data


@pytest.fixture()
def store(tmp_path, monkeypatch):
    d = tmp_path / "mp-assets"
    monkeypatch.setattr(settings, "MP_ASSETS_DIR", str(d))
    return d


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


@pytest.fixture()
def me(db):
    u = User(openid=f"mpa-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def user_headers(user) -> dict:
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def login(client, pw=ADMIN_PW) -> str:
    r = client.post("/api/admin/login", json={"token": pw})
    assert r.status_code == 200, r.text
    return r.json()["session"]


def admin_h(client) -> dict:
    return {"Authorization": f"Bearer {login(client)}"}


def put_setting(client, headers, asset_id):
    return client.put(SETTING, json={"asset_id": asset_id}, headers=headers)


def upload(client, headers, data, kind=KIND_HOME_BG, name="随便起的名字.jpg", note=None):
    form = {"kind": kind}
    if note is not None:
        form["note"] = note
    return client.post(
        UPLOAD, headers=headers, data=form,
        files={"file": (name, data, "application/octet-stream")},
    )


def current_config(client, me) -> dict:
    r = client.get(CONFIG, headers=user_headers(me))
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- 一、鉴权：两扇门互不开

def test_没配管理口令时后台整条不可用而且不是放行(client, admin_pw, monkeypatch, store):
    """ADMIN_TOKEN 为空必须是 503，绝不能退化成"没设口令 = 谁都能进"（同 APPLE_CLIENT_ID 那条纪律）。"""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    assert client.get(STATE).status_code == 503
    assert upload(client, {}, png()).status_code == 503
    assert put_setting(client, {}, 1).status_code == 503
    assert client.post("/api/admin/login", json={"token": "随便一把"}).status_code == 503


def test_口令不对是401而且回体里没有任何线索(client, admin_pw, store):
    r = client.post("/api/admin/login", json={"token": "差一点点的口令"})
    assert r.status_code == 401
    assert "session" not in r.json()
    assert ADMIN_PW not in r.text


def test_口令两头的空白不算数(client, admin_pw, monkeypatch, store):
    """.env 里手抖多打一个空格是看不出来的，而不去空白的症状是"口令明明对却每次 401"。
    两头都 strip：配置那一边、浏览器里敲的那一边（复制粘贴最常带一个尾空格）。"""
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "  " + ADMIN_PW + "\t")
    assert client.post("/api/admin/login", json={"token": ADMIN_PW}).status_code == 200
    assert client.post("/api/admin/login", json={"token": ADMIN_PW + " "}).status_code == 200
    # 反向对照：中间的空格不放过，剥掉的只是两头
    assert client.post("/api/admin/login", json={"token": ADMIN_PW + " 多一段"}).status_code == 401


def test_非ASCII的口令打进来是401不是500(client, admin_pw, store):
    """`hmac.compare_digest` 吃带非 ASCII 的 str 会直接 TypeError（实测），而"用中文输入法敲、
    或粘过来一串全角引号"是站长自己会走的那条路。这一条钉的是 encode 那一句：
    少了它，症状不是"口令不对"，是登录框转圈之后报服务器错误。"""
    for pw in ("密码", "ｉｆｋ［", "✅-token"):
        assert client.post("/api/admin/login", json={"token": pw}).status_code == 401


def test_空口令不许当口令用(client, admin_pw, store):
    # pydantic 的 min_length=1 拦下空串（422），而 compare_digest 那一路本来也不吃空值。
    assert client.post("/api/admin/login", json={"token": ""}).status_code in (401, 422)


def test_匿名打管理四个口一律401(client, admin_pw, store):
    assert client.get(STATE).status_code == 401
    assert upload(client, {}, png()).status_code == 401
    assert put_setting(client, {}, 1).status_code == 401


def test_用户token与解锁token与v1token都开不了管理门(client, admin_pw, db, me, store):
    assert client.get(STATE, headers=user_headers(me)).status_code == 401
    from app.core.private_access import create_unlock_token
    assert client.get(STATE, headers={"Authorization": f"Bearer {create_unlock_token(me)}"}).status_code == 401
    acct = Account(id=str(uuid.uuid4()), generation=1)
    db.add(acct)
    db.commit()
    assert client.get(STATE, headers={"Authorization": f"Bearer {_create_account_token(acct)}"}).status_code == 401


def test_管理凭证开不了用户那一排门(client, admin_pw, db, me, store):
    """A7 的反向：这一把钥匙只能开后台。拿它去读自己的笔记必须是 401，不是"空列表"。"""
    h = admin_h(client)
    assert client.get("/api/notes/", headers=h).status_code == 401
    assert client.get(CONFIG, headers=h).status_code == 401, "管理凭证能读下发 = 它同时是一把登录钥匙"


def test_换口令之后旧登录当场失效(client, admin_pw, monkeypatch, store):
    h = admin_h(client)
    assert client.get(STATE, headers=h).status_code == 200
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW + "-已经换过了")
    assert client.get(STATE, headers=h).status_code == 401
    assert client.post("/api/admin/login", json={"token": ADMIN_PW}).status_code == 401


# ---------------------------------------------------------------- 二、上传：三道上限各自咬得住

def test_传上来就落盘并记一行账(client, admin_pw, db, store):
    r = upload(client, admin_h(client), png(), note="换春季那张")
    assert r.status_code == 200, r.text
    a = r.json()
    assert (a["width"], a["height"]) == (40, 60)
    assert a["media_type"] == "image/png" and a["file_size"] == len(png())
    assert a["note"] == "换春季那张" and len(a["content_hash"]) == 64
    row = db.get(MpAsset, a["id"])
    assert (store / row.object_path).is_file(), "账上有一行而盘上没文件 = 发出去就是 404"


def test_文件名一律由服务端按哈希起客户端那个名字不参与(store, client, admin_pw, db):
    evil = "../../../../tmp/逃逸.jpg"
    a = upload(client, admin_h(client), png(), name=evil).json()
    # `object_path` 只在账本与盘上，不下发给任何人（包括这一页）：那是服务器上的文件名。
    db.expire_all()
    path = db.get(MpAsset, a["id"]).object_path
    assert path == f"{a['content_hash']}.png"
    assert evil not in path and "/" not in path
    assert sorted(p.name for p in store.iterdir()) == [path], "盘上多出一个文件就是逃逸成功了一半"


@pytest.mark.parametrize("名字,字节,关键词", [
    ("空文件", b"", "空"),
    ("HEIC", b"\x00\x00\x00\x24ftypheic" + b"\x00" * 40, "JPG 或 PNG"),
    ("GIF", b"GIF89a" + b"\x00" * 40, "JPG 或 PNG"),
    ("假PNG（头对身子坏）", b"\x89PNG\r\n\x1a\n" + b"\x11" * 60, "解不开"),
    ("纯文本改名", "这是一段文字".encode() * 20, "JPG 或 PNG"),
])
def test_坏输入逐条拦住且回中文可读(名字, 字节, 关键词, client, admin_pw, store):
    r = upload(client, admin_h(client), 字节)
    assert r.status_code == 400, f"{名字} 这条居然放行了：{r.status_code} {r.text}"
    assert 关键词 in r.json()["detail"], f"{名字} 拦住了但话不对：{r.json()['detail']}"


def test_超字节上限拦住且话里带数(client, admin_pw, store):
    d = upload(client, admin_h(client), huge_png()).json()["detail"]
    assert "超过上限" in d and str(mp_assets.MAX_BYTES // 1024) in d
    # 这一句在路由与服务两处都可能出现（读到上限就停 / 进来之后判），但话术与数字只有一个出处。
    assert d == mp_assets.over_bytes_hint()


def test_超边长拦住但不误伤字节那条线(client, admin_pw, store):
    data = png(mp_assets.MAX_EDGE + 10, 8)   # 细长一张：字节很小，只越边长
    assert len(data) < mp_assets.MAX_BYTES
    d = upload(client, admin_h(client), data).json()["detail"]
    assert "边长" in d and str(mp_assets.MAX_EDGE) in d


def test_不认识的栏目不收(client, admin_pw, store):
    r = upload(client, admin_h(client), png(), kind="不存在的一栏")
    assert r.status_code == 400 and "这一栏" in r.json()["detail"]


def test_同一栏传两次同样的字节只有一行也只有一个文件(client, admin_pw, db, store):
    h = admin_h(client)
    a1 = upload(client, h, png(50, 50, (10, 20, 30))).json()
    a2 = upload(client, h, png(50, 50, (10, 20, 30))).json()
    assert a1["id"] == a2["id"], "重复上传在攒历史，回滚那一栏会被同一张图挤满"
    assert db.query(MpAsset).count() == 1
    assert len(list(store.iterdir())) == 1, "内容寻址不该留下第二份同样的字节"


def test_索引真拦得住并发那次重复(db, store):
    """去重写在服务层，但"两个请求同时各查一遍"只有索引管得住（与 note_cards 同一条纪律）。"""
    data = png(30, 30, (1, 2, 3))
    h = mp_assets.content_hash_of(data)
    for _ in range(2):
        db.add(MpAsset(kind=KIND_HOME_BG, token=f"t{_}", content_hash=h, object_path="x.png",
                       media_type="image/png", file_size=10, width=1, height=1))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.query(MpAsset).count() == 0


# ---------------------------------------------------------------- 三、生效位：A1 那两个值

def test_发布与停用与回滚都是改那一栏(client, admin_pw, db, me, store):
    h = admin_h(client)
    a = upload(client, h, png(60, 60, (9, 9, 9))).json()
    b = upload(client, h, png(61, 61, (8, 8, 8))).json()
    assert current_config(client, me)[KIND_HOME_BG] is None, "没发布过就已经有下发 = 传上来就等于发布"

    assert put_setting(client, h, a["id"]).status_code == 200
    assert current_config(client, me)[KIND_HOME_BG]["content_hash"] == a["content_hash"]
    # 回滚 = 把栏位指回旧那一张，不重传、不动文件
    put_setting(client, h, b["id"])
    assert current_config(client, me)[KIND_HOME_BG]["content_hash"] == b["content_hash"]
    put_setting(client, h, a["id"])
    assert current_config(client, me)[KIND_HOME_BG]["content_hash"] == a["content_hash"]
    # 停用
    put_setting(client, h, None)
    assert current_config(client, me)[KIND_HOME_BG] is None
    assert db.query(MpAsset).count() == 2, "停用不许删账"
    assert len(list(store.iterdir())) == 2, "停用不许删文件——已经拿到过那张图的老设备要一直读得懂"


def test_停用与从未登记在后台是两句话(client, admin_pw, db, store):
    """A1 的落点：`registered` 与 `current` 分开给。合成一句"没图"就把"我停用了它"
    和"我根本没传过"抹平了——这正是名片那条链上造成过不可逆删图的那个读法。"""
    h = admin_h(client)
    db.merge(MpSetting(kind=KIND_HOME_BG, asset_id=None))
    db.commit()
    k = client.get(STATE, headers=h).json()["kinds"][0]
    assert k["registered"] is True and k["current"] is None, "有行、值为空应当读成「发布过、现在停用」"

    db.query(MpSetting).filter(MpSetting.kind == KIND_HOME_BG).delete()
    db.commit()
    k = client.get(STATE, headers=h).json()["kinds"][0]
    assert k["registered"] is False and k["current"] is None


def test_发布不许指别的栏目的资产也不许指一个不存在的id(client, admin_pw, db, store):
    h = admin_h(client)
    other = upload(client, h, png(20, 20, (5, 5, 5))).json()
    db.get(MpAsset, other["id"]).kind = "别的栏目"
    db.commit()
    r = put_setting(client, h, other["id"])
    assert r.status_code == 400 and "栏目" in r.json()["detail"]
    assert put_setting(client, h, 987654).status_code == 400
    assert current_config_empty(db) is None


def current_config_empty(db):
    return mp_assets.current(db, KIND_HOME_BG)


def test_迁移把空值那一行显式建出来(tmp_path):
    """这一格只能靠真跑 alembic 来判：`create_all` 走的是模型，而"空要显式写"是迁移写的。
    只看 create_all 的用例对这一条永远是假绿。

    10-15 文案那半截进来之后，这一条从"只数图片栏"改成**数两个闭集的并**：
    将来谁加了一栏（图片或文案）而忘了在迁移里补那一行空值，这里就红——
    那正是要防的那件事（"这一栏不存在"与"这一栏空着"在界面上是两句话）。
    顺带 `select text_value` 本身就是那条加栏的判据：栏没加上，这条 SQL 直接报错。
    """
    db_file = tmp_path / "mig.db"
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{db_file}")
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(Path(__file__).resolve().parents[1]), env=env, check=True, capture_output=True, text=True,
    )
    conn = sqlite3.connect(db_file)
    rows = conn.execute("select kind, asset_id, text_value from mp_settings order by kind").fetchall()
    want = sorted([(k, None, None) for k in (*mp_assets.KINDS, *mp_assets.TEXT_KINDS)])
    assert rows == want, f"迁移没把每一已知栏目的「空」那一格显式建出来：{rows}"
    idx = conn.execute("select name from sqlite_master where type='index' and tbl_name='mp_assets'").fetchall()
    assert {"ux_mp_assets_token", "ux_mp_assets_kind_hash"} <= {r[0] for r in idx}, idx


# ---------------------------------------------------------------- 四、下发与发图（A2/A4/A5/A6）

def test_下发里每一已知栏目都在且没图时是null(client, admin_pw, db, me, store):
    body = current_config(client, me)
    # 图片栏与文案栏都要在，且缺任何一栏都不行：客户端那两条读法各自只认"这一键存在但为 null"，
    # 键整个不在时它会以为后端还没上（老包行为），新栏就永远拉不到。
    assert set(body) == set(mp_assets.KINDS) | set(mp_assets.TEXT_KINDS)
    assert body[KIND_HOME_BG] is None, "缺键和空值是两件事：客户端要能一条分支走完（锚点 A5）"
    assert body[KIND_TIPS] is None, "文案那一栏没发布时也要显式回 null，客户端才落回包里那六句"


def test_下发给的是相对地址而不是拼好的域名(client, admin_pw, db, me, store):
    """域名与前缀的唯一出处是客户端 utils/api.js:3。后端这里拼一份，nginx 改名的那天就是两份真相分开错。"""
    h = admin_h(client)
    a = upload(client, h, png(70, 70, (4, 4, 4))).json()
    put_setting(client, h, a["id"])
    got = current_config(client, me)[KIND_HOME_BG]
    assert got["url"].startswith("/api/mp/a/") and "://" not in got["url"] and "agentsbin" not in got["url"]
    assert got["content_hash"] == a["content_hash"] and got["updated_at"].endswith("Z")
    assert len(got["url"].split("/")[-1]) >= 24, "地址那一段是可枚举的短串 = A2 白钉"


def test_图不要登录就能取且字节与上传的一字不差(client, admin_pw, db, me, store):
    data = png(80, 80, (3, 3, 3))
    h = admin_h(client)
    a = upload(client, h, data).json()
    put_setting(client, h, a["id"])
    r = client.get(a["url"])          # 一个 Authorization 都不带
    assert r.status_code == 200, r.text
    assert r.content == data
    assert r.headers["content-type"].startswith("image/png")
    assert "immutable" in r.headers["cache-control"], "内容寻址的地址不带 immutable，客户端那一层缓存就永远吃不到"
    assert client.get(CONFIG).status_code == 401, "config 反倒不该免登录（要登录才好按人分桶）"


def test_jpeg按文件头声明不写死png(client, admin_pw, db, store):
    h = admin_h(client)
    a = upload(client, h, jpg()).json()
    r = client.get(a["url"])
    assert r.headers["content-type"].startswith("image/jpeg") and r.content[:2] == b"\xff\xd8"


def test_查不着的token与盘上没文件的都是404(client, admin_pw, db, store):
    h = admin_h(client)
    assert client.get("/api/mp/a/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").status_code == 404
    a = upload(client, h, png(90, 90, (2, 2, 2))).json()
    (store / mp_assets.by_token(db, a["token"]).object_path).unlink()
    r = client.get(a["url"])
    assert r.status_code == 404, "文件没了要出声（404），不许回 200 空字节——那会画出一张坏图并被缓存一年"


def test_账本里路径形状不对就一个字都不读(client, admin_pw, db, store):
    """`object_path` 只可能是服务端生成的那种形状；这一条钉的是有人手工 UPDATE 过库的情况。"""
    h = admin_h(client)
    a = upload(client, h, png(95, 95, (7, 7, 7))).json()
    row = mp_assets.by_token(db, a["token"])
    for evil in ("../../../etc/passwd", "/etc/passwd", "", "a/b.png", "x.gif"):
        row.object_path = evil
        db.commit()
        assert client.get(a["url"]).status_code == 404, f"这一形状居然读得出去：{evil!r}"


@pytest.mark.parametrize("冻结", [True, False])
def test_冻结闸打开时下发一律回空(client, admin_pw, db, me, store, monkeypatch, 冻结):
    """A6：提审期把闸拉上，客户端自然落回包里那张——这是合规闸门，不是功能开关。"""
    monkeypatch.setattr(settings, "MP_ASSETS_FREEZE", 冻结)
    h = admin_h(client)
    a = upload(client, h, png(100, 100, (6, 6, 6))).json()
    put_setting(client, h, a["id"])
    got = current_config(client, me)[KIND_HOME_BG]
    if 冻结:
        assert got is None, "闸开着还在下发 = 审核时看到的首页与上线后不一致"
        assert client.get(a["url"]).status_code == 200, "闸只管下发，不该把已经发出去的地址掐死"
    else:
        assert got and got["content_hash"] == a["content_hash"]
    # 后台那一头始终看得见真实状态 + 一句"现在是冻住的"，否则操作者会以为自己的点击没生效
    s = client.get(STATE, headers=h).json()
    assert s["frozen"] is 冻结 and s["kinds"][0]["current"] is not None


# ---------------------------------------------------------------- 五、那一页 HTML 的两条纪律

def test_ops页面匿名可取但只是一个口令框(client, admin_pw, store):
    r = client.get("/ops")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "no-store" in r.headers["cache-control"] and 'content="noindex"' in r.text
    assert ADMIN_PW not in r.text, "口令写进 HTML = 谁 F12 都读得到，A7 那把钥匙当场作废"
    assert "sessionStorage" in r.text and "localStorage" not in r.text
    # 10-16 审计（融合那一路第 3 条）：这一页拿着管理票，不许被任何别的站嵌进去做点击劫持。
    # 'self' 不挡我们自己那一屏——图麦克那个 iframe 是同源的，同源就在 'self' 里面。
    assert r.headers.get("content-security-policy") == "frame-ancestors 'self'", r.headers.get("content-security-policy")
    assert r.headers.get("x-frame-options") == "SAMEORIGIN"


def test_ops页面那段JS在node里过得去语法(client, store):
    """这一条查的不是 JS 写得对不对，查的是**Python 的转义有没有把 JS 吃掉**。

    那份 HTML 是普通 Python 字符串，`\\/` 出来是一个反斜杠；JS 那边正则里又要写 `\/`。
    两层各剥一次就差一个字，而 Python 与 pytest 都不看 JS 语法——症状是页面打开一片空白，
    只有控制台里有错。所以把**求值之后**的那一段取出来交给 `node --check`（实测：直接拿
    源文件文本去 check 会假红，因为那份文本还没经过 Python 的转义）。
    """
    import re
    import shutil
    from app.api.routes.ops_page import _PAGE

    node = shutil.which("node")
    if not node:
        pytest.skip("这台机器上没有 node")
    js = re.search(r"<script>(.*?)</script>", _PAGE, re.S).group(1)
    assert "\\\\/" not in js, "Python 少剥了一层，正则字面量里带着两个反斜杠"
    fd, path = tempfile.mkstemp(suffix=".js", prefix="ops-page-check-")
    os.close(fd)
    try:
        Path(path).write_text(js, encoding="utf-8")
        r = subprocess.run([node, "--check", path], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr[:600]
    finally:
        os.remove(path)


def test_ops页面没有把任何动态串当HTML拼进去的地方(client, store):
    """这一页显示 note（操作者手打）、hash、日期。判据用 textContent 而不是 innerHTML——
    静态钉这一条：今天页面是常量所以打不进东西，但下一次有人加一栏就会顺手写 innerHTML。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "innerHTML" not in body and "insertAdjacentHTML" not in body and "document.write" not in body
    assert body.count("textContent") >= 8
    assert "encodeURIComponent(kind)" in body


# ---------------------------------------------------------------- 六、文案栏（站长 10-15「Tips 改为后台配置」）

GOOD = {"zh": ["拍张照，随手记下来", "链接贴进来也能提炼"], "en": ["Snap a photo", "Paste a link"]}


def put_text(client, headers, value):
    return client.put(TEXT, json={"value": value}, headers=headers)


def test_文案发一份之后下发读到的就是那一份(client, admin_pw, db, me, store):
    h = admin_h(client)
    r = put_text(client, h, GOOD)
    assert r.status_code == 200, r.text
    body = current_config(client, me)
    got = body[KIND_TIPS]
    assert got is not None and got["zh"] == GOOD["zh"] and got["en"] == GOOD["en"], got
    # updated_at 是客户端判"本机那份要不要换"的唯一依据（图片那条用的是 content_hash，
    # 文案没有字节可哈希）。这一格一旦不在，客户端要么每次都重写缓存、要么永远不换。
    assert got["updated_at"] and got["updated_at"].endswith("Z"), got
    assert "content_hash" not in got, "文案条目里不许混进图片那套字段，老包靠这个键决定跳不跳过它"


def test_文案停用之后下发回空而不是缺键(client, admin_pw, db, me, store):
    """A1 那一格在文案侧的同一句：停用要读成"这一栏存在、值是空"，客户端才落回包里那六句。"""
    h = admin_h(client)
    assert put_text(client, h, GOOD).status_code == 200
    assert current_config(client, me)[KIND_TIPS] is not None
    assert put_text(client, h, None).status_code == 200
    assert KIND_TIPS in current_config(client, me)
    assert current_config(client, me)[KIND_TIPS] is None


def test_文案任何一处不合格整份退回不收半份(client, admin_pw, db, me, store):
    """整份退回而不是"收合格那几行"（卡片模板那条是收合格的）：这一行是按顺序轮播的序列，
    丢一句屏上读出的是"少一句且没人知道少了哪句"，比退回一份重填糟得多。"""
    h = admin_h(client)
    bad = [
        ({}, "空对象"),
        ({"zh": GOOD["zh"]}, "缺英文那份"),
        ({"zh": [], "en": GOOD["en"]}, "中文那份零句"),
        ({"zh": ["  "], "en": GOOD["en"]}, "只有一句空白"),
        ({"zh": "一整串不是列表", "en": GOOD["en"]}, "形状不对"),
        ({"zh": ["a"] * (mp_assets.MAX_TIPS_ITEMS + 1), "en": GOOD["en"]}, "句数越线"),
        ({"zh": ["字" * (mp_assets.MAX_TIP_CHARS + 1)], "en": GOOD["en"]}, "单句越线"),
        ({"zh": [None], "en": GOOD["en"]}, "句子里有非字符串"),
    ]
    for value, why in bad:
        r = put_text(client, h, value)
        assert r.status_code == 400, f"{why} 竟然收了：{r.status_code} {r.text}"
    # 上面每一条都得"没写进去"，而不是"写进去半条"
    assert current_config(client, me)[KIND_TIPS] is None


def test_文案的句数与字数上限就是那两枚常量(client, admin_pw, db, me, store):
    """越线一条差一个都不行：上限写在服务层两枚常量上，改常量时这条用例自动跟着走，
    所以它判的是"边界"而不是"这两个数"。"""
    h = admin_h(client)
    at_items = {"zh": ["句"] * mp_assets.MAX_TIPS_ITEMS, "en": GOOD["en"]}
    assert put_text(client, h, at_items).status_code == 200
    at_chars = {"zh": ["字" * mp_assets.MAX_TIP_CHARS], "en": GOOD["en"]}
    assert put_text(client, h, at_chars).status_code == 200
    assert put_text(client, h, {"zh": ["字" * (mp_assets.MAX_TIP_CHARS + 1)], "en": GOOD["en"]}).status_code == 400


def test_图片口与文案口互不开门(client, admin_pw, db, me, store):
    """两个 kind 闭集分开是这一刀的骨架：混用一个口就会出现"给一句话上传一张 JPEG"
    那种点得动、存进库、屏上永远读不到的格子。正反两个方向都要判。"""
    h = admin_h(client)
    # 文案栏走图片口 ⇒ 拒
    assert upload(client, h, png(50, 50), kind=KIND_TIPS).status_code == 400
    assert client.put(f"/api/admin/mp/settings/{KIND_TIPS}", json={"asset_id": 1}, headers=h).status_code == 400
    # 图片栏走文案口 ⇒ 拒（不是静默接受成一份"文案"）
    assert client.put("/api/admin/mp/texts/home_bg", json={"value": GOOD}, headers=h).status_code == 400
    # 而且两边都没写脏东西
    body = current_config(client, me)
    assert body[KIND_TIPS] is None and body[KIND_HOME_BG] is None


def test_文案发出去不许把同一栏的图片生效位带歪(client, admin_pw, db, me, store):
    """`set_text` 里那一句 `row.asset_id = None` 不是顺手写的：它让"两栏都填了一半"在库里无法存在。
    一旦允许，`config_payload` 就得替那种状态编一个优先级，而优先级谁也没拍过。"""
    h = admin_h(client)
    a = upload(client, h, png(70, 70, (9, 9, 9))).json()
    assert put_setting(client, h, a["id"]).status_code == 200
    assert current_config(client, me)[KIND_HOME_BG] is not None
    # 文案写的是 tips 那一行，不该动 home_bg 的生效位
    assert put_text(client, h, GOOD).status_code == 200
    assert current_config(client, me)[KIND_HOME_BG] is not None, "发文案把背景图的生效位洗掉了"


def test_冻结闸打开时文案也一起不下发(client, admin_pw, db, me, store, monkeypatch):
    """提审期那道闸挡的是"运营改动"整条链，不只挡图。漏掉文案的那一半，症状是
    审核包里那行字还在被后台改——那是提审期最怕的一件事，而且界面上没有任何报错。"""
    h = admin_h(client)
    assert put_text(client, h, GOOD).status_code == 200
    monkeypatch.setattr(settings, "MP_ASSETS_FREEZE", True)
    body = current_config(client, me)
    assert set(body) == set(mp_assets.KINDS) | set(mp_assets.TEXT_KINDS)
    assert body[KIND_TIPS] is None and body[KIND_HOME_BG] is None
    monkeypatch.setattr(settings, "MP_ASSETS_FREEZE", False)
    assert current_config(client, me)[KIND_TIPS] is not None, "解冻之后要自己回得来"


def test_没配管理口令时文案口同样是503而不是放行(client, db, me, store, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
    r = client.put(TEXT, json={"value": GOOD}, headers={"Authorization": "Bearer whatever"})
    assert r.status_code == 503, r.text
    assert current_config(client, me)[KIND_TIPS] is None


def test_后台状态里文案与图片分两组给(client, admin_pw, db, me, store):
    """`admin_state` 里 `texts` 单独一组，是因为页面那个 `cardFor()` 整段假设"一栏=一张图"
    （有文件框、有预览、有历史色块）。混进 `kinds` 就会画出一个没用的图框。"""
    h = admin_h(client)
    assert put_text(client, h, GOOD).status_code == 200
    state = client.get(STATE, headers=h).json()
    assert [k["kind"] for k in state["kinds"]] == list(mp_assets.KINDS)
    one = [t for t in state["texts"] if t["kind"] == KIND_TIPS]
    assert len(one) == 1, state["texts"]
    t = one[0]
    assert t["registered"] is True and t["current"]["zh"] == GOOD["zh"]
    # 上限跟着回体走：网页上那句"最多几句、每句几字"与服务层那两枚常量必须是同一个出处
    assert t["max_items"] == mp_assets.MAX_TIPS_ITEMS and t["max_chars"] == mp_assets.MAX_TIP_CHARS
    assert t["langs"] == list(mp_assets.TIP_LANGS)


def test_后台那一页有文案那一组可编辑的格子(client, store):
    """静态钉页面：文案栏要真有 textarea、真走那个新口、且现值走 .value 而不是拼 HTML。
    这条不是装饰——`render()` 里少一行 `texts.forEach`，后端全对、屏上仍是包里那六句，
    而没有任何一处会报错。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "textCardFor" in body and "createElement('textarea')" in body
    assert "api/admin/mp/texts/" in body
    assert "state.texts" in body, "render() 没把文案那一组渲染出来"
    assert "ta.value =" in body


# ---------------------------------------------------------------- 九、官方那一篇的配图（站长 10-18）
# 图片栏从此有两栏。以下四条钉的全是"有了第二栏才会出"的那些事：
# 生效位各走各的、发布口不许跨栏指图、下发里两栏各自成键。
# 这些在只有一栏时都是**结构上不可能发生**的，所以旧那二十七条一条都盖不到它们。

def test_官方配图那一格走完整条链(client, admin_pw, db, me, store):
    """传上去 → 发布 → 下发里读到的是那一张 → 不要登录就能取字节 → 停用回 null 而不是缺键。"""
    h = admin_h(client)
    kind = KIND_PRESET_NOTE_IMAGE
    a = upload(client, h, png(64, 64, (2, 2, 2)), kind=kind).json()
    assert current_config(client, me)[kind] is None, "传上来就等于发布 ⇒ 用户还没点发布就换了图"

    # 「这一栏空着」那半句话按栏给：官方那一篇没有"包里那一张"可回落（这一栏上线之前它就没有图），
    # 照抄首页那一栏的模板话＝对着站长念半句假话。首页那句站长没指过，也不许在这刀里顺手改。
    rows = {k["kind"]: k for k in client.get(STATE, headers=h).json()["kinds"]}
    assert rows[kind]["empty_text"] and "包里" not in rows[kind]["empty_text"], rows[kind]
    assert rows[KIND_HOME_BG]["empty_text"] is None, rows[KIND_HOME_BG]

    r = client.put(f"/api/admin/mp/settings/{kind}", json={"asset_id": a["id"]}, headers=h)
    assert r.status_code == 200, r.text
    got = current_config(client, me)[kind]
    assert got["content_hash"] == a["content_hash"] and got["url"].startswith("/api/mp/a/")
    # 首页那一栏一个字都不该被这次发布带歪：两张图共用同一套 upload/publish 代码，
    # 串了门的表现是"给帮助文档传一张，首页背景换了"——两边都读得到才抓得住。
    assert current_config(client, me)[KIND_HOME_BG] is None

    b = client.get(got["url"])
    assert b.status_code == 200 and b.content == png(64, 64, (2, 2, 2)), "匿名取字节这条链对第二栏也得通"

    client.put(f"/api/admin/mp/settings/{kind}", json={"asset_id": None}, headers=h)
    assert kind in current_config(client, me) and current_config(client, me)[kind] is None, \
        "停用要显式回 null：键整个没了客户端会以为后端还没上，那台机就永远画旧那一张"


def test_发布口不许把另一栏的图指过来(client, admin_pw, db, store):
    """两栏都是图片、都能收字节，所以"拿帮助文档那张去发首页背景"这一趟在结构上第一次变得可行。
    它必须被拒——拒掉了才算`mp_settings` 那一行仍然只说"哪一栏用哪一张"。"""
    h = admin_h(client)
    for_bg = upload(client, h, png(30, 30, (1, 1, 1)), kind=KIND_HOME_BG).json()
    for_note = upload(client, h, png(31, 31, (1, 1, 2)), kind=KIND_PRESET_NOTE_IMAGE).json()

    r = client.put(f"/api/admin/mp/settings/{KIND_PRESET_NOTE_IMAGE}", json={"asset_id": for_bg["id"]}, headers=h)
    assert r.status_code == 400 and "栏目" in r.json()["detail"], r.text
    r2 = client.put(f"/api/admin/mp/settings/{KIND_HOME_BG}", json={"asset_id": for_note["id"]}, headers=h)
    assert r2.status_code == 400 and "栏目" in r2.json()["detail"], r2.text
    assert db.query(MpSetting).filter(MpSetting.asset_id.isnot(None)).count() == 0, "被拒那两趟一行生效位都不该写"


def test_两栏各传各的落盘与账本互不混(client, admin_pw, db, store):
    """同一份字节传到两栏是两件不同的事：账上必须是两行、盘上是两个文件。
    合成一行那天下发就只能指着一张图，另一栏从此发不出任何东西。"""
    h = admin_h(client)
    data = png(40, 40, (7, 7, 7))
    x = upload(client, h, data, kind=KIND_HOME_BG).json()
    y = upload(client, h, data, kind=KIND_PRESET_NOTE_IMAGE).json()
    assert x["id"] != y["id"] and x["token"] != y["token"], "两栏同字节塌成同一行＝后发布那一栏开不了门"
    assert db.query(MpAsset).count() == 2
    kinds = sorted(r[0] for r in db.query(MpAsset.kind).all())
    assert kinds == sorted([KIND_HOME_BG, KIND_PRESET_NOTE_IMAGE])


def test_后台那一页左栏两格图片栏都挂得上(client, admin_pw, store):
    """只加后端 kind、忘了 NAV 那一格＝那一栏永远传不了图（界面是左栏一条条指点出来的）。
    这一条把"模型里每一栏图片"与"页面左栏每一条 `kind:`"对起来数，不抄字面名单。"""
    page = client.get("/ops").text
    for kind in mp_assets.KINDS:
        assert f"key: 'kind:{kind}'" in page, f"左栏少了 {kind} 那一格"
    # 排反了的表现是"图明明发出去了，那一格还在念『当前停用』"：生效那一支必须走在按栏话术之前。
    for needle in ("if (k.current)", "k.empty_text"):
        assert needle in page, needle
    assert page.index("if (k.current)") < page.index("k.empty_text")
