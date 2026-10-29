from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean, ForeignKey, Index, text
from sqlalchemy.sql import func
from app.db.database import Base

# 从别人分享页转存进来的那一篇的 `source_type`。写在这里而不是散在各处当字面量：
# 结 MIND 那一条要把它从"他自己动笔"里排出去（`quota._is_his_first_note`），
# 而写入那一头（`routes/notes.py` 的转存口）钉的就是这一个值——两处必须同一个出处，
# 否则其中一处改了个字符串，另一处的判据就成了永远不成立的假话。
SOURCE_SHARE_IMPORT = "share_import"


class Note(Base):
    __tablename__ = "notes"
    # 这一条与迁移 `d3a86f1c75b4` 里的 `create_index` 必须同时存在（10-25 第八轮审计 M6 的教训形状）：
    # 测试库是 `Base.metadata.create_all` 建出来的，只写迁移的话测试里那张索引根本不存在，
    # "撞索引能领回先落那篇"那条用例就会以另一条路通过——假绿。
    __table_args__ = (
        Index(
            "ux_notes_one_share_copy_per_user",
            "share_copy_key",
            unique=True,
            sqlite_where=text("share_copy_key IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    key_points = Column(JSON, nullable=True)
    key_links = Column(JSON, nullable=True)
    content = Column(Text, nullable=True)
    original_content = Column(Text, nullable=True)
    source_type = Column(String(50), nullable=False)
    source_url = Column(String(1000), nullable=True)
    # 从别人的分享页转存进来的那一条，钉住"抄自谁的哪篇、当时标题是什么、什么时候抄的"。
    # 它故意不出现在 NoteCreate / NoteUpdate 里：编辑接口碰不到它，所以转存之后来源改不掉，
    # 原分享被撤掉或删掉也不影响这一份副本。
    imported_from = Column(JSON, nullable=True)
    # 「同一人对同一篇只留一份」的**数据库层兜底**（10-25 第八轮审计 M6）：转存时写
    # `user_id:原笔记 id`，唯一索引只吃非 NULL 的那部分行。
    # 为什么不把索引直接建在 `imported_from` 的 JSON 路径上：现网存量里已经有一对"同一人同一篇
    # 两行"（那道闸上线之前落的），唯一索引建不上 ⇒ 要么先删用户的笔记（那是另一件事、要他点头），
    # 要么走这一栏：老行留 NULL，一行都不必动，而这一趟之后写的每一行都有索引兜着。
    share_copy_key = Column(String(120), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    cover_asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    is_pinned = Column(Boolean, default=False, nullable=False)
    pinned_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 屏上那枚来源标读的两栏（站长 10-29「把来源标注的网页文章，改为具体的网站文章」）。
    # **为什么是 property 而不是新列**：值本来就钉在 `imported_from` 那份快照里（与作者名同一份、
    # 同一时刻、同一个"抄自哪里"的事实），加一栏就是第二份真相——而且加栏要迁移，
    # 那份快照的读法在 `routes/notes.py`、`poster_engine`、后台统计三处各有一份抄本，
    # 迁一次表不会让那三处一起改口。写的那一头只有一个出处：`services/site_names.snapshot_fields`。
    # ⚠ 两栏都**不许进** `core/private_access.NOTE_BRIEF_FIELDS`／`NOTE_DETAIL_FIELDS`：
    #    私密篇没解锁时行是按那两份名单重建的，站名虽不是正文，也会告诉别人这篇是从哪儿抄的。
    @property
    def source_site(self) -> str:
        """中文门里那一站的名字；认不出就空串（客户端退到那六档通用文案）。"""
        snap = self.imported_from if isinstance(self.imported_from, dict) else {}
        return str(snap.get("site_name") or "").strip()

    @property
    def source_site_en(self) -> str:
        """英文门里那一站的名字。

        空主名 ⇒ 空串（没认出就是没认出，两种语言都不许造一个名字出来）。
        主名有、英文栏空 ⇒ 回主名：`og:site_name` 与模型那两级本来就只回一个名字，
        而站名是专有名词，英文门里念「微信公众平台」和念「WeChat」指的都是那一家。
        """
        zh = self.source_site
        if not zh:
            return ""
        snap = self.imported_from if isinstance(self.imported_from, dict) else {}
        return str(snap.get("site_name_en") or "").strip() or zh
