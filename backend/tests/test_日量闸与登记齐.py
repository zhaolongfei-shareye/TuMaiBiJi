"""10-25 第八轮审计 M33／M32／M18／M7 那四刀的守门用例（纯本地，不碰现网、不出网）。

四件事各自钉一条，都在同一个文件里因为它们说的是同一句话：**"这一趟花了多少"必须有人在对账**。

- M33 日量闸：`daily_budget.charge` 真拦得住第 N+1 条、话里带档位；`SEC_CHECK_ENABLED=False`
  时一个字都不记（测试环境要的是"根本不出网"那条不变量，记了会把额度打光、症状是一片与本条
  无关的用例回 429）。
- M33 登记齐：`app/api/routes/*.py` 里**每一只**做内容送检的函数都必须在同一只函数里记一笔
  `sec_check`，每一只往 `app.tasks.ingest_tasks.*` 排队提炼的口都必须记一笔 `extract`。
  这一把不点名——点名的注册表就是 M8 那条的成因（"挂没挂靠一份手抄名单，新长的口不会露头"）。
  名单方向硬写：**漏记即红**，多记（有 charge 没送检）只念。
- M32：两张表的 `object_key` 索引在模型里声明了、而且**新迁移里真建**（只在模型里写 index=True
  而忘记迁移＝现网永远全表扫，而这件事在屏上看不出来）。
- M18：交给云函数的 `text` 里不许出现 `参考标题：`（拼标题只有函数那一处），长文那条的截断标记
  必须在尾巴上——今天它被函数那一刀挤掉了，所以这一条同时钉"别再往回改"。
- M7：转存回体里那三个数（`images_kept`／`images_failed`／`images_skipped`）必须是**整数且有默认值**，
  且整段抄图失败时 `images_failed` 按原篇张数报，不许报 0（报 0 念出去是一个反的数）。
"""
import ast
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
ROUTES = BACKEND / "app" / "api" / "routes"

# 真打一次平台送检的三个入口（`services/wechat.py` 的门面）。新增第四个入口的名字时，
# 这一行要跟着加——加在这一行是**收紧**尺子（新口一进来就必须记账），不会造出假绿。
SEC_CALLS = {"enforce_text_safety", "check_image", "enforce_image_safety", "check_text"}
CHARGE_KINDS = {"sec_check": "KIND_SEC_CHECK", "extract": "KIND_EXTRACT"}


def _funcs(tree):
    return {n.name: n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}


def _names_used(node):
    """这一只函数里**出现**过的所有名字（被调用、被当参数递出去、被读属性都算）。

    为什么不是"只数调用"：`asyncio.to_thread(daily_budget.charge, …)` 里 `charge` 与 `check_image`
    都不是 `Call.func` 而是参数，只数调用就会把 M2 那一刀改出来的写法读成"这里没送检、也没记账"⇒
    尺子对今天的代码没有区分度（本条第一趟就是这么漏掉 `check_screenshot` 的，改正后重跑）。
    """
    out = set()
    for sub in ast.walk(node):
        if isinstance(sub, ast.Name):
            out.add(sub.id)
        elif isinstance(sub, ast.Attribute):
            out.add(sub.attr)
    return out


def _charge_kinds_in(node):
    """这一只函数里点到过哪一档日量（`daily_budget.charge` 与 `KIND_*` 同场出现才算，两种写法都认）。"""
    used = _names_used(node)
    if "charge" not in used:
        return set()
    return {a for a in used if a.startswith("KIND_")}


def _sec_hits(node):
    return _names_used(node) & SEC_CALLS


def _enqueue_targets(raw, fn):
    seg = ast.get_source_segment(raw, fn) or ""
    return re.findall(r'"app\.tasks\.ingest_tasks\.([a-z_]+)"', seg)


