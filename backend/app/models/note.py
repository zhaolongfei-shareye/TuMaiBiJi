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
