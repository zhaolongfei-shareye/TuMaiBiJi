"""后台「卡片模板」那一栏的读写（方案 docs/方案-cn后台资产管理.md 的 P1）。

**这一栏只改元数据**：中英文名、排序、最低版本号、上架／下架。四样都是"一套模板怎么被排、
什么时候被拿到"，改完 `GET /api/poster/templates/` 的回体跟着变，客户端下一次冷启生效。

`recipe` 那一栏**读得出、改不了**。配方是在画布上画东西的声明，在线编辑配方（P2）是唯一一个
"不发版就能改画面"的口子，也正是 `api/routes/poster_templates.py:3-4` 那条注释挡着的东西——
开不开由站长拍，不在这一栏里顺手做。加一套**新**模板走的是纯数据那条路
（`seed/poster_extra/` 放一份 JSON → `docs/工具/跑新模板流程.sh` → 重新生成种子 → 开闸部署），
见 `docs/流程-加一套卡片模板.md`，这条路一行客户端代码都不碰。

`group_key` 同样只读：那两个分组名的出处是客户端 `utils/poster.js` 的 `TEMPLATE_GROUPS`，
后台改它等于让「卡片模板」那一页的分栏去猜一个客户端不认识的词。
"""
import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import UserError
from app.models.note_card import NoteCard
from app.models.poster_template import (
    STATUS_ARCHIVED,
    STATUS_DRAFT,
    STATUS_LIVE,
    STATUSES,
    PosterTemplate,
)

# 与小程序 utils/appInfo.js 那个常量同形（三段点分）。客户端是按字符串比较版本号的，
# 所以这里只钉形状、不钉大小写也不做数值比较——多一套比较法就是多一处会不同步的真相。
APP_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")

LABEL_MAX = 40
LABEL_EN_MAX = 60
SORT_MIN, SORT_MAX = 0, 9999


def describe(db: Session, row: PosterTemplate) -> dict:
    """一行的全部字段。`used`／`used_current` 是"这套在被用还是只被试过"：
    数的是 `note_cards` 里按 `tpl` 记的行，与后台「数据」那一栏的模板榜同一个出处、同一句口径。"""
    tpl = row.template_id
    used = db.execute(
        select(func.count()).select_from(NoteCard).where(NoteCard.tpl == tpl)
    ).scalar()
    used_current = db.execute(
        select(func.count()).select_from(NoteCard)
        .where(NoteCard.tpl == tpl, NoteCard.is_current.is_(True))
    ).scalar()
    return {
        "id": row.id,
        "template_id": tpl,
        "label": row.label,
        "label_en": row.label_en,
        "group_key": row.group_key,
        "sort_order": row.sort_order,
        "status": row.status,
        "min_app_version": row.min_app_version,
        "content_hash": row.content_hash,
        "note": row.note,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "used": int(used or 0),
        "used_current": int(used_current or 0),
        # 配方原样带出去，但界面上只读：不给它任何输入框，也就没有"改了一半"那种状态。
        "recipe": row.recipe,
    }


def list_rows(db: Session) -> list:
    rows = db.query(PosterTemplate).order_by(
        PosterTemplate.sort_order, PosterTemplate.id
    ).all()
    return [describe(db, r) for r in rows]


def _get(db: Session, row_id: int) -> PosterTemplate:
    row = db.get(PosterTemplate, row_id)
    if row is None:
        raise UserError(f"没有 id={row_id} 这一行模板")
    return row


def _clean_label(field: str, value: str, limit: int) -> str:
    t = (value or "").strip()
    if not t:
        raise UserError(f"{field} 不能是空的")
    if len(t) > limit:
        raise UserError(f"{field} 超了 {limit} 字：{t[:12]}…")
    return t


def update(db: Session, row_id: int, *, label=None, label_en=None, sort_order=None,
           min_app_version=None, status=None) -> PosterTemplate:
    """一个口改四样元数据＋上下架。**没给的字段一个字不动**（None 就是"这次不改它"）。

    先全部校验、后一次性落笔：上下架与元数据撞在同一次提交里时，要么一起成、
    要么一起不作数。半份生效的形态是"名字改了、状态没改"，界面上读出来是
    "我刚才那一下到底点中了没有"——所以不靠 rollback 兜，写成不可能半份。
    """
    if all(v is None for v in (label, label_en, sort_order, min_app_version, status)):
        raise UserError("这一次什么都没要改")
    row = _get(db, row_id)

    new_label = _clean_label("中文名", label, LABEL_MAX) if label is not None else None
    new_label_en = _clean_label("英文名", label_en, LABEL_EN_MAX) if label_en is not None else None
    if sort_order is not None:
        if not isinstance(sort_order, int) or isinstance(sort_order, bool):
            raise UserError("排序得是个整数")
        if not SORT_MIN <= sort_order <= SORT_MAX:
            raise UserError(f"排序要在 {SORT_MIN}～{SORT_MAX} 之间")
    new_version = None
    if min_app_version is not None:
        new_version = min_app_version.strip()
        if not APP_VERSION_RE.match(new_version):
            raise UserError(f"最低版本号要写成 1.9.26 那样三段点分数字，收到的是「{new_version[:20]}」")
    if status is not None and status not in STATUSES:
        raise UserError(f"状态只认 {'／'.join(STATUSES)}，收到的是「{status}」")
    if status == STATUS_LIVE and row.status != STATUS_LIVE:
        clash = db.execute(
            select(PosterTemplate)
            .where(PosterTemplate.template_id == row.template_id,
                   PosterTemplate.status == STATUS_LIVE,
                   PosterTemplate.id != row.id)
        ).scalars().first()
        if clash is not None:
            # 不自动把那一版归档：归档等于替他决定"旧的那版不再下发了"，
            # 而库里那条部分唯一索引（一个 template_id 只允许一套 live）本来就是拿来挡这个的。
            raise UserError(
                f"这套模板已经有一版在线上（id={clash.id}，hash {clash.content_hash[:8]}）；"
                "先把那一版下架，再上这一版"
            )

    if new_label is not None:
        row.label = new_label
    if new_label_en is not None:
        row.label_en = new_label_en
    if sort_order is not None:
        row.sort_order = sort_order
    if new_version is not None:
        row.min_app_version = new_version
    if status is not None:
        row.status = status  # 重复点同一侧走到这就是原地写回同一个值：幂等，不报错

    db.commit()
    db.refresh(row)
    return row


def status_counts(rows: list) -> dict:
    """给页面上那句"线上几套／草稿几套／已下架几套"用的，从已读出的行里数，不再打一次库。"""
    out = {STATUS_LIVE: 0, STATUS_DRAFT: 0, STATUS_ARCHIVED: 0}
    for r in rows:
        if r["status"] in out:
            out[r["status"]] += 1
    return out
