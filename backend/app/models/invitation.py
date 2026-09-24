from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint, Index, text
from sqlalchemy.sql import func
from app.db.database import Base


class Invitation(Base):
    """一条"邀请成功"的凭据：有人因为谁的分享留下来，并且写下了他名下第一条笔记。

    两条路都会记在这里：他自己动笔（`credit_first_note`），或者他把别人那篇转存进
    自己库里（`credit_import`）。

    - `invitee_id` 唯一 = 一个账号一辈子只能替别人成就一次，重复归因和重复到账
      在这一层就被数据库挡住，不靠应用层记得住；
    - `source_note_id` 上的部分唯一索引 = 转存这一条路要指名是**哪篇笔记**把人带来的，
      而同一篇笔记只给作者挣一次。只有转存填得上的行参与约束，动笔那一路没有
      "哪篇笔记"可指，留空。
    """

    __tablename__ = "invitations"
    __table_args__ = (
        UniqueConstraint("invitee_id", name="uq_invitations_invitee"),
        Index("ix_invitations_inviter", "inviter_id"),
        Index(
            "ux_invitations_one_reward_per_source_note",
            "source_note_id",
            unique=True,
            sqlite_where=text("source_note_id IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    inviter_id = Column(Integer, nullable=False)
    invitee_id = Column(Integer, nullable=False)
    # 不带外键：这张表记的是"当初谁带来了谁"，源笔记后来被删掉也不该把这笔账一起带走，
    # 更不该让删笔记这件事多一种失败方式。
    source_note_id = Column(Integer, nullable=True)
    reward = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
