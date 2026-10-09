from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # 只有微信号的人这一格是他的 openid；**只有 Apple 身份的人这一格是 NULL**（阶段2-2）。
    # 原来这里写的是 nullable=False，那是一个填不进去的约束：一个只有 SIWA 的人给不出 openid，
    # 硬填等于替他编一个微信 id 冒名（契约 §十一 第 2 条禁止的就是这个）。unique 保留——
    # 它是"同一个微信号开不出两个账号"那句话的落点，而 NULL 与 NULL 在 SQL 里本来就不相等，
    # 所以放开可空不会把这道闸门一起放开（正反两条都钉在 tests/test_account_and_identity.py）。
    openid = Column(String(100), unique=True, nullable=True, index=True)
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
    # 这个微信号背后那个"人"。见 `app/models/account.py`：平台 id 不再当业务主键用之后，
    # 加第二种登录方式才是往 account_identities 插一行，而不是把所有历史数据搬家。
    # 故意**不建外键**（和本仓 `share_reports.token` 同一先例）：给一张有 live 数据的
    # users 表加带 FK 的列，SQLite 要重建整张表，而这道约束真正该由谁来保证只有一个答案——
    # 写口在 `app/services/accounts.py` 一处。可空是因为迁移只回填它见过的那些行，
    # 迁移之后新建的用户由登录那一路当场补上（同一支函数，两条路共用一个真相）。
    account_id = Column(String(36), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
