from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.db.database import Base


class Invitation(Base):
    """一条"邀请成功"的凭据：被邀请人经分享进来并写下了第一篇笔记。

    invitee_id 唯一 = 一个账号一辈子只能替别人成就一次，重复归因和重复到账
    在这一层就被数据库挡住，不靠应用层记得住。
    """

    __tablename__ = "invitations"
    __table_args__ = (
        UniqueConstraint("invitee_id", name="uq_invitations_invitee"),
        Index("ix_invitations_inviter", "inviter_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    inviter_id = Column(Integer, nullable=False)
    invitee_id = Column(Integer, nullable=False)
    reward = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
