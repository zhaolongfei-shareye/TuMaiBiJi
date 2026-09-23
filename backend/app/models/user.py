from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    openid = Column(String(100), unique=True, nullable=False, index=True)
    session_key = Column(String(100), nullable=True)
    nickname = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    language = Column(String(10), default="zh")
    wallpaper = Column(String(50), default="default")
    # 邀请奖励攒下的额外篇数，篇数上限 = BASE_QUOTA + quota_bonus，不单独存"上限"
    quota_bonus = Column(Integer, nullable=False, default=0, server_default="0")
    # 谁把这个账号邀进来的。只有 id、没有内容；归因发生在登录，到账发生在第一篇笔记
    invited_by = Column(Integer, nullable=True, index=True)
    # 账号代数：防止 SQLite 重用 ID 后旧 token 冒充新用户
    generation = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
