"""融合后台这两条新链（方案 docs/方案-cn后台融合.md，站长 10-15 拍「A 版＋以我们登录为主」）。

分组按"这条链断了会有多静默"来分，不按文件分：

- **① 验票口**：换票那条链唯一的门就是这一口。它一旦"没配暗号也放行"，就等于给整个后台
  开了一条匿名通道，而症状是"融合后台一直能用"——不会有任何人发现。所以第一组先钉 503 那一条，
  再钉"只有管理票能过"：用户 token、`/v1` 那把 account 钥匙、过期票、换过口令后的旧票，
  **四种都要单独判**，少判一种就是"某种钥匙能换到另一条产品线的管理员身份"。
- **② 回体形状**：这一口只该回答"真不真、能干什么、什么时候过期"。回票值或签名相关信息
  就是把验证口变成信息源，所以钉"三个键、零个别的键"。
- **③ 统计口**：钉的是 §8.248 那三条口径里最容易说谎的两条——预置那篇不许算进"新增笔记"，
  以及邀请那两个数不许被代码替操作者判等。日期分桶缺一天补 0 也要判，
  否则"那三天没人来"在图上就是"数据丢了"。

跑法：cd backend && .venv/bin/python -m pytest tests/test_admin_fusion.py -q
"""
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_fusion.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.admin_access import create_session_token
from app.core.auth import _create_token
from app.core.config import settings
from app.core.private_access import PRIVATE_CATEGORY_NAME
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.category import Category
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.share import Share
from app.models.user import User
from app.services.preset_note import PRESET_SOURCE_TYPE

ADMIN_PW = "pytest-admin-token-not-a-real-one-32"
XS = "pytest-exchange-secret-not-a-real-one"
VERIFY = "/api/admin/verify-token"
STATS = "/api/admin/stats/overview"


@pytest.fixture()
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def admin_pw(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)


@pytest.fixture()
def xchange(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    monkeypatch.setattr(settings, "ADMIN_EXCHANGE_SECRET", XS)


def post_verify(client, token, secret=XS):
    headers = {"X-Exchange": secret} if secret is not None else {}
    return client.post(VERIFY, json={"token": token}, headers=headers)


# ---------------- ① 只有管理票能换 ----------------

def test_暗号没配时验票口是503而不是放行(client, admin_pw):
    """ADMIN_EXCHANGE_SECRET 留空必须 503。写成 401 或"当没设暗号=谁都能问"都是错的，
    理由同 APPLE_CLIENT_ID／ADMIN_TOKEN 那两条：功能不可用与门槛消失是两句话。"""
    monkey_off = settings.ADMIN_EXCHANGE_SECRET
    settings.ADMIN_EXCHANGE_SECRET = ""
    try:
        r = post_verify(client, create_session_token(), secret=XS)
        assert r.status_code == 503, r.text
        # 话术跟 `ADMIN_TOKEN` 那条 503 同一族：说"还没配置什么"，不写环境变量名。
        # 全仓那条静态尺子（test_error_text_language）钉的就是"detail 里不许夹未翻译的英文"。
        assert "还没配置" in r.json()["detail"]
    finally:
        settings.ADMIN_EXCHANGE_SECRET = monkey_off


def test_暗号不对一律401(client, xchange):
    r = post_verify(client, create_session_token(), secret="guess-not-the-real-one")
    assert r.status_code == 401, r.text
    r2 = post_verify(client, create_session_token(), secret=None)
    assert r2.status_code == 401, r2.text


def test_有效管理票能过且只回三个键(client, xchange):
    r = post_verify(client, create_session_token())
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"sub", "scope", "exp"}, body
    assert body["scope"] == "admin" and body["sub"] == "admin"
    assert body["exp"] > time.time(), "过期时间要在将来，否则对端签出来的票没法对齐"


