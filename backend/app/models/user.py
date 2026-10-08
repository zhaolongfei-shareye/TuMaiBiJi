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
    # 邀请与转存攒下的加分；MIND = BASE_QUOTA + 这一列。笔记不限量，这一列不是任何上限的一部分
    quota_bonus = Column(Integer, nullable=False, default=0, server_default="0")
    # 谁把这个账号邀进来的。只有 id、没有内容；归因发生在登录，到账发生在第一篇笔记
    invited_by = Column(Integer, nullable=True, index=True)
    # 账号代数：防止 SQLite 重用 ID 后旧 token 冒充新用户
    generation = Column(Integer, nullable=False, default=1, server_default="1")
    # 私密笔记的 6 位数字密码哈希（sha256）；null 表示未设置
    private_password_hash = Column(String(64), nullable=True)
    # 用户自己填的联系邮箱。**可空，且只有本人（当前 token 的 user_id）读得到**——它不进任何
    # 公开响应、不进分享落地页、不进列表。收它的唯一用途写在 docs/产品需求.md：用户通过开发者
    # 反馈邮箱来信行使查阅/更正/注销时，用来把来信对上库里哪个账号（openid 从不下发、也不给用户看，
    # 没有这一格就没有别的对应办法）。服务端不发信、不做营销、不给第三方。
    contact_email = Column(String(254), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
