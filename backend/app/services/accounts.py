"""`accounts` 那张表的唯一写口。

为什么单独一个文件而不是在各处 `db.add(Account(...))`：这道关系（一个人 ↔ 一条平台身份）
只有**一个**地方能写，`users.account_id` 才敢不建外键（见那份迁移里的理由）。写口散了，
"没有外键"就从省事变成漏。

- `ensure_for_provider` 是"建一个人并挂上他的第一种登录方式"的唯一落点，微信和 Apple
  两条登录路都走它（幂等：已经有这条 identity 就原样返回它的主人）。
- `ensure_for_user` 在它外面包一层，只管"这一行 `users` 连到哪条 account"。它是幂等的，
  登录那一路每次都过一遍：迁移只回填它当时看得见的那些行，迁移之后新建的用户要在这里当场
  补上。两条路共用一支函数，才有"每个用户都有 account"这句话是真的。
- `bump_generation` 是唯一能抬代次的地方（一个人两格，见它的 docstring）。
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.account import Account, AccountIdentity
from app.models.user import User


def ensure_for_provider(db: Session, provider: str, provider_uid: str) -> Account:
    """**唯一**一处"建一条 account 并给它挂第一种登录方式"的代码。

    建号这件事只能有一个出处，理由和 `ensure_for_user` 只能有一个一样：两处各写一遍
    `Account(...) + AccountIdentity(...)`，那么并发保护、`verified_at` 的口径、撞唯一索引之后
    怎么找回赢家，就会在两处分别长歪。`/v1/auth/apple` 建号和微信建号走的必须是同一扇门。
    """
    identity = db.query(AccountIdentity).filter(
        AccountIdentity.provider == provider,
        AccountIdentity.provider_uid == provider_uid,
    ).first()
    if identity is not None:
        account = db.query(Account).filter(Account.id == identity.account_id).first()
        if account is None:
            raise RuntimeError(
                f"身份行指着不存在的 account={identity.account_id}：账坏了，不在这里猜"
            )
        return account

    account = Account(id=str(uuid.uuid4()))
    db.add(account)
    db.flush()
    db.add(AccountIdentity(
        account_id=account.id, provider=provider, provider_uid=provider_uid,
        # 走到这里的两条路（微信 code2session 换回 openid / Apple 的 identityToken 验完签）
        # 都已经**由平台确认过**这一串是本人的。留 null 会让每个新用户看起来像"绑了没验"。
        verified_at=datetime.now(timezone.utc),
    ))
    try:
        db.commit()
    except IntegrityError:
        # 同一个人同时登录两趟是真会发生的（小程序 onLaunch 重试、用户在启动页连点、
        # iPhone 上 SIWA 面板被连点两下）：两趟都读到"没有这条 identity"、各建一个 account，
        # 后提交那一趟撞 `ux_identity_provider_uid`。那是并发赢家通吃，不是账坏了——
        # 所以退回去读赢的那一行。这一句挂在**登录主路径**上（`app/core/auth.py` 的
        # `login_or_register` 和 `/v1/auth/apple`），让它响一次，这个人这次就打不开自己的东西；
        # 而上面那道 RuntimeError 不一样，那种是真账坏了，不许在这儿猜。
        db.rollback()
        winner = db.query(AccountIdentity).filter(
            AccountIdentity.provider == provider,
            AccountIdentity.provider_uid == provider_uid,
        ).first()
        if winner is None:
            raise
        account = db.query(Account).filter(Account.id == winner.account_id).first()
        if account is None:
            raise RuntimeError(
                f"身份行指着不存在的 account={winner.account_id}：账坏了，不在这里猜"
            )
    db.refresh(account)
    return account


def ensure_for_user(db: Session, user: User) -> Account:
    account = db.query(Account).filter(Account.id == user.account_id).first() if user.account_id else None
    if account is not None:
        return account

    if user.account_id is not None:
        # account_id 有值却查不到那一行：这是**数据坏了**，不是"还没建"。
        # 悄悄新建一个会把这个人挂到第二个身份上，两份笔记各归各家；报错至少让人看见。
        raise RuntimeError(f"user {user.id} 的 account_id={user.account_id} 在 accounts 里查不到")

    if user.openid is None:
        # 这一支只写**微信**那一路的身份。一个只有 Apple 身份的人（openid 为 NULL）走到这里，
        # 拼出来的是 provider_uid=NULL，撞的是那一列的 NOT NULL——报错看不出是谁的错，
        # 所以在这里响，并说清是哪一类人走错了门。
        # 站长 10-09 拍乙之后，这种人**根本不会有 `users` 行**（他只在 `accounts` +
        # `account_identities(apple)` 上存在），所以这一支今天已经走不到；留着是因为
        # `users.openid` 那一列在库里仍是可空的，而"可空的列上有人写了 NULL"必须有人当场说清楚。
        raise RuntimeError(f"user {user.id} 没有 openid：ensure_for_user 只给微信那一路写身份")

    account = ensure_for_provider(db, "wechat", user.openid)
    if user.account_id != account.id:
        # 两种情况走到这里：① 上面刚建了身份行，`user` 这头还没连上；② 身份行早就在
        # （迁移回填过、或这个人在别的设备上登过），而这一行 `users.account_id` 是空的。
        # ② 不必再建一次身份——`ensure_for_provider` 幂等，直接把这个人连到已经存在的那条上。
        user.account_id = account.id
        db.commit()
    return account


def bump_generation(db: Session, account: Account) -> int:
    """把一个人的两格代次**一起**抬。返回跟着抬了的 `users` 行数（0 或 1）。

    为什么必须一次抬两格：站长 10-09 拍的乙让同一个人在最多两处有代次——微信那条老登录态
    比的是 `users.generation`（现网 7 天 token 认的是这一格，撤它等于把小程序用户全体踢下线），
    `/v1` 那条比的是 `accounts.generation`。契约 §五"归属一变，两侧 token 全部失效"要的是
    这个人**两边都登不回去**；只抬一格的话，另一格还活着的那条 token 在新归属下继续读得到
    合并前的数据，而那正是合并之后最不该发生的事。

    故意**不 commit**：吊销必须和引发它的那次归属变更在同一个事务里。中途崩了要么两样都没发生，
    要么两样都发生了；先提交归属变更、再单独提交代次，中间那段窗口里旧 token 照样能用。

    这里逐行走 ORM 而不是 `update({generation: generation + 1})`：一个人名下的 `users` 行
    只有 0 或 1 条，而批量 update 不会同步已在内存里的那个 User 对象——调用方紧接着还要拿
    这个对象发新 token，读到旧代次的话发出去就是一把当场过期的钥匙。
    """
    rows = db.query(User).filter(User.account_id == account.id).all()
    for row in rows:
        row.generation = row.generation + 1
    account.generation = account.generation + 1
    return len(rows)
