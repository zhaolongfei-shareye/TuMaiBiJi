"""后台「数据」那一栏的算法（规格 `docs/规格-后台数据分析这一栏.md` §3 的 A 档）。

三条写在最前面的口径，改任何一条都要同步改规格，别让两边各说一套：

1. **`preset` 不计入"新增笔记"**。§8.232 那批"新用户默认给一篇"会让每个新用户自动多一行笔记，
   不剔除的话这条曲线就是用户数的影子，是个假数（`services/preset_note.py` 里那个常量是唯一出处）。
2. **只出聚合数，零条用户内容**。这一栏不许出现标题、摘要、正文、搜索词，也不许出"谁转存了谁的哪篇"
   那种能指到具体人的行——两个产品的用户数据不许同表互查（方案 §6 红线 2、3）。
3. **日期一律按库里那个时区（UTC naive）分桶**，`tz` 那一键就是给页面上那句"按 UTC 分日"用的。
   出口那里 `core/timefmt.py` 补 `Z` 是给小程序显示用的，这里不去"顺手换算成北京时间"：
   后台一旦自己换算，就会和小程序里那串日期变成两套日子，那是 09-22 那次时区 bug 的同类坑。
"""
from sqlalchemy import case, func, select

from app.models.invitation import Invitation
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.share import Share
from app.models.user import User
from app.services.preset_note import PRESET_SOURCE_TYPE

DAYS_DEFAULT = 14
DAYS_MAX = 90


def _per_day(db, days: int) -> list[dict]:
    """最近 N 天（含今天）的：新增笔记（剔除预置）、新账号、转存。缺的那一天补 0，
    否则"没数据"与"那天没人来"在页面上长得一样。

    ⚠ 转存那一格**不能用 `imported_from IS NOT NULL`**。SQLAlchemy 的 `JSON` 列默认
    `none_as_null=False`，Python 的 `None` 存进去是 JSON 文本 `null` 而不是 SQL NULL，
    于是那句对所有行都成立——症状是"转存量等于笔记总量"，一个看起来很像成功数的假数。
    这里用 `json_extract(..., '$')` 判：SQL NULL、文本 `null` 两种"没有来源"都回 NULL，
    真来源对象才回非空。两种形状在 `tests/test_admin_fusion.py` 里各钉了一条。
    """
    imported = func.json_extract(Note.imported_from, "$").is_not(None)
    day = func.date(Note.created_at)
    rows = db.execute(
        select(day.label("d"), func.count(),
               func.sum(case((imported, 1), else_=0)))
        .where(Note.source_type != PRESET_SOURCE_TYPE)
        .group_by("d")
    ).all()
    by_day = {str(r[0]): (int(r[1] or 0), int(r[2] or 0)) for r in rows}

    from datetime import date, timedelta, timezone

    today = datetime_today()
    since = today - timedelta(days=days - 1)
    out = []
    for i in range(days):
        d = (since + timedelta(days=i)).isoformat()
        notes, imports = by_day.get(d, (0, 0))
        out.append({"date": d, "notes": notes, "imports": imports})

    uday = func.date(User.created_at)
    urows = dict(
        (str(r[0]), int(r[1]))
        for r in db.execute(
            select(uday.label("d"), func.count()).group_by("d")
        ).all()
    )
    for item in out:
        item["accounts"] = urows.get(item["date"], 0)
    return out


def datetime_today():
    """库里存的是 UTC naive（`server_default=func.now()` 在 SQLite 上就是 UTC），
    所以"今天"也必须按 UTC 取，别用机器的本地日期。"""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).date()


def source_breakdown(db) -> list[dict]:
    """六个取值都是代码里写死的（`manual`/`screenshot`/`share_import`/`preset`/
    `wechat_article`/`web_article`），微信公众号与网页分得开是这栏有用与否的关键。"""
    rows = db.execute(
        select(Note.source_type, func.count()).group_by(Note.source_type)
        .order_by(func.count().desc())
    ).all()
    return [{"source_type": str(t or "unknown"), "count": int(c)} for t, c in rows]


def template_ranking(db) -> list[dict]:
    """模板热度榜。`is_current` 那一档必须带上：一篇历史卡片全都数进去的话，
    "哪套模板在被用"就变成"哪套模板被试过"。不带码那一档（`no_qr`）单列，
    它是发微信以外平台用的，合在一起会把两条出图路看成一条例。"""
    rows = db.execute(
        select(NoteCard.tpl, func.count(),
               func.sum(case((NoteCard.is_current.is_(True), 1), else_=0)),
               func.sum(case((NoteCard.no_qr.is_(True), 1), else_=0)))
        .group_by(NoteCard.tpl)
        .order_by(func.count().desc())
    ).all()
    return [
        {
            "tpl": str(t or "unknown"),
            "total": int(c),
            "current": int(cur or 0),
            "without_qr": int(nq or 0),
        }
        for t, c, cur, nq in rows
    ]


def invitation_ledger(db) -> dict:
    """邀请对账。**两个数一起回、故意不替操作者判等**：台账 rewards 与 users.quota_bonus 之和
    在今天应当相等，不等说明有一笔奖励落到了别的路上；但"差多少算异常"没有公开标准，
    把判断写进代码就等于替站长拍了一条他没拍的口径。"""
    granted = db.execute(select(func.coalesce(func.sum(Invitation.reward), 0))).scalar()
    held = db.execute(select(func.coalesce(func.sum(User.quota_bonus), 0))).scalar()
    count = db.execute(select(func.count()).select_from(Invitation)).scalar()
    return {"invitations": int(count), "rewards_granted": int(granted or 0),
            "quota_bonus_held": int(held or 0)}


def shares_overview(db) -> dict:
    """分享这一栏：建了多少张、还活着几张、被转存走多少篇。
    "活着的"由 `is_active` 说话（撤回口把它置 0），不靠 `expires_at` 现算——
    过期但还没被清掉的那一批在库里仍然是 `is_active=1`，两种算法会给出两个数。"""
    total = db.execute(select(func.count()).select_from(Share)).scalar()
    active = db.execute(
        select(func.count()).select_from(Share).where(Share.is_active.is_(True))
    ).scalar()
    return {"created": int(total or 0), "active": int(active or 0)}


def overview(db, days: int = DAYS_DEFAULT) -> dict:
    """这一栏的全部数一次回。零新列、零迁移、只读——所以它不需要事务，也不写任何东西。"""
    days = max(1, min(int(days or DAYS_DEFAULT), DAYS_MAX))
    total_notes = db.execute(
        select(func.count()).select_from(Note).where(Note.source_type != PRESET_SOURCE_TYPE)
    ).scalar()
    preset_notes = db.execute(
        select(func.count()).select_from(Note).where(Note.source_type == PRESET_SOURCE_TYPE)
    ).scalar()
    return {
        "window_days": days,
        "tz": "UTC",
        "totals": {
            "notes": int(total_notes or 0),
            "preset_notes_excluded": int(preset_notes or 0),
            "accounts": int(db.execute(select(func.count()).select_from(User)).scalar() or 0),
        },
        "per_day": _per_day(db, days),
        "sources": source_breakdown(db),
        "templates": template_ranking(db),
        "invitations": invitation_ledger(db),
        "shares": shares_overview(db),
    }
