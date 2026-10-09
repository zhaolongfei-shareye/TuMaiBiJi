"""`accounts` 那张表的唯一写口。

为什么单独一个函数而不是在各处 `db.add(Account(...))`：这道关系（一个人 ↔ 一条平台身份）
只有**一个**地方能写，`users.account_id` 才敢不建外键（见那份迁移里的理由）。写口散了，
"没有外键"就从省事变成漏。

`ensure_for_user` 是幂等的，登录那一路每次都过一遍：迁移只回填它当时看得见的那些行，
迁移之后新建的用户要在这里当场补上。两条路共用一支函数，才有"每个用户都有 account"
这句话是真的。
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.account import Account, AccountIdentity
from app.models.user import User


def ensure_for_user(db: Session, user: User) -> Account:
    account = db.query(Account).filter(Account.id == user.account_id).first() if user.account_id else None
    if account is not None:
        return account

    if user.account_id is not None:
        # account_id 有值却查不到那一行：这是**数据坏了**，不是"还没建"。
        # 悄悄新建一个会把这个人挂到第二个身份上，两份笔记各归各家；报错至少让人看见。
        raise RuntimeError(f"user {user.id} 的 account_id={user.account_id} 在 accounts 里查不到")

    if user.openid is None:
        # 这一支只写**微信**那一条身份。一个只有 Apple 身份的人（openid 为 NULL）走到这里，
        # 拼出来的是 provider_uid=NULL，撞的是那一列的 NOT NULL——报错看不出是谁的错，
        # 所以在这里响，并说清是哪一类人走错了门。
        raise RuntimeError(f"user {user.id} 没有 openid：ensure_for_user 只给微信那一路写身份")

    account = Account(id=str(uuid.uuid4()))
    db.add(account)
    db.flush()
    db.add(
        AccountIdentity(
            account_id=account.id,
            provider="wechat",
            provider_uid=user.openid,
            # 这串 openid 是 code2session 当场换回来的，属于"平台确认过"。
            # 留 null 会让每个老用户在界面上看起来像"绑了没验"。
            verified_at=datetime.now(timezone.utc),
        )
    )
    user.account_id = account.id
    try:
        db.commit()
    except IntegrityError:
        # 同一个人同时登录两趟是真会发生的（小程序 onLaunch 重试、用户在启动页连点）：两趟都
        # 读到 account_id 为空、各建一个 account，后提交那一趟撞 `ux_identity_provider_uid`。
        # 那是并发赢家通吃，不是账坏了——所以退回去读赢的那一行、把这个人对到已经存在的那个
        # account 上。这一句挂在**登录主路径**上（`core/auth.py:118`），让它响一次，那个人
        # 这次就打不开自己的笔记；而上面那道 RuntimeError 不一样，那种是真账坏了，不许在这儿猜。
        db.rollback()
        winner = db.query(AccountIdentity).filter(
            AccountIdentity.provider == "wechat",
            AccountIdentity.provider_uid == user.openid,
        ).first()
        if winner is None:
            raise
        account = db.query(Account).filter(Account.id == winner.account_id).first()
        if account is None:
            raise RuntimeError(
                f"身份行指着不存在的 account={winner.account_id}：账坏了，不在这里猜"
            )
        user.account_id = account.id
        db.commit()
    db.refresh(account)
    return account
