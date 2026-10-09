"""一次性短码的生成与消费：这张表的唯一写口。

码本身**只在生成那一次的响应里出现**，库里一个字节都不留原文，只留 HMAC-SHA256
（为什么不是裸哈希，见 `app/models/link_code.py` 那段）。判"能不能用"的完整条件是
**没用过 + 没过期**两条一起，只看其中一条的写法在这张表上是错的：只用过还能再消费一次，
没用过但早死了还能把微信绑到一个不存在的会话上。

过期时间用 Python 比而不是在 SQL 里比，与本仓 `services/sharing.is_expired` 同一口径：
`DateTime(timezone=True)` 在 SQLite 上读回来是**不带时区**的，拿 `aware` 的 now 去 SQL 里比
会撞 "can't compare offset-naive and offset-aware datetimes"，而这句话在 Postgres 上不会出现——
两种引擎都得走得通，所以统一读出来再归一。
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.account import Account
from app.models.link_code import LinkCode

CODE_LENGTH = 6
TTL_MINUTES = 15
# 一百万个可能值里撞上现有一枚的概率极低，但"极低"不是"不会"：撞上了必须换一枚重来，
# 而不是让请求失败，更不能覆盖别人那张还没用过的码（覆盖 = 把那个人的账号拱手让给后来者）。
MAX_GENERATE_ATTEMPTS = 8


def _hash(code: str) -> str:
    return hmac.new(settings.JWT_SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def create(db: Session, account: Account) -> str:
    """给这个人发一枚此刻有效的短码，返回 6 位原文。"""
    for _ in range(MAX_GENERATE_ATTEMPTS):
        code = "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))
        row = LinkCode(
            code_hash=_hash(code),
            account_id=account.id,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=TTL_MINUTES),
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # 撞的是 `code_hash` 那道唯一索引：另一枚一模一样的码已经在库里。
            # 回滚掉自己这一条，换一枚再来——上面那道 8 次就是给这个循环定的上限。
            db.rollback()
            continue
        db.refresh(row)
        return code
    raise RuntimeError(
        f"连试 {MAX_GENERATE_ATTEMPTS} 枚 6 位短码都撞了已有记录：一百万分之一的平方级概率"
        "不可能连续命中这么多次，这是库里 link_codes 被人灌满了，不是运气差"
    )


def find_usable(db: Session, code: str) -> LinkCode | None:
    """按原文找到那张**此刻还能用**的码；不对、用过、过期都返回 None。

    三种情况合成一个 None 是故意的：分开报错等于给攻击者一台"这台机器知道你的码对不对"
    的判分机，而 6 位数字一共就一百万种。调用方要的只是"能不能往下走"。
    """
    row = db.query(LinkCode).filter(LinkCode.code_hash == _hash(code)).first()
    if row is None or row.used_at is not None:
        return None
    if datetime.now(timezone.utc) >= _as_utc(row.expires_at):
        return None
    return row


def mark_used(db: Session, row: LinkCode) -> bool:
    """把"没用过"和"标成用过"并成一步。返回 False = 在我们读到写之间别人已经消费掉了。

    这一步必须是条件 UPDATE。分成"先查 used_at 为空、再写 used_at"两趟的话，两个人同时
    念同一枚码会**都**通过检查，然后各自的微信被绑到别人的账号上——和本仓 `shares` 那张
    部分唯一索引当初要堵的是同一类洞（注释管不住并发）。
    """
    now = datetime.now(timezone.utc)
    claimed = (
        db.query(LinkCode)
        .filter(LinkCode.id == row.id, LinkCode.used_at.is_(None))
        .update({"used_at": now}, synchronize_session=False)
    )
    db.commit()
    return claimed == 1