def test_送检与提炼的每一只口都在记日量账():
    """枚举，不点名：漏记即红（M33；形状照 `test_写口限流齐不齐.py` 那一把）。"""
    missing = []
    for path in sorted(ROUTES.glob("*.py")):
        raw = path.read_text(encoding="utf-8")
        tree = ast.parse(raw)
        for name, fn in _funcs(tree).items():
            charges = _charge_kinds_in(fn)
            where = f"{path.name}:{name}"
            if _sec_hits(fn) and "KIND_SEC_CHECK" not in charges:
                missing.append(f"{where} 送检却没记 sec_check")
            targets = _enqueue_targets(raw, fn)
            if targets and "KIND_EXTRACT" not in charges:
                missing.append(f"{where} 排队 {targets} 却没记 extract")
    assert not missing, "日量闸漏记：\n" + "\n".join(missing)


def test_记档只许两支名字():
    from app.services import daily_budget

    assert daily_budget.KINDS == ("extract", "sec_check")
    # 屏上那两句必须都带档位与"明天"：只说"用完了"等于没说限制是多少。
    for kind in daily_budget.KINDS:
        s = daily_budget._SENTENCE[kind].format(limit=7)
        assert "7" in s and "明天" in s, kind


def test_额度用满之后当场拒并念出档位(monkeypatch, tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.db.database import Base
    import app.models  # noqa: F401  注册全部模型（漏挂就建不出表，见 models/__init__.py 文件头）
    from app.models.daily_usage import DailyUsage
    from app.services import daily_budget

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    DailyUsage.__table__.create(engine)
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(daily_budget, "SessionLocal", Session)
    monkeypatch.setattr(daily_budget.settings, "EXTRACT_DAILY_LIMIT", 3)
    monkeypatch.setattr(daily_budget.settings, "SEC_CHECK_ENABLED", True)

    got = [daily_budget.charge("u1", daily_budget.KIND_EXTRACT) for _ in range(4)]
    assert [b.ok for b in got] == [True, True, True, False]
    assert got[3].used == 4 and got[3].left == 0
    assert "每天 3 条" in got[3].message

    # 换一个人不许受影响（这一档是"每人每天"，不是全站一天）
    assert daily_budget.charge("u2", daily_budget.KIND_EXTRACT).ok is True

    # times=2 一次加二：截图那一批量每张都真出一趟网
    b = daily_budget.charge("u3", daily_budget.KIND_EXTRACT, 2)
    assert b.ok is True and b.used == 2


def test_送检开关关着时一个字都不记(monkeypatch, tmp_path):
    """conftest 全局把 `SEC_CHECK_ENABLED` 设成 false：这一档不许记账，也不许拦。

    反向的坑写明白：如果关了还照记，跑一批送检用例就会把某个人的 200 次打光，
    红了以后所有人去查的是"提炼怎么 429 了"，而改动是这条日量闸自己带进来的。
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.models.daily_usage import DailyUsage
    from app.services import daily_budget

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    DailyUsage.__table__.create(engine)
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(daily_budget, "SessionLocal", Session)
    monkeypatch.setattr(daily_budget.settings, "SEC_CHECK_ENABLED", False)
    monkeypatch.setattr(daily_budget.settings, "SEC_CHECK_DAILY_LIMIT", 1)

    for _ in range(5):
        assert daily_budget.charge("u1", daily_budget.KIND_SEC_CHECK).ok is True
    db = Session()
    try:
        assert db.query(DailyUsage).count() == 0          # 没出网＝没花费
    finally:
        db.close()


def test_日量的日子按东八区切():
    from datetime import datetime, timedelta, timezone

    from app.services import daily_budget

    day = daily_budget.today()
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", day)
    # 与 UTC 同日时差的那一段必须念 +8 那一天：用 UTC 会把每天的口子开在早上 8 点（人在用的时段）。
    as8 = datetime.now(timezone.utc).astimezone(daily_budget.DAILY_TZ)
    assert day == as8.strftime("%Y-%m-%d")
    assert daily_budget.DAILY_TZ.utcoffset(None) == timedelta(hours=8)


def test_object_key两枚索引声明与迁移都在():
    """只在模型里写 `index=True`、忘了那条迁移＝现网永远全表扫（M32 的成因正是这一型）。"""
    from app.db.database import Base
    import app.models  # noqa: F401

    for table, idx in (("assets", "ix_assets_object_key"),
                       ("note_cards", "ix_note_cards_object_key")):
        names = {i.name for i in Base.metadata.tables[table].indexes}
        assert idx in names, (table, sorted(names))

    mig = BACKEND / "alembic" / "versions" / "b4e7c2a1d0f8_object_key_indexes.py"
    text = mig.read_text(encoding="utf-8")
    assert "ix_assets_object_key" in text and "ix_note_cards_object_key" in text
    assert "def downgrade" in text, "没有 downgrade 的迁移不许上现网"


def test_交给云函数的正文不许再拼一遍标题():
    """M18：`参考标题：` 只由函数那一处拼；截断标记留在尾巴上才送得出去。"""
    from app.services import llm

    short = llm._build_user_content("正文" * 10, "这里是一个标题")
    assert "参考标题" not in short, "两头各拼一次＝模型每次多吃一行重复标题"
    assert short == "正文" * 10

    long = llm._build_user_content("字" * 20000, "标题")
    assert long.startswith("字"), long[:10]
    assert "内容过长，已截断" in long, "标记被挤掉＝屏上永远看不到这篇是从中间掐断的"
    # 截到 12000 再加标记：留出的那点余量是给函数那一头拼标题用的（它先切后拼，所以标记这次送得出去）
    assert 12000 < len(long) <= 12040, len(long)


def test_转存回体那三个数是整数且有默认():
    from app.api.routes.notes import NoteFromShareOut

    fields = NoteFromShareOut.model_fields
    for k in ("images_kept", "images_failed", "images_skipped"):
        assert k in fields and fields[k].default == 0, k
    # 纯前向：老包读不到这三栏也不能因此少任何一个原有字段（详情那一份必须还在）
    from app.api.routes.notes import NoteDetail

    assert set(NoteDetail.model_fields) <= set(fields)


def test_抄图整段失败时报的是原篇张数而不是零(monkeypatch):
    """M7 的屏上那一半靠这三个数说话；整段崩了却报 0＝一句反的数。"""
    from app.api.routes import notes as notes_route

    class Boom:
        def copy_for_import(self, db, note, src):
            raise RuntimeError("网关挂了")

    import app.services.note_images as note_images

    monkeypatch.setattr(note_images, "copy_for_import", Boom().copy_for_import)

    counted = {"n": 5}

    class Q:
        def __init__(self, n):
            self.n = n

        def filter(self, *a, **k):
            return self

        def count(self):
            return self.n

    class DB:
        def query(self, *a, **k):
            return Q(counted["n"])

    kept, failed, skipped = notes_route._copy_share_images(DB(), type("N", (), {"id": 1})(), 7)
    assert kept == 0 and failed == counted["n"] and skipped == 0


def test_m20_迁移文件头不许有两枚编号():
    """`alembic history` 取 docstring 当 message，多那一行就把假编号念出来（M20）。"""
    for path in (BACKEND / "alembic" / "versions").glob("*.py"):
        head = path.read_text(encoding="utf-8")[:900]
        ids = re.findall(r"^Revision ID:\s*(\w+)", head, re.M)
        real = re.search(r"^revision: str = '(\w+)'", head, re.M)
        assert len(ids) <= 1, (path.name, ids)
        if ids and real:
            assert ids[0] == real.group(1), (path.name, ids, real.group(1))


def test_测试件不许留非法转义():
    """M29：那段说明里的 `\\/` 曾是非法转义，pytest 每趟冒一条 SyntaxWarning，
    而 `deploy.sh:32` 那道语法闸只编译 `app`——警告从来没人看。"""
    import warnings

    for path in (BACKEND / "tests").glob("*.py"):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        bad = [w for w in caught if issubclass(w.category, SyntaxWarning)]
        assert not bad, (path.name, [str(w.message) for w in bad])
