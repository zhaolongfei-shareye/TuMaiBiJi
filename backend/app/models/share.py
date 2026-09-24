from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean, ForeignKey, Index, text
from sqlalchemy.sql import func
from app.db.database import Base


class Share(Base):
    __tablename__ = "shares"

    __table_args__ = (
        # "一篇笔记只留一张有效码"原来只是路由里的一句注释：两个请求同时进来，
        # 都在对方落库前查了一遍"有没有"，于是同一篇笔记发出好几张互不相干的码。
        # 注释管不住并发，部分唯一索引管得住——只约束还开着的行，撤掉的、被取代的留档。
        Index(
            "ux_shares_one_active_per_note",
            "note_id",
            unique=True,
            sqlite_where=text("is_active = 1"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), nullable=False, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    token = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    key_points = Column(JSON, nullable=True)
    key_links = Column(JSON, nullable=True)
    source_url = Column(String(1000), nullable=True)
    cover_asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
