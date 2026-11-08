from sqlalchemy import Column, Integer, String, DateTime, Index, text
from sqlalchemy.sql import func
from app.db.database import Base


class Invitation(Base):
    """一条"谁给谁加了分"的凭据。两档奖励都记在这里，用 `source_note_id` 空不空分开。

    - `source_note_id` 为空 = **动笔首篇**那一路：被邀请人自己写下名下第一条，
      给邀请人 +10。一个人一辈子只成就一次，由 `invitee_id` 上的部分唯一索引
      （只钉空行）挡；
    - `source_note_id` 非空 = **转存**那一路：这个人把某一抄进了自己库，
      给那篇的作者 +1。**不同用户各算一次，同一个用户对同一篇只算一次**，
      由 `(source_note_id, invitee_id)` 的复合部分唯一索引挡（2026-10-01 改定：
      原来是"一篇一辈子只挣一次"，那样一篇热门笔记发给一百个人转存作者只得 1 分，
      和"不同用户都加分"这句话对不上）。

    两档都不设次数上限：能挡的是"同一个人对同一篇反复转存"，挡不掉的是注册小号互转
    （微信 openid 人手一个），所以防线放在去重而不是总量上。
    """

    __tablename__ = "invitations"
    __table_args__ = (
        Index("ix_invitations_inviter", "inviter_id"),
        # 动笔那一路：一个人只替别人成就一次（只管源笔记为空的行）
        Index(
            "ux_invitations_first_note_per_invitee",
            "invitee_id",
            unique=True,
            sqlite_where=text("source_note_id IS NULL"),
        ),
        # 转存那一路：同一篇 × 同一个人只算一次（不同用户各算一次）
        Index(
            "ux_invitations_import_once_per_pair",
            "source_note_id",
            "invitee_id",
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
