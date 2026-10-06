from sqlalchemy import Column, Integer, String, Text, DateTime, or_
from sqlalchemy.sql import func
from app.db.database import Base

# 一篇笔记的配图张数。9 与小程序选图上限同值（`create.js` 的 `count: 9`），不是另起一档；
# 这条上限今天第一次落在服务端，公开页露出的张数也认它（routes/shares.py）。
MAX_ASSETS_PER_NOTE = 9


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), nullable=False, index=True)
    # 这两列 2026-10-06（release/2.0 图片这条链路）之前一个都没有：这张表建好之后
    # 全仓零写入，只有注销账号那句 `Asset...delete()` 和两个从没赋过值的
    # `notes.cover_asset_id` / `shares.cover_asset_id` 外键在引用它。
    #
    # 可空是**故意的**：B 链（压缩+直传）比 A 链（提炼建笔记）慢，图先传上来的时候
    # 还没有 note_id，等拿到 note_id 再 bind。所以"有一行但还没归到某篇笔记"是正常态，
    # 不是脏数据——配额统计要把它们算进去（对象已经占空间了），列表接口不能把它们算进任何一篇。
    # 这里**故意不写 ForeignKey("notes.id")**：SQLite 上 ALTER TABLE 加不了外键，声明了就和
    # `tests/test_quota_and_invite.py` 那条"alembic 升级后的库和模型一字不差"永远对不上
    # （之前所有加列的迁移都没敢带 FK，这条是头一次撞）。删笔记那一路本来就显式清这批行
    # （`routes/notes.py:delete_note` 把 file_ids 回给调用方去删对象），外键在这里买不到东西。
    # 顺带：加上它还会和 `notes.cover_asset_id` 组成一个环，pytest 每次开局多一条
    # "Can't sort tables for DROP" 的警告。
    note_id = Column(Integer, nullable=True, index=True)
    object_key = Column(String(500), nullable=False)  # 云开发 fileID（cloud://...），不是 S3 key
    file_type = Column(String(50), nullable=True)
    file_size = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    # 'uploaded' | 'failed'。failed 的行云上没东西，不计配额；历史遗留的 NULL 按 uploaded 算
    # （判据就是本文件下面的 `not_failed()`——`NULL != 'failed'` 在 SQL 里是"不过"，不写清楚就漏账）。
    backup_status = Column(String(20), default="uploaded")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def not_failed():
    """筛出"云上真有这么个对象"的行。

    `NULL != 'failed'` 在 SQL 里结果是 NULL（也就是不过），而 add_column 那种迁移给老行
    留下的正是 NULL——所以 NULL 必须一起算进来，不然哪天有历史行就悄悄从配额里消失了。

    放在模型这一层而不是某个路由里，是因为四处问的是同一个问题、答案必须一模一样：
    配额求和与读一篇的配图（routes/assets.py）、公开页要露出哪几张（routes/shares.py）、
    注销时报给客户端去删哪些（routes/user.py）。各写一份迟早走样，走样的症状是
    "这张算进配额却列不出来"——看不见的那部分才最难查。
    """
    return or_(Asset.backup_status.is_(None), Asset.backup_status != "failed")
