from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.db.database import Base


class LinkCode(Base):
    """iPhone 生成、小程序消费的一次性 6 位短码。

    为什么要有这么一张表：站长拍的乙让两端是**同一个 account 的两扇门**，而只有 Apple 身份的
    人根本没有 `users` 行，微信那一侧无法凭平台 id 认出他。唯一不把 openid 或 Apple user
    identifier 传来传去（契约 §十一 第 2 条禁的就是这个）又能把两个平台对上的办法，就是让
    这个人自己在一端生成一个短码、到另一端念给服务器听。

    `code_hash` 存的是 **HMAC-SHA256，不是裸 SHA-256**：码只有 6 位数字，一百万种。裸哈希
    遇到数据库泄漏时，攻击者把一百万个候选全 sha256 一遍就能反推出现存每个短码，然后抢在
    真用户之前把**别人的 iPhone 账号**绑到自己微信上，两个人的笔记从此合成一份。 keyed 之后
    这步需要同时拿到 `JWT_SECRET_KEY`，而那已经是"能签任意登录态"的等级，不再是额外的权限。
    （契约 §二 那句"服务端只存哈希"讲的是"库里看不出码本身"，这条实现满足它。）

    `used_at` 一旦写上就不回退：同一张码第二次来是**并发重复消费**，不是新会话。判"能不能用"
    的完整条件（没用过 + 没过期）写在 `app/services/link_codes.py`，那里还有一道
    条件 UPDATE 把"检查并标记"并成一步——分开写的话两个人同时 Redeem 同一个码会都成功。

    `account_id` **不建外键**，与本仓 `users.account_id` 同一先例：写口只有一处，而带 FK 的列
    往一张有 live 数据的表上加时 SQLite 要重建整张表。删账号那条级联（`DELETE /v1/account`）
    会把残留的行一起带走，不靠这层约束兜。
    """

    __tablename__ = "link_codes"

    id = Column(Integer, primary_key=True, index=True)
    code_hash = Column(String(64), unique=True, nullable=False, index=True)
    account_id = Column(String(36), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
