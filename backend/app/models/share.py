from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean, ForeignKey
from sqlalchemy.sql import func
from app.db.database import Base


class Share(Base):
    __tablename__ = "shares"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), nullable=False, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    token = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    key_links = Column(JSON, nullable=True)
    cover_asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
