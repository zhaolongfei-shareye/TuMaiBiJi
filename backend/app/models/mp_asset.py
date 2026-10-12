"""运营图（.cn 后台上传、全站默认背景那一张）的账本与生效位。

方案 `docs/方案-cn后台资产管理.md` 锚点 A1 那条口径落在这一份文件里，两表分工：

- `mp_assets` 只**记账**：这张图是谁传的、多少字节、多宽多高、什么格式、文件落在盘上哪个名字。
  一行 = 一份不可变的字节。历史上发布过的那几张都留着，回滚就是把生效位指回旧行，
  不重传、不重算。
- `mp_settings` 只记**当前生效的是哪一行**：`kind` 一行，`asset_id` 可以空。

`asset_id` 为空这一格必须显式写出来，不许靠"这一行不存在"来表达。理由不是洁癖：
名片那条链上「云上没这一行」和「云上这一行是空的」被当成同一件事过一次，结果是半行数据
被当成"用户清空了"，删掉了不可逆的图（`miniprogram/utils/profileCloud.js:13-15、111-117`
那段注释记的就是这次）。这一张表从第一天就把两个值分开，将来加灰度、加排期（方案 §四 P2）
只往 `mp_settings` 加栏，不用迁表、不用猜。

两种状态在界面上是两句话，所以两个都得能读出来：
- 有 `mp_settings` 行、`asset_id` 为空 → 「这台后台发布过，现在停用了，用包里那张」；
- 没有行（只可能是老库或手工删过）→ 「这一栏还没在后台登记过」。
两者对客户端是同一个结果（落回包内那张），但对操作者不是——他把图停用了和"我根本还没传过"
不是一回事。迁移会给每一已知 `kind` 补一行空值，所以从上线那一刻起就是第一种。

字节**内容寻址**存放（`object_path` = `<sha256>.<ext>`）：同样一份字节在库里只会有一份文件。
代价是删一行不能顺手删文件（另一行可能正指着它），所以这一版根本不删文件——
只涨不删，配合后台 400KB 的上限，长不了多少（服务器磁盘 10-11 实测余 12G）。
"""
from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy.sql import func

from app.db.database import Base

# 后台能管的那几栏。加一栏 = 加一个取值 + 客户端一处读法，所以这里是闭集，
# 不接受任意字符串（`services/mp_assets.py` 的校验以它为准）。
KIND_HOME_BG = "home_bg"
KINDS = (KIND_HOME_BG,)
# 界面上的叫法。管理页那一栏的标题从这里读，免得网页和后端各写一份中文名。
KIND_LABELS = {KIND_HOME_BG: "首页默认背景图"}


class MpAsset(Base):
    """一张上传过的运营图。不可变：要改就重传一行，改的是 `mp_settings` 不是这一行。"""

    __tablename__ = "mp_assets"

    __table_args__ = (
        # 发图端点 `GET /api/mp/a/{token}` 按这一栏查，且它必须是唯一的——
        # 两个 token 撞了等于一张图占了两个地址，而回滚时"哪一个才是当前那张"会读花。
        # 用 `Index(unique=True)` 而不是 `Column(unique=True)`：后者在 SQLite 上是表内约束，
        # `compare_metadata` 照 `PRAGMA table_info` 反射不出来，于是"迁移与模型一字不差"
        # 那条用例（`tests/test_quota_and_invite.py`）对它永远是假绿。
        Index("ux_mp_assets_token", "token", unique=True),
        # 同一栏不存两份一样的字节。查重在服务层，但"两次上传撞在一起"靠注释挡不住，
        # 所以这一对再来一道索引（与 `ux_note_cards_one_current_per_note` 同一路子）。
        # 不同 kind 用同一份文件是允许的，所以约束的是 (kind, content_hash) 这一对。
        Index("ux_mp_assets_kind_hash", "kind", "content_hash", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(24), nullable=False, index=True)
    # 公网地址里那一段随机串，不是自增 id（锚点 A2：对外用 token 不用 id，与 shares 同一路子）。
    token = Column(String(40), nullable=False)
    # 整份字节的 sha256。客户端拿它当本机缓存的键，也是"传了同一张图两次"的判据。
    content_hash = Column(String(64), nullable=False, index=True)
    # 相对 `MP_ASSETS_DIR` 的文件名，形如 `<sha256>.jpg`。存相对而不是绝对：
    # 换一台机器只要改一个环境变量，账本里的路径不会集体失效。
    object_path = Column(String(120), nullable=False)
    media_type = Column(String(16), nullable=False)
    file_size = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    # 操作者自己写的一句话（"换春季那张"）。历史那一栏要能看出为什么传了它，
    # 否则三十张长得差不多的图摆在后台里，回滚时挑不出哪一张才是上周那张。
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MpSetting(Base):
    """某一栏当前生效的是哪一行；空值就是"用包里那张"，且这一格要显式存在。"""

    __tablename__ = "mp_settings"

    # `kind` 直接当主键：一栏一行，没有历史（历史在 `mp_assets`），也就不需要自增 id。
    kind = Column(String(24), primary_key=True)
    # 指向 `mp_assets.id`。**故意不写 ForeignKey()**：与 `models/note_card.py:55-57` 同一个坑——
    # SQLite 上后加列加不了外键，声明了就会和那条"alembic 升级后的库和模型一字不差"永远对不上。
    # 归属的一致性靠服务层（`publish` 只收这一张表里真存在的 id）。
    asset_id = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
