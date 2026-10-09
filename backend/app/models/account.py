from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func

from app.db.database import Base


class Account(Base):
    """全系统唯一的"人"。

    为什么要这一张表而不是继续用 `users.openid` 当身份：iPhone 那边要走 Sign in with Apple，
    而 `openid` 那一列是 `unique=True, nullable=False` —— 一个只有 Apple 身份的人填不出这串，
    硬填就是把微信的 id 编出来冒名。更重要的是反方向：一旦让某个平台的 id 当业务主键往外走，
    加第二种登录方式时所有历史数据都要搬家；`id` 是自家生成的 UUID 之后，加一种登录只是往
    `account_identities` 里插一行。

    用 `String(36)` 存 UUID 而不是自增整数：自增 id 由服务器独占，而这条路线上迟早要有
    "客户端生成 id"的那一步（锚点 2 说的是跨端记录，走 UUIDv7）；这一张表今天的 id
    全部由服务端生成 `uuid4`，**还没有**接进 UUIDv7 那套时序口径 —— 写在这里是为了下一个
    动它的人知道边界在哪，不要以为这张表里的 id 能按创建时间排。
    """

    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AccountIdentity(Base):
    """一个 account 对上某个平台的那个 id。一对多：同一个人可以有微信、有 Apple。

    `provider_uid` 存的是平台侧原样那串（微信 openid / Apple 的 user identifier）。
    它**只进不出**：不进任何公开响应、不进落地页、不下发给另一端。唯一索引
    `(provider, provider_uid)` 是"同一个平台的同一个人不会被建成两个账号"这句话的落点——
    没有它，Apple 那边签名校验通过两次就会建出两个 account，而两个人各自看着一份不同的笔记。
    """

    __tablename__ = "account_identities"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    provider = Column(String(16), nullable=False)
    provider_uid = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # 平台侧确认过的时间。微信那一路 code2session 换到 openid 就算确认；Apple 留给签名校验通过那一刻。
    # 单列出来是因为"绑上了但没验证"和"没绑"在两端口径上要说不同的话。
    verified_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # 命名**唯一索引**而不是 UniqueConstraint：与本仓 `shares` 那道
        # `ux_shares_one_active_per_note` 同一写法。SQLite 上 ALTER TABLE 加不了表级 UNIQUE
        # 约束（要重建整张表），而唯一索引在两种引擎上是同一句话。
        Index("ux_identity_provider_uid", "provider", "provider_uid", unique=True),
    )
