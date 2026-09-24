from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean, ForeignKey
from sqlalchemy.sql import func
from app.db.database import Base


class Note(Base):
    __tablename__ = "notes"

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
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    cover_asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    is_pinned = Column(Boolean, default=False, nullable=False)
    pinned_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
