from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.db.database import Base


class AccountPassword(Base):
    """一条 account 的登录口令。**一个账号最多一行**（`account_id` 上那道唯一索引）。

    为什么口令单独一张表、不往 `users` 上加一列（`private_password_hash` 那种写法）：
    口令是**账号**的登录方式，不是某一行 `users` 的属性。同一个人在小程序与 H5 各有一行
    `users`（阶段3 之后），口令挂在其中一行上就等于"换个端登录要重新设密码"。挂在 account 上，
    加一种登录方式只是往 `account_identities` 插一行 + 这里插一行，业务数据一个字都不动。

    `password_hash` 存的是 **scrypt**（`hashlib.scrypt`，标准库自带），格式与参数写在
    `app/services/passwords.py`。为什么不用 bcrypt/argon2：本仓 `requirements.txt` 里没有任何
    口令哈希包，加一个就要在现网 pip install 一次；scrypt 是标准库里的内存硬函数，
    部署这一步因此是零新增依赖（站长 11-12「免费的技术方案」那一句在依赖面上的落点）。

    `recovery_hash` 存 **HMAC-SHA256**，理由与 `link_codes.code_hash` 同型但更要紧：
    这一路**没有短信也没有邮件**（现网 `.env` 里 `SMS_*`/`EMAIL_*` 一组凭据都没有），
    恢复码是忘记密码之后唯一的入口，所以它不是 15 分钟就作废的一次性短码，而是长期有效的
    80 位随机串。裸哈希遇到库泄漏就能离线跑穿，keyed 之后这一步需要同时拿到 `JWT_SECRET_KEY`。
    原文只在生成那一次的响应里出现，库里一个字节都不留。

    `failed_count` / `locked_until` 是**按账号**的失败闸（10 次连错锁 15 分钟）。
    为什么不只靠 IP 限流：IP 限流挡的是"一台机器猛试"，而 distributed 攻击换 IP 就绕过去了，
    口令这一路又不像验证码那样有 6 位数字 + 5 分钟 TTL 兜着。计数落在库里而不是 Redis，
    是因为它必须跟着账号走、且重启不能清零。

    `account_id` **不建外键**，与 `users.account_id`、`link_codes.account_id` 同一先例：
    写口只有一处（`app/services/passwords.py`），删账号那条级联负责把残留行带走。
    """

    __tablename__ = "account_passwords"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String(36), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    recovery_hash = Column(String(64), nullable=False)
    failed_count = Column(Integer, nullable=False, default=0, server_default="0")
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())