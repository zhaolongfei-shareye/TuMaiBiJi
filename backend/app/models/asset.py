from sqlalchemy import Column, Integer, String, Text, DateTime, or_
from sqlalchemy.sql import func
from app.db.database import Base

# 一篇笔记的配图张数。9 与小程序选图上限同值（`create.js` 的 `count: 9`），不是另起一档；
# 这条上限今天第一次落在服务端，公开页露出的张数也认它（routes/shares.py）。
MAX_ASSETS_PER_NOTE = 9

# 云开发单文件上限 20MB（docs/图片云备份-开发方案.md §二那张表）。定义放在模型这一层而不是
# 放在登记接口那个文件里，是因为 10-19 起有两个口在问同一个问题（客户端登记一张配图、服务端
# 从外链下载一张正文图），而**两处各写一份 20 × 1024 × 1024 迟早走样**：走样的症状不是报错，
# 是"接口收得下、下载那一头先把它判成超限丢掉"——看不见的那半最难查。
# 守这条的是 tests/test_note_images.py 里那条"全仓只许模型这一处定义这个数"。
MAX_FILE_BYTES = 20 * 1024 * 1024


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
    # 一篇之内那几张的先后（10-19 站长「编辑时，配图要支持拖动排序，方便用户选择好的图片作为头图」）。
    # 这一列就是"头图是谁"的唯一答案：四处读口一律 `ORDER BY (sort_order, id)`，而头图取第一张
    # （`routes/notes.py` 的 `_attach_covers`）——所以拖动改的不只是编辑那一屏的排布，列表右侧那枚、
    # 详情窗那张大图、卡片模板的大图位、公开页那一批，五处跟着一起换。
    # 0 是"从没手动排过"：存量行全带 server_default '0'，第一档排序键相等 ⇒ 退回 `id` 升序
    # ＝这一刀之前的样子，老笔记的头图一张都不会换。新登记的走 `_next_sort_order`（当前最大值 +1）
    # 永远追加在最后，不会插到人家前面。与 `categories.sort_order` 同一套构造。
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def order_by_note():
    """一篇之内那几张的排序键。**四处读口只许从这里拿**，别处再写一遍 `asc()` 就是第五份真相。

    为什么钉这一条：`_attach_covers` 那份注释早就写着"两处各挑一张的话，列表上那枚和点进去
    第一张就会不是同一张图"——拖动排序把这句话从"注释里的约定"变成了屏上看得见的差别，
    少改一处不是颜色不对，是**他拖完在列表上看到的还是旧那张**。
    """
    return (Asset.sort_order.asc(), Asset.id.asc())


def next_sort_order(db, note_id) -> int:
    """这一篇**下一张新图**该排第几＝当前最大值 +1。

    为什么不让新图直接吃默认值 0：0 是"从没排过"那一档，而存量行全是 0；新图拿 0 会在
    排过序的那一批（1..N）之前冒到第一格，等于**给一篇老笔记悄悄换了头图**。
    最大值 +1 两种态都对：没排过的篇里 max=0 ⇒ 新图拿 1，仍排在所有 0 之后；
    排过的篇里 max=N ⇒ 新图拿 N+1，追加在最后。
    """
    cur = db.query(func.max(Asset.sort_order)).filter(Asset.note_id == note_id).scalar() or 0
    return int(cur) + 1


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
