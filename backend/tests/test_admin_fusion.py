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

from app.core.admin_access import create_session_token
from app.core.auth import _create_token
from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
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


# ---------------- ④ 那一页真把「数据」渲染出来了 ----------------

def test_后台那一页有数据那一组格子():
    """静态钉页面：接口对了、页面少一行调用，屏上仍是只有图与 Tips 那一屏，而且零报错。
    与 `test_mp_assets_admin` 里那条文案栏的钉子同一个理由。"""
    src = (Path(__file__).resolve().parents[1] / "app/api/routes/ops_page.py").read_text(encoding="utf-8")
    body = src.split("_PAGE", 1)[1]
    assert "renderStats" in body and "loadStats" in body
    assert "api/admin/stats/overview" in body, "取数那句没写，或写成了别的口"
    assert "refresh()" in body and "Promise.all([loadStats(), loadTemplates()])" in body, \
        "登录进来那一趟没顺手拉数据（10-15 起三屏一起拉，这句就是那条调用）"
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
    assert "keys = ['overview', 'perday', 'sources', 'templates', 'invites', 'shares']" in body
    # 图麦克那枚不许被做成"看着能点"：默认灰、且页面里写着为什么灰
    assert 'class="off" id="swOther"' in body and "$('swNote').textContent" in body