def test_四种非管理票都换不到东西(client, xchange):
    """用户 token／account 钥匙／过期票／换过口令的旧票——**四种分别钉一条**。
    合并成一条"其他都不行"的用例等于没判：四种走的是三个不同分支（scope、exp、atk）。"""
    db = SessionLocal()
    u = User(openid="fusion-u", nickname="甲")
    db.add(u)
    db.commit()
    uid, gen = str(u.id), u.generation
    db.close()

    import jwt

    from app.core.admin_access import _token_fingerprint

    assert post_verify(client, _create_token(uid, gen)).status_code == 401
    wrong_scope = jwt.encode(
        {"sub": uid, "scope": "account", "atk": _token_fingerprint(ADMIN_PW), "jti": "z",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM,
    )
    assert post_verify(client, wrong_scope).status_code == 401, "scope 不是 admin 的票换不到东西"

    bad_atk = jwt.encode(
        {"sub": "admin", "scope": "admin", "atk": "0" * 16, "jti": "x",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM,
    )
    assert post_verify(client, bad_atk).status_code == 401, "atk 指纹不对的票必须拒（口令轮换那条）"

    expired = jwt.encode(
        {"sub": "admin", "scope": "admin", "atk": _token_fingerprint(ADMIN_PW), "jti": "y",
         "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM,
    )
    r = post_verify(client, expired)
    assert r.status_code == 401 and "过期" in r.json()["detail"], r.text


def test_换过口令之后旧票当场失效(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW)
    monkeypatch.setattr(settings, "ADMIN_EXCHANGE_SECRET", XS)
    old = create_session_token()
    assert post_verify(client, old).status_code == 200
    monkeypatch.setattr(settings, "ADMIN_TOKEN", ADMIN_PW + "-已经换过了")
    r = post_verify(client, old)
    assert r.status_code == 401 and "已更换" in r.json()["detail"], r.text


def test_统计口还是要管理票不能因为换票口就漏(client, xchange):
    """新加的那条匿名口不许把隔壁那条也带松——这条是"打通之后忘了收"的形状。"""
    assert client.get(STATS).status_code == 401
    assert client.get(STATS, headers={"Authorization": "Bearer nope"}).status_code == 401


# ---------------- ③ 统计口径 ----------------

def _seed():
    db = SessionLocal()
    a = User(openid="fusion-a", nickname="甲", quota_bonus=7)
    b = User(openid="fusion-b", nickname="乙")
    c = User(openid="fusion-c", nickname="丙")
    db.add_all([a, b, c])
    db.commit()
    ua, ub = str(a.id), str(b.id)

    def note(user_id, st, imported=None):
        n = Note(user_id=user_id, title=f"标题-{st}", source_type=st, imported_from=imported)
        db.add(n)
        db.commit()
        return n.id

    n_preset = note(ua, PRESET_SOURCE_TYPE)
    n_manual = note(ua, "manual")
    note(ua, "screenshot")
    note(ub, "share_import", {"from_user": ua, "note_id": n_manual, "title": "标题-manual"})
    note(ub, "wechat_article")

    db.add_all([
        NoteCard(user_id=ua, note_id=n_preset, object_key="cloud://x1", tpl="ink",
                 is_current=True, no_qr=False),
        NoteCard(user_id=ua, note_id=n_preset, object_key="cloud://x2", tpl="ink",
                 is_current=False, no_qr=False),
        NoteCard(user_id=ub, note_id=n_manual, object_key="cloud://x3", tpl="grid",
                 is_current=True, no_qr=True),
    ])
    db.add(Share(user_id=ua, note_id=n_preset, token="tok-live", is_active=True))
    db.add(Share(user_id=ub, note_id=n_manual, token="tok-dead", is_active=False))
    db.add(Invitation(inviter_id=a.id, invitee_id=b.id, reward=10))
    db.commit()
    db.close()


def test_预置那一篇不计入新增但来源分布里看得见(client):
    """§8.248 那条最容易说谎的口径：**totals.notes 扣掉 preset，sources 里保留它那一行**。
    两边都扣就变成"这批用户真的写了 4 篇"的假数；两边都不扣就没人知道扣了多少——
    所以 `preset_notes_excluded` 那一键必须显式回出来。"""
    _seed()
    body = client.get(STATS, headers={"Authorization": f"Bearer {create_session_token()}"}).json()
    assert body["totals"]["notes"] == 4, body["totals"]
    assert body["totals"]["preset_notes_excluded"] == 1
    assert body["totals"]["accounts"] == 3
    src = {s["source_type"]: s["count"] for s in body["sources"]}
    assert src[PRESET_SOURCE_TYPE] == 1, "来源分布里要能看到预置那一行，不然扣了多少只能靠信"
    assert src["wechat_article"] == 1 and src["screenshot"] == 1


def test_转存量与今日新增在同一格里对得上(client):
    _seed()
    body = client.get(STATS, headers={"Authorization": f"Bearer {create_session_token()}"}).json()
    today = datetime.now(timezone.utc).date().isoformat()
    row = [d for d in body["per_day"] if d["date"] == today]
    assert len(row) == 1, "库里存的是 UTC naive，分桶也必须按 UTC，否则今天会裂成两天"
    assert row[0]["notes"] == 4 and row[0]["imports"] == 1
    assert body["tz"] == "UTC" and body["window_days"] == 14
    assert len(body["per_day"]) == 14, "缺的那天要补 0，不能整条消失"


def test_模板榜把当前那张和试过的分开数(client):
    """`total` 数的是"被试过"，`current` 才是"现在挂着"。混起来会把换过模板的用户
    算成"那套模板很受欢迎"，而那正是下架决策要看的那个数。"""
    _seed()
    body = client.get(STATS, headers={"Authorization": f"Bearer {create_session_token()}"}).json()
    rank = {t["tpl"]: t for t in body["templates"]}
    assert rank["ink"] == {"tpl": "ink", "total": 2, "current": 1, "without_qr": 0}
    assert rank["grid"]["without_qr"] == 1, "不带码那一档是发外部平台的，合进去就看不出两条出图路"


def test_邀请那两个数不等时页面上看得出来(client):
    """台账奖励发了 10、用户身上只有 7 ⇒ **代码不许判等、不许"取大的那个"**，
    两个都回出来，差多少算异常由站长判（这条没有公开标准）。"""
    _seed()
    body = client.get(STATS, headers={"Authorization": f"Bearer {create_session_token()}"}).json()
    led = body["invitations"]
    assert led["rewards_granted"] == 10 and led["quota_bonus_held"] == 7
    assert led["invitations"] == 1
    assert body["shares"] == {"created": 2, "active": 1}, "活着的只由 is_active 说话"


def test_days被夹在1到90之间而不是随便多大都算(client):
    h = {"Authorization": f"Bearer {create_session_token()}"}
    assert client.get(f"{STATS}?days=999", headers=h).json()["window_days"] == 90
    assert client.get(f"{STATS}?days=-5", headers=h).json()["window_days"] == 1


# ---------------- ③-b A4 分类 · A9 图片备份 ----------------

def _seed_cats_and_assets():
    """A4／A9 的样本：每一档都留一条能对上的行，并把两条最容易说谎的地方摆出来——
    预置那一篇（永远没分类）与 `backup_status` 为 NULL 的老行（迁移留下的正是 NULL）。

    ⚠ 那两行 NULL **不能用 ORM 写**。`Asset.backup_status` 上有 Python 端的
    `default="uploaded"`，`Asset(backup_status=None)` 传进去会被填成 'uploaded'，
    于是"NULL 并进已上传"那条判据永远量不到 NULL——本机第一轮就是这么假绿的
    （INSERT 的参数字典里读回的是 `'uploaded'`，不是我写的 None）。
    只能像迁移那样直接 `... set backup_status = null`。
    """
    db = SessionLocal()
    a = User(openid="cats-a", nickname="甲")
    db.add(a)
    db.commit()
    ua = str(a.id)

    priv = Category(user_id=ua, name=PRIVATE_CATEGORY_NAME)
    own = Category(user_id=ua, name="住院记录")
    db.add_all([priv, own])
    db.commit()

    def note(cid, st="manual"):
        n = Note(user_id=ua, title=f"标题-{cid}", source_type=st, category_id=cid)
        db.add(n)
        db.commit()

    note(priv.id)
    note(own.id)
    note(None)
    note(None)
    note(None, PRESET_SOURCE_TYPE)  # 预置：不计进"动笔那几篇"

    db.add_all([
        Asset(user_id=ua, object_key="cloud://a1", file_size=1000, backup_status="uploaded"),
        Asset(user_id=ua, object_key="cloud://a2", file_size=2500),
        Asset(user_id=ua, object_key="cloud://a3", file_size=None),
        Asset(user_id=ua, object_key="cloud://a4", file_size=9999, backup_status="failed"),
    ])
    db.commit()
    db.execute(text("update assets set backup_status = null "
                    "where object_key in ('cloud://a2', 'cloud://a3')"))
    db.commit()
    # 先自证样本真是 NULL：样本不对，下面三条判据量的就不是那件事
    got = db.execute(text("select object_key, backup_status, file_size from assets "
                          "where object_key in ('cloud://a2','cloud://a3') "
                          "order by object_key")).all()
    assert [tuple(r) for r in got] == [("cloud://a2", None, 2500), ("cloud://a3", None, None)], got
    db.close()


def test_分类那一栏只出计数不出一个分类名(client):
    """规格 §5 那条硬边界的形状判据：分类名是**用户自己写的字**，屏上出现就等于把用户内容带进来了。
    反向对照很直接——把名字塞进回体（`"names": [...]`）这条立刻红。"""
    _seed_cats_and_assets()
    h = {"Authorization": f"Bearer {create_session_token()}"}
    r = client.get(STATS, headers=h)
    body = r.json()
    cat = body["categories"]
    assert cat["authored"] == 4, cat
    assert cat["uncategorized"] == 2 and cat["categorized"] == 2
    assert cat["private"] == 1, "「私密」那一档是我们服务端自己写的名字，可以单列"
    assert cat["slots"] == 2

    raw = r.text
    assert "住院记录" not in raw, "分类名上了屏：那是用户自己写的字"
    assert PRIVATE_CATEGORY_NAME not in raw, "只出数，连那个服务端写的名字本身也不该回出来"
    assert set(cat) == {"authored", "uncategorized", "categorized", "private", "slots"}, cat


def test_未分类占比不许把预置那一篇算进去(client):
    """和 A2 同一个坑：预置那篇永远没分类，混进来"未分类占比"就变成新用户数的影子。
    这里库里 5 篇、预置 1 篇 ⇒ 分母必须是 4；写成 5 的话 3/5 与 2/4 两个占比都会偏。"""
    _seed_cats_and_assets()
    h = {"Authorization": f"Bearer {create_session_token()}"}
    cat = client.get(STATS, headers=h).json()["categories"]
    assert cat["authored"] == 4, "分母含了预置那一篇"
    assert cat["uncategorized"] == 2, "分子含了预置那一篇"


def test_图片健康度把NULL状态并进已上传但体积空的单独报(client):
    """A9 两条说谎的形状：① `backup_status != 'failed'` 在 SQL 里对 NULL 不成立，
    漏了那一支会让历史老行凭空从"已上传"里消失（库里 3 行上传变 1 行）；
    ② `file_size` 为 NULL 当 0 加，总字节就少报——所以那一行单独给一个"不知道"的数。"""
    _seed_cats_and_assets()
    h = {"Authorization": f"Bearer {create_session_token()}"}
    a = client.get(STATS, headers=h).json()["assets"]
    assert a["total"] == 4 and a["failed"] == 1, a
    assert a["uploaded"] == 3, "NULL 状态没并进已上传：老行从这一栏里悄悄消失了"
    assert a["bytes_uploaded"] == 3500, "失败那行的 9999 不许进这个和"
    assert a["size_unknown"] == 1, "体积为空的行要单独报出来，这个数是下界不是精确占用"


# ---------------- ④ 那一页真把「数据」渲染出来了 ----------------

def test_后台那一页有数据那一组格子():
    """静态钉页面：接口对了、页面少一行调用，屏上仍是只有图与 Tips 那一屏，而且零报错。
    与 `test_mp_assets_admin` 里那条文案栏的钉子同一个理由。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "renderStats" in body and "loadStats" in body
    assert "api/admin/stats/overview" in body, "取数那句没写，或写成了别的口"
    # 锚在前缀上而不是整串一字不差：10-19 加「来源黑名单」那一栏时这里红过一次，
    # 而这条判据要钉的是"登录那一趟顺手把各屏都拉一遍"，不是那一排里恰好两个名字。
    # 第三个读口在不在这一串里，由 tests/test_source_blocklist.py 那条页面钉子负责。
    assert "refresh()" in body and "Promise.all([loadStats(), loadTemplates()" in body, \
        "登录进来那一趟没顺手拉数据（10-15 起几屏一起拉，这句就是那条调用）"
    assert "id=\"stats\"" in body and "$('stats')" in body
    # 这一栏的硬纪律与整页一致：动态串一律 textContent，全页零 innerHTML
    assert "innerHTML" not in body
    assert "SOURCE_LABELS[s.source_type] || s.source_type" in body, "来源漏在表外会把英文写上屏（站长 10-02 撞过）"


def test_数据与配置是两屏不是一列():
    """站长 10-15 17:5x 打回：「数据分析和配置要分开。你怎么没按你的设计稿来做」。

    钉的是**结构**而不是样式：两屏各有一个容器、默认只露「数据」那一屏、左栏那两组由 NAV 生成、
    切换走 showView。第一版我只在原来那一列上插了两行小标题（`<p class="grp">数据</p>` 那种），
    读起来还是"一屏到底"——所以这条判据顺手把那个写法钉死：不许再出现"两组标题夹一堆卡"。
    """
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert 'id="view-stats"' in body and 'id="view-config"' in body, "两屏容器没分开"
    assert 'id="view-config" class="view hidden"' in body, "默认那屏应当是数据，配置要藏起来"
    assert "function showView" in body and "showView('stats')" in body
    assert "grp: '数据'" in body and "grp: '配置'" in body, "左栏那两组没按稿子生成"
    assert 'grp">数据</p>' not in body and 'grp">配置</p>' not in body, "又退回去做'一列加两行标题'了"
    # 卡要能被左栏点到：两边都挂 data-key
    assert "card.dataset.key = 'kind:'" in body and "card.dataset.key = 'text:'" in body
    assert ("keys = ['overview', 'perday', 'sources', 'templates', 'categories', "
            "'assets', 'invites', 'shares']") in body
    # 图麦克那枚：不再是"灰着并写着为什么灰"，两枚都是点得动的切换
    assert 'class="off"' not in body and 'id="swSelf"' in body and "$('swNote').textContent" in body
    assert "还没接上换票口" not in body, "对面已经上线了，那句旧话在屏上是假话"


def test_新加的两张卡把两条边界写在屏上():
    """A4／A9 各有一条"这一栏证明不了什么"的话（规格 §3 A4"只许出计数"、§3 A9"不许写成云端零孤儿"）。
    口径不落在界面上就等于没写：接口对了，读的人仍然会把"登记为已上传"看成"云上零孤儿"。
    这一条是静态钉子——那句话被谁顺手删短了，这里就红。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "d.categories" in body and "d.assets" in body, "两张卡没接上回体里那两键"
    assert "分类与未分类" in body and "一个分类名都不列" in body
    assert "图片云备份健康度" in body and "云端零孤儿" in body
    assert "这个数是下界" in body, "体积为空那行的话没写：总数会被当成精确占用"
    # 左栏那两条要点得动，否则新卡只能靠滚动碰到（与其余六条同一套挂法）
    assert "key: 'categories'" in body and "key: 'assets'" in body


def test_图麦克那一枚点下去是嵌它原页面不是跳走():
    """站长拍的是「一个登录账号，就可以同时管理两个小程序」，主入口是这一页；
    10-16 又拍「你可以用 frame 模式来实现图麦克的原页面」⇒ 这一枚是**嵌进来**，不是跳走。

    两边同源（都在 api.agentsbin.cn），它那一页开局读的就是同源的存储，所以这一侧登过之后
    框里直接是它的 dashboard。这一页仍不替它存任何凭证（`test_mp_assets_admin` 里那条判据）。
    """
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    seg = body.split("$('swOther').addEventListener", 1)[1].split("setProduct('self');", 1)[0]
    assert "f.src = '/admin.html'" in seg, "那一枚没把它的原页面挂进 frame"
    assert "u('admin.html')" not in seg and "api('admin" not in seg, \
        "那一趟是根路径，走 u() 会被加上 /wtsj/ 前缀（挂上去就是 404）"
    assert "showView('tumaike')" in seg and 'id="view-tumaike"' in body, "第四屏的容器或切换没接上"
    assert "if (!f.dataset.on)" in seg, "src 要懒挂：不点就不去它那口上花一次请求"
    assert "if (!session())" in seg, "没登录也照着挂，框里仍是它的口令——这一枚就成了假亮"
    assert "localStorage" not in seg, "这一页不许替它留凭证：本页只吃 sessionStorage 那一条纪律"
    assert "location.href = '/admin.html'" not in body, "已经改成嵌了，不许留着'点一下整页跳走'那条路"
    assert "innerHTML" not in body and "removeItem('opsSession')" not in seg
    # 它那套皮按 1200 排，我们这一栏只有 704：那一屏必须放宽一档，否则嵌进来是挤的
    assert "main.wide" in body and "classList.toggle('wide'" in body
    # 顶上那句"看不到任何用户…"原来是无条件的——嵌进它那一页之后就成了半句假话（框里就看得到它的用户）
    assert '这里只能看到运营内容本身' not in body and '这两栏只看运营内容本身' in body


# ---------------- ⑦ 界面与交互这一轮（10-21 那两遍实测读数驱动） ----------------
#
# 尺子是 `docs/工具/读-后台那一屏现状.mjs`（本机测试库跑一遍、现网只读跑一遍，读数落在
# docs/design/后台优化-自证-20261021/）。它量出来的十条里，有两条**读代码读不出来**：
# 点左栏那条根本没落到对应那张卡（现网读数：点「逐日」落点顶 362px、点「模板热度榜」1077px），
# 以及置灰那几枚等的是假结果（三个写口没 return 那条 promise）。下面每条钉子都对应一个屏上撞过的症状。
#
# 这一组全部走 `_ops_body()`：`OPS_PAGE_SRC` 指到一份临时副本时读副本。那是给
# `docs/工具/反向探针-后台那一屏交互.py` 用的——判据要是不会因为改动而红，就等于没写。

def _ops_body():
    src = Path(os.environ.get("OPS_PAGE_SRC") or
               (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py"))
    return src.read_text(encoding="utf-8").split("_PAGE", 1)[1]


def test_改线上那几枚一律先染橙再点第二下():
    """读数量到的是"这一屏点下去就改线上的按钮 40 枚"，而屏上没有任何一道闸：
    手一滑就把首页背景换了，而且换完屏上连一句"我刚点了什么"都没有。
    口径只有一条：改线上用户看到的东西要两下，保存类的一下。"""
    body = _ops_body()
    assert "function arm(btn, ask, run)" in body and "var ARM_MS = 6000;" in body
    assert "setTimeout(reset, ARM_MS)" in body, "第一下悬着不许永久染橙：六秒不点第二下就自己撤回去"
    # 五枚会改线上的（两处发布／两处停用／拉黑／上下架那一枚）都得挂上闸
    for site in ["arm(btnPub", "arm(btnOff", "arm(btnAdd", "arm(btnSt"]:
        assert site in body, f"{site} 那一枚没了二次确认"
    assert body.count("'再点一次=") >= 6, "闸的话术被删短了：染橙之后屏上得写明第二下干什么"
    # 历史那一格整张缩略图都是落点，比按钮更容易误点，所以它自己那一套染橙也要在
    assert "one.setAttribute('data-armed', '1')" in body and "timer = setTimeout(disarm, ARM_MS)" in body
    # 反面：保存那一枚不许被顺手加上两下（它改错了再存一次就回来，两下只会添麻烦）
    assert "arm(btnSave" not in body and "arm(btnUp" not in body


def test_置灰那几枚等的是真结果():
    """第一版的置灰是"点下去灰一下"就回来了：三个写口没把 promise 递出来，
    busyRun 拿不到"什么时候写完"，于是慢的时候看着像没点上——正是这一轮要治的那个症状。"""
    body = _ops_body()
    for fn in ["function put(kind", "function putText(kind", "function putNote(value"]:
        seg = body.split(fn, 1)[1].split("\nfunction ", 1)[0]
        assert "return api(" in seg, f"{fn} 没 return 那条 promise：忙态会假绿"
    # 每一个 busyRun 的回调里必须有一条 return；少一条就是那一枚又在"自己觉得自己完成了"
    for piece in body.split("busyRun(")[1:]:
        if not piece[:1].isalpha():
            continue   # 注释里提到这个名字的两处不算调用
        assert "return " in piece[:240], f"busyRun 那一趟没把请求递回去：{piece[:60]}"
    assert body.count("busyRun(") >= 12, "写口少了：这一轮该被置灰的提交一次都没落下"


def test_点左栏那条只出那一张卡():
    """一栏一屏（站长 10-21 拍甲）。改这一条的实测底数是 `docs/design/后台布局-量数-20261021/`：
    配置屏 4.71 屏、卡片模板屏 14.15 屏——点「首屏 Tips」要先把两张图片卡滚过去才碰到它。
    以前那一版只是把那张卡滚到顶上（`scrollIntoView`），整组还是摊着；现在把它藏到只剩一张。

    反面两条都撞过：① 整页查 `[data-key=…]` 会先撞见左栏自己那枚按钮（它也带 data-key），
    于是拿高 32px 的导航按钮当落点（现网读数：点「逐日」顶在视口下方 362px）；
    ② 那一张卡不在的时候（某一格没读出来、或新页配旧后端）还把其余四张一起藏掉＝主区全白。"""
    body = _ops_body()
    assert "function focusKey(key)" in body and "function showKey(key)" in body
    assert 'document.querySelectorAll(\'#main .card[data-key]\')' in body, "藏卡没限定在主区：会连左栏那枚按钮一起选中"
    assert "querySelector('[data-key=\"" not in body, "留着整页查那一句，等于把 bug 留在原地"
    assert "if (NAVKEYS[k]) all[j].classList.toggle('hidden', k !== key);" in body, \
        "藏的不是'左栏那 14 条各自那张卡'：卡片模板那一栏的 20 行会被这一刀一起藏光"
    assert "if (!hit) return;" in body, "那一张卡不在了还把整栏藏光：主区一片空白"
    assert "scrollIntoView" not in body, "还留着滚过去：一栏一屏之后没有'滚到那一张'这回事"
    assert "window.scrollTo(0, 0);" in body
    for fn in ["render(state)", "renderStats(d)", "renderTemplates(d, flash)"]:
        seg = body.split("function " + fn, 1)[1].split("\nfunction ", 1)[0]
        assert "repaintFocus();" in seg, f"{fn} 重画完没补藏卡：卡片是新建的，hidden 不会自己长回来"


def test_滚动不再改高亮切栏也不许留空白():
    """滚动跟随（scroll-spy）是为"整组摊在一列"那版配的：滚到哪张卡就把左栏那一条挪过去。
    一栏一屏之后它没有存在理由了，而且会跟刚点那一条抢高亮（现网撞过：点「来源黑名单」，
    落位之后亮的是别栏那条）。这一条钉的是**撤净**——不留半个监听器，也不留 navLock 那三行。

    另一头是甲带来的新洞：顶部那枚「图麦笔记」只 showView('stats')，手上那把 FOCUS 可能是
    配置栏的 key ⇒ 数据栏八张全被藏掉、回来一片空白。所以切栏要退回那一栏第一条。"""
    body = _ops_body()
    for gone in ["spyNav", "navLock", "VIEWS", "addEventListener('scroll'"]:
        assert gone not in body, f"跟随那一套没撤净：还留着 {gone}"
    assert "showKey(VIEW_FIRST[v]);" in body, "切栏没退回那一栏第一条：从图麦克那屏回来是空白"
    assert "if (!VIEW_FIRST[it.view]) VIEW_FIRST[it.view] = it.key;" in body
    assert "$('swSelf').addEventListener('click', function () { setProduct('self'); showView('stats'); });" in body, \
        "那枚直接绕开 showView 的话，上面两条一起失效"


def test_卡片模板那一栏默认折叠一次只开一套():
    """这一栏 20 套全摊开实测 14.15 屏（`docs/design/后台布局-量数-20261021/现网-量数.txt`，
    一张套卡 640px 上下）。拍定的甲是"20 套先只出一列名＋状态，点一套才展开预览与配方"。
    四条都得钉住，少一条的症状各不相同：
    ① 一次只开一套 ⇒ 两套并排会把彼此顶出屏；② 回执那行自动展开 ⇒ 不然"已写入"那句藏在
    折叠体里，屏上看着像点下去没反应（本机 10-15 真点撞过同一类）；③ 只翻 hidden 不重建 ⇒
    重建会把刚打没保存的字换掉；④ 点开才画预览 ⇒ 折叠态跑二十遍配方是白干。"""
    body = _ops_body()
    assert "var TPL_OPEN = null;" in body
    assert "el('div', 'tplbody')" in body and "b.classList.toggle('hidden', !open);" in body
    assert "el('button', 'mini ghost tpltoggle', '展开这一套')" in body
    assert "t.textContent = open ? '收起这一套' : '展开这一套';" in body
    assert "t.setAttribute('aria-expanded', open ? 'true' : 'false');" in body
    # 一次只开一套：点开这一枚时把其余各行一起过一遍 tplFold
    assert "for (var i = 0; i < cs.length; i++) tplFold(cs[i], open && cs[i].dataset.id === String(r.id));" in body, \
        "只改自己那一行＝两套同时摊着"
    assert "TPL_OPEN = String(flash.id);" in body, "回执落在折叠体里＝屏上看不到那句'已写入'"
    assert "box._painted = true;" in body and "if (!box || box._painted) return;" in body, \
        "预览没等点开才画（或那层「画过了」的守卫没了）：一进来就跑二十套配方"
    assert "card.appendChild(previewBox" not in body, "预览挂在卡上而不是折叠体里＝折叠折不掉它"
    # 折叠只作用在这一栏：模板行带 data-id、不带 data-key，一栏一屏那一刀扫的是 [data-key]
    assert "card.dataset.id = r.id;" in body and "card.dataset.key = 'tpl:" not in body


def test_换窗口重画不许丢掉滚动位置():
    """实测读数：点「总览」之后 y 从 2816 跳到 3367（换了 30 天窗口，整屏重画把位置丢了），
    人要重新找刚才那一张。读数量到的"落点"也靠这一条才站得住。"""
    body = _ops_body()
    assert "function keepScroll(fn)" in body
    assert body.count("keepScroll(function") >= 5, "有几处重画没垫这一层：读数里的落点会自己飘"
    for name in ["renderStats(d)", "renderTemplates(d, flash)", "renderBlocklist(d, flash)"]:
        assert f"keepScroll(function () {{ {name}; }}" in body, f"{name} 那一趟重画没保住位置"


def test_没保存的草稿要留得住也要看得见():
    """整卡重画（发布成功之后 refresh）会把 textarea／输入框连人带字一起重建：
    刚打的字没了，而且屏上不说。所以草稿按"卡片+字段"存着，重建后填回去，标题上挂一句角标。"""
    body = _ops_body()
    assert "var DRAFTS = {};" in body and "function bindField(" in body
    assert "node.setAttribute('data-server', String(serverValue));" in body, "没有服务器那份值就分不清什么算改过"
    assert "card._dirty.textContent = n ? ('有 ' + n + ' 处没保存') : '';" in body
    assert body.count("addDirtyChip(head);") >= 3, "带输入格的卡有一张没挂角标"
    assert body.count("resyncDirty();") >= 2, "重画完没重算角标：字还在、那句'有 N 处没保存'没了（实测撞过）"
    assert "window.addEventListener('beforeunload'" in body, "带着草稿直接关页＝静默丢字"


def test_键盘和读屏那一套语义():
    """左栏那 14 条原来是 `<s>`／`<div>`：Tab 一次都进不去（实测可聚焦 0/14），
    读屏也念不出"现在在哪一栏"。改真 button 之后是 14/14＋aria-current 1。"""
    body = _ops_body()
    assert ":focus-visible { outline:2px solid var(--clay)" in body
    assert "el('button', 'navitem', it.label)" in body and "b.type = 'button'" in body
    assert "setAttribute('aria-current', 'true')" in body and "removeAttribute('aria-current')" in body
    assert 'aria-pressed="true"' in body and 'aria-pressed="false"' in body
    assert "$('swSelf').setAttribute('aria-pressed'" in body, "切完产品那两枚的状态得跟着改，不然 aria-pressed 是假话"


def test_窄屏那一档触摸目标与横滚壳():
    """390 那一档实测：最矮的可点是 30px，六列那张宽表伸出容器；历史那一排在有 4 张以上时伸出视口 33px。
    改法只有"加滚动壳／抬到 44px"这两种，不换结构：宽表还是那张表，历史还是那一排。"""
    body = _ops_body()
    seg = body.split("@media (max-width:720px)", 1)[1]
    assert "min-height:44px" in seg, "窄屏那档没抬触摸目标"
    assert ".tw { overflow-x:auto" in body and "table.dt.wide { min-width:560px }" in body
    assert ".swatches { display:flex; gap:10px; margin-top:10px; overflow-x:auto" in body, \
        "历史那一排没横滚壳：四条以上就把整页顶出视口"
    assert "flex:none; width:90px; box-sizing:border-box" in body, \
        "每一枚没定宽：那句'再点一次'和长备注会把相邻那几枚顶得往右跳"
    # 那句确认话术常驻一行，只换 visibility：跟着 display 出现／消失会把整排往下顶，一点就抖
    assert ".swatch .ask {" in body and "visibility:hidden" in body and ".swatch.arm .ask { visibility:visible }" in body
    assert "ask.classList" not in body, "又在用 hidden 类切那句话＝一点抖一下"


def test_小字那两档的对比度下限():
    """实测压在纸底上：组标题与 .note 那两档 2.2:1／4.39:1，11–12px 的字在屏幕阅读器之外
    也读不动（WCAG 正文要求 4.5:1）。并到 --muted:#5f636c 之后两档都是 5.25:1。"""
    body = _ops_body()
    assert "--muted:#5f636c" in body, "小字那档的底色被改回去或改浅了"
    assert ":#a2a49c" not in body, "旧的那个浅灰又回到声明里了（实测 2.2:1）"
