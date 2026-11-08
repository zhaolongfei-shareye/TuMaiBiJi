from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), nullable=False, index=True)
    # `name` 是他自己打的那一串，**身份判据**：重名判据与「私密」那道锁都看它，译文一律不许写回这里。
    name = Column(String(100), nullable=False)
    # 两档显示值（站长 10-17「分类要支持自动翻译…如果翻译不了，就维持原文」）。
    # 可空＝那一档没有译名，客户端拿 `name` 回落；不是失败，是"这一档留空"。
    name_zh = Column(String(100), nullable=True)
    name_en = Column(String(100), nullable=True)
    color = Column(String(20), default="#666666")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
