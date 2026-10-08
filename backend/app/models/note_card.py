"""一篇笔记当前的那张卡片——留档从这台手机搬到服务器（2.0.1 P0）。

为什么必须有这张表：卡片成品图**在 2.0.1 之前一张都没上过服务器**，它只是本机
`wx.setStorageSync('cardLog')` 里的一条账 + `${USER_DATA_PATH}/cards/` 下的一个 jpg。
系统清缓存、删小程序重装、换手机，图先没、账常留着，而界面上的判据是"图在不在"，
于是那一格退回"从没生成过"——不报错、不留痕。站长 10-08 把这定性成必须解决的严重问题。
成因与读数量在 `docs/方案-卡片留档上服务端.md` §一 与 PRD §8.148。

三条口径写在这里，不写下来下一个人一定会改错：

1. **一篇只留一张**（10-03 站长定的硬规则，这次落到服务端索引上）。换模板要先删旧的那张，
   所以"当前"这一栏是唯一约束；历史行留着（`is_current=0`），照 `shares` 撤掉留档那条同一路子。
2. **`origin` 是给用户看的那句说明的数据来源，不是审计摆设**。「这是按你当年选的模板重新出的」
   和「这张是你刚生成的」在界面上必须不一样，靠的就是这一栏；写错一档就等于悄悄换了人家的图。
3. **卡片对象计入全站配额，但单独一项 SUM**，不与笔记配图混成同一个数——「我的」页那行脚注
   现在说的是配图那 5GB 池子，口径不许悄悄扩（`routes/cards.py` 顶部那条注释跟着这条）。
"""
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, or_, text
from sqlalchemy.sql import func

from app.db.database import Base

# 一张卡片的来源。四个取值都必须有归属，界面对应的话术各不相同（见 routes/cards.py）。
ORIGIN_LIVE = "live"                        # 用户当场生成的
ORIGIN_BACKFILLED = "backfilled"            # 存量补传：图还在本机，只是从没上过云
ORIGIN_RE_RENDERED = "re-rendered"          # 账在图没了 → 按台账里那套模板重新渲的
ORIGIN_FROM_SHARE_SNAPSHOT = "from-share-snapshot"  # 连账都没了 → 按 shares 那份快照重出的
CARD_ORIGINS = (ORIGIN_LIVE, ORIGIN_BACKFILLED, ORIGIN_RE_RENDERED, ORIGIN_FROM_SHARE_SNAPSHOT)

# 这里原来有一栏 `CARD_ACCOUNT_BYTES = 200 * 1024`——站长 10-08 定的"没量到实测之前，
# 一张卡片按 ≤200KB 上界**估算**入账"。S2 起每一条登记都带真实 `file_size`，估算的替身
# 就该退场：配额现在 SUM 两张表的真字节（`routes/assets.py:_sum_bytes`，10-09 审计）。
# 留着一个没有消费者的口径常量，等于给下一个人留第二份真相。
# ⚠ 挡人的那道线在 routes/cards.py（云开发单文件 20MB），**从来不是**这个数，也别再拿它当闸门。


class NoteCard(Base):
    __tablename__ = "note_cards"

    __table_args__ = (
        # "一篇只留一张"这条 10-03 只是界面上的规矩，今天第一次落在库上。
        # 部分唯一索引（只约束还当前的行）与 `shares.ux_shares_one_active_per_note` 同一做法：
        # 注释管不住并发，索引管得住——两个请求同时进来各查一遍"有没有"，就能给同一篇建两行。
        Index(
            "ux_note_cards_one_current_per_note",
            "note_id",
            unique=True,
            sqlite_where=text("is_current = 1"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    # 与 Asset.user_id 同型（String(100)）：这一路的归属查法全是 `str(user.id)`，别在这换型。
    user_id = Column(String(100), nullable=False, index=True)
    # 故意不写 ForeignKey("notes.id")：SQLite 上 ALTER TABLE 加不了外键，声明了就和
    # `tests/test_quota_and_invite.py` 那条"alembic 升级后的库和模型一字不差"永远对不上
    # （`models/asset.py` 那段记的是同一个坑）。删笔记那一路本来就显式清这批行。
    note_id = Column(Integer, nullable=False, index=True)
    object_key = Column(String(500), nullable=False)  # 云开发 fileID（cloud://…），不是 S3 key
    # 哪套模板、当时带没带二维码——重渲那一档全靠这两栏，缺一样就渲不回同一张。
    tpl = Column(String(50), nullable=False)
    no_qr = Column(Boolean, nullable=False, default=False)
    file_size = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    origin = Column(String(24), nullable=False, default=ORIGIN_LIVE)
    is_current = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


def current():
    """只认"当前那一张"。历史行（is_current=0 或老迁移留下的 NULL）都不算。

    NULL 必须算进来，理由与 `Asset.not_failed()` 那条一模一样：`add_column` 那种迁移给老行
    留下的正是 NULL，而 `NULL = 1` 在 SQL 里结果是 NULL（也就是不过）——照 `is_current == 1`
    写，将来真有一行被迁移留在 NULL 就会**从界面上凭空消失但仍占着配额**。
    """
    return or_(NoteCard.is_current.is_(None), NoteCard.is_current != False)  # noqa: E712
