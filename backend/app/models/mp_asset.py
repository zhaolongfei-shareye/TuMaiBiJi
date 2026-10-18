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
from sqlalchemy import Column, DateTime, Index, Integer, JSON, String
from sqlalchemy.sql import func

from app.db.database import Base

# 后台能管的那几栏。加一栏 = 加一个取值 + 客户端一处读法，所以这里是闭集，
# 不接受任意字符串（`services/mp_assets.py` 的校验以它为准）。
KIND_HOME_BG = "home_bg"
# 站长 10-18「默认笔记，后台也应该支持上传图片」⇒ 官方那一篇也要能带一张图。
# 这一格**是图片栏里加一栏，不是给 `preset_note` 那一栏再加一个字段**：笔记自己那排配图存在
# 云开发桶里（`assets.object_key` 是 `cloud://`），而后台是浏览器，传不进那个桶——服务端至今
# 没有写桶的凭据。所以这张官方图只能走已经上线的那条运营图下发链：存我们服务器、
# `/api/mp/a/{token}` 匿名发字节、URL 随内容不可变；客户端拿那条 https 串**同时**画小图和喂
# `previewImage`（本机 `USER_DATA_PATH` 那个路径 previewImage 不认，10-08 记过这条坑）。
KIND_PRESET_NOTE_IMAGE = "preset_note_image"
KINDS = (KIND_HOME_BG, KIND_PRESET_NOTE_IMAGE)
# 站长 10-15「Tips 改为后台配置」⇒ 后台从此也能管**一句话**，不只管一张图。
# 但**不把 tips 塞进上面那个 `KINDS`**：那一条是"图片栏"的闭集，`upload`/`publish`/`check_kind`
# 全都假设里面的 kind 能收字节、能记账宽高。把 tips 混进去的代价不是报错，是
# 后台会出现一个"给文案上传一张 JPEG"的格子——界面能点、点下去存进库，而屏上永远读不到它。
KIND_TIPS = "tips"
TEXT_KINDS = (KIND_TIPS,)
# 站长 10-18「默认笔记请在管理后台配置，我可以编辑修改，日后更新不需要发版」⇒ 新用户出生那一篇
# 那五个字段也能在后台改了。**单独第三组，不塞进上面那个 `TEXT_KINDS`**：那一组的校验
# （`services/mp_assets.clean_text`）把形状钉死成"两份语言、各一串句子"，而这一栏是"一篇笔记的
# 五个字段"。混进去不会报错，会让后台画出一张只有两个文本框的格子，他往里面填正文＝填进"一句话"。
KIND_PRESET_NOTE = "preset_note"
NOTE_KINDS = (KIND_PRESET_NOTE,)
# 界面上的叫法。管理页那一栏的标题从这里读，免得网页和后端各写一份中文名。
KIND_LABELS = {
    KIND_HOME_BG: "首页默认背景图",
    KIND_PRESET_NOTE_IMAGE: "帮助文档那张配图",
    KIND_TIPS: "首屏那行 Tips",
    KIND_PRESET_NOTE: "帮助文档（官方那一篇）",
}
# 「这一栏空着的时候，小程序屏上是什么样」——后台那一页那两句话（"还没登记过这一栏"／"当前停用"）
# 后半截从这里读，不写死在网页里。只给 `preset_note_image` 配一句：官方那一篇从来没有
# "包里那一张"可以回落（这一栏上线之前它就没有图），照抄网页上那句模板话＝对站长念半句假话。
# 首页背景那一栏留空＝沿用它界面上原来那句；10-14 之后那句其实也不准（包内默认图已撤、
# 两级都空＝白底），但那一处站长没指过，不在这一刀里顺手改。
KIND_EMPTY_TEXTS = {
    KIND_PRESET_NOTE_IMAGE: "帮助文档那一篇不显示配图",
}


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
    """某一栏当前生效的是什么：图片栏指着一行 `mp_assets`，文案栏直接存一份 JSON。

    两类共用这一张表是**故意的**：`/api/mp/config`（小程序读）、`/api/admin/*`（后台写）、
    `/ops`（那一页）三处都要同一句"这一栏现在生效的是什么"，一个 kind 一个生效位只能有一份表。
    共用带来的唯一约束：`asset_id` 与 `text_value` 至多填一个，谁填由 kind 属于哪个闭集决定
    （`services/mp_assets.py` 的 `check_kind` 只认图片栏、`check_text_kind` 只认文案栏）。
    """

    __tablename__ = "mp_settings"

    # `kind` 直接当主键：一栏一行，没有历史（历史在 `mp_assets`），也就不需要自增 id。
    kind = Column(String(24), primary_key=True)
    # 指向 `mp_assets.id`。**故意不写 ForeignKey()**：与 `models/note_card.py:55-57` 同一个坑——
    # SQLite 上后加列加不了外键，声明了就会和那条"alembic 升级后的库和模型一字不差"永远对不上。
    # 归属的一致性靠服务层（`publish` 只收这一张表里真存在的 id）。
    asset_id = Column(Integer, nullable=True)
    # 文案栏的生效值，形如 `{"zh": ["…", …], "en": ["…", …]}`。图片栏这一格永远是 NULL。
    # 用 JSON 一栏而不是拆成"一句一行"（与 `note.py:14`/`share.py:28` 的 key_points 同型）：
    # 这一栏的读写单位从来是**整批**——客户端一次替换一整份、撤回秒级生效（`posterTemplates` 那条
    # 同型纪律）。拆成行就要为"第几句改过"额外维护一套序号一致性，而没有任何读法需要单句。
    text_value = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
