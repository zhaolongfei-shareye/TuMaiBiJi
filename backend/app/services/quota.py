"""笔记额度与邀请奖励：规则只写在这一个文件里，路由和 worker 都只调这里的函数。

口径（2026-09-22 定）：
- 每人名下 100 篇，超出后三条创建入口（手写 / 链接 / 截图）一律当场拦下；
- 被邀请人通过分享进来**并且写下第一篇笔记**才算邀请成功，给邀请人 +10 篇；
  只是打开看看不算——否则刷一堆人点开链接就能白拿额度；
- 一个邀请人最多记 5 次奖励（+50）。注册小号自邀自写这条路堵不掉（微信 openid
  人手一个），能堵的是它的收益上限。

上限、奖励、次数三个数都在这里，客户端不硬编码：它读 GET /api/user/quota 拿回来。
"""
import logging

from sqlalchemy.orm import Session

from app.core.errors import UserError
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.user import User

logger = logging.getLogger(__name__)

BASE_QUOTA = 100
INVITE_REWARD = 10
MAX_REWARDED_INVITES = 5


def quota_limit(user: User) -> int:
    return BASE_QUOTA + int(user.quota_bonus or 0)


def used_count(db: Session, user: User) -> int:
    return db.query(Note).filter(Note.user_id == str(user.id)).count()


def rewarded_invites(db: Session, inviter_id: int) -> int:
    return (
        db.query(Invitation)
        .filter(Invitation.inviter_id == inviter_id)
        .count()
    )


def ensure_room(user: User, db: Session) -> None:
    """还能不能再存一篇。文案按 toast 两行（约 30 汉字）控制。"""
    limit = quota_limit(user)
    if used_count(db, user) < limit:
        return
    left = MAX_REWARDED_INVITES - rewarded_invites(db, user.id)
    if left > 0:
        raise UserError(f"已达 {limit} 篇上限，分享好友可再得 {INVITE_REWARD} 篇")
    raise UserError(f"已达 {limit} 篇上限，请删除旧笔记后再试")


def quota_view(user: User, db: Session) -> dict:
    used = used_count(db, user)
    limit = quota_limit(user)
    rewarded = rewarded_invites(db, user.id)
    from app.models.category import Category

    return {
        "used": used,
        "categories": db.query(Category).filter(Category.user_id == str(user.id)).count(),
        "limit": limit,
        "remaining": max(0, limit - used),
        "base": BASE_QUOTA,
        "bonus": int(user.quota_bonus or 0),
        "reward_each": INVITE_REWARD,
        "invites_rewarded": rewarded,
        "invites_left": max(0, MAX_REWARDED_INVITES - rewarded),
    }


def attribute_inviter(user: User, db: Session, inviter_id) -> bool:
    """登录时把"谁邀我来的"记在账号上；只记账，不发奖励。

    四条不认：没带参数、自己邀自己、已经有归属、名下已经有笔记。
    最后一条是给老用户的——他哪天从别人的分享链接进来一次，不能就此把归属改写到
    那个人名下，那笔奖励就凭空冒出来了。
    """
    try:
        inviter_pk = int(inviter_id)
    except (TypeError, ValueError):
        return False
    if inviter_pk <= 0 or inviter_pk == user.id or user.invited_by is not None:
        return False
    if db.get(User, inviter_pk) is None:
        return False
    if used_count(db, user) > 0:
        return False
    user.invited_by = inviter_pk
    db.commit()
    logger.info("邀请归因：invitee=%s inviter=%s", user.id, inviter_pk)
    return True


def credit_first_note(note: Note, db: Session, user: User) -> int:
    """被邀请人写下第一篇笔记 → 给邀请人 +10。返回本次实际到账篇数（0 = 没到账）。

    在笔记 commit 之后调用，判定条件就是"这条是他名下第一条"。重复调用不会重复
    到账：invitations.invitee_id 上有唯一约束，一个被邀请人只能成就一次。
    """
    if not user.invited_by:
        return 0
    already = (
        db.query(Invitation).filter(Invitation.invitee_id == user.id).first()
    )
    if already:
        return 0
    if used_count(db, user) != 1:
        return 0

    inviter = db.get(User, user.invited_by)
    if inviter is None or inviter.id == user.id:
        # 自己指向自己这种状态，登录那条路（attribute_inviter）本来就写不出来；
        # 这里再挡一次是因为结钱的判定不该依赖"上游不会漏"。
        return 0
    if rewarded_invites(db, inviter.id) >= MAX_REWARDED_INVITES:
        logger.info("邀请奖励已达上限，未到账：inviter=%s invitee=%s", inviter.id, user.id)
        return 0

    inviter.quota_bonus = int(inviter.quota_bonus or 0) + INVITE_REWARD
    db.add(
        Invitation(
            inviter_id=inviter.id,
            invitee_id=user.id,
            reward=INVITE_REWARD,
        )
    )
    db.commit()
    logger.info(
        "邀请奖励到账：inviter=%s +%d（现上限 %d）invitee=%s note=%s",
        inviter.id,
        INVITE_REWARD,
        quota_limit(inviter),
        user.id,
        note.id,
    )
    return INVITE_REWARD
