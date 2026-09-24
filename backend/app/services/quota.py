"""笔记额度与邀请奖励：规则只写在这一个文件里，路由和 worker 都只调这里的函数。

口径（2026-09-24 定，站长原话"100篇基础+分享好友，好友发一篇即可激活，基础增加10篇"
"其他朋友如果是新用户，只要转存你的笔记也可以加10篇，但每篇笔记只能加一次"）：
- 每人名下 100 篇，超出后四条入库入口（手写 / 链接 / 截图 / 转存别人的）一律当场拦下；
- 带来一个**新的写作者**给邀请人 +10 篇。两条路算数：他动笔写下自己第一篇，
  或者他直接把分享页上那篇转存进自己库里——两条都是"这个人真的开始用起来了"。
  只是打开看看不算；
- 同一个被邀请人一辈子只成就一次（`invitee_id` 唯一），**同一篇笔记也只挣一次**
  （转存那条要指名是哪篇带来的，`source_note_id` 上的部分唯一索引）；
- 带来几个人不限，不设次数上限。拦套利的是"一人一次 + 一篇一次"这两条，
  不是总闸——注册小号自邀自写这条路堵不掉（微信 openid 人手一个），
  能堵的是每个小号只能替别人挣一次。

上限、奖励这两个数都在这里，客户端不硬编码：它读 GET /api/user/quota 拿回来。
"""
import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import UserError
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.user import User

logger = logging.getLogger(__name__)

BASE_QUOTA = 100
INVITE_REWARD = 10


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
    raise UserError(f"已达 {limit} 篇上限，分享好友可再得 {INVITE_REWARD} 篇")


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


def _first_note_of(db: Session, user: User) -> bool:
    """这条是不是他名下第一条，而且他以前没替任何人成就过。

    后半个条件是给"一人只算一次"兜底的：动笔那条和转存那条是两次调用，中间没有
    别的机制阻止同一个人被记两笔。真正的防线是 `invitations.invitee_id` 唯一约束。
    """
    if used_count(db, user) != 1:
        return False
    return db.query(Invitation).filter(Invitation.invitee_id == user.id).first() is None


def _settle(db: Session, inviter: User, invitee: User, source_note_id, why: str) -> int:
    """两条路共用的那一段：记一笔台账，给邀请人 +10。

    唯一索引是最后一道闸。两个请求真同时进来时（同步路由跑在线程池里，确实会并发），
    后到的那个会在 commit 撞上 IntegrityError——这里回滚掉的只有这一笔台账，
    笔记本身早就 commit 过了，所以用户那边仍然只看见"存好了"。
    """
    inviter.quota_bonus = int(inviter.quota_bonus or 0) + INVITE_REWARD
    db.add(
        Invitation(
            inviter_id=inviter.id,
            invitee_id=invitee.id,
            source_note_id=source_note_id,
            reward=INVITE_REWARD,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.info("这一笔已被并发的那趟记走，未重复到账：inviter=%s invitee=%s", inviter.id, invitee.id)
        return 0
    logger.info(
        "邀请奖励到账（%s）：inviter=%s +%d（现上限 %d）invitee=%s 源笔记=%s",
        why,
        inviter.id,
        INVITE_REWARD,
        quota_limit(inviter),
        invitee.id,
        source_note_id,
    )
    return INVITE_REWARD


def credit_first_note(note: Note, db: Session, user: User) -> int:
    """被邀请人自己动笔写下第一篇笔记 → 给邀请人 +10。返回本次实际到账篇数（0 = 没到账）。

    在笔记 commit 之后调用，判定条件就是"这条是他名下第一条、且他还没替别人成就过"。
    这一条路没有"哪篇笔记带来的"可指（他是自己写的），所以源笔记留空，
    同一篇只算一次的约束只管转存那条。
    """
    if not user.invited_by or not _first_note_of(db, user):
        return 0

    inviter = db.get(User, user.invited_by)
    if inviter is None or inviter.id == user.id:
        # 自己指向自己这种状态，登录那条路（attribute_inviter）本来就写不出来；
        # 这里再挡一次是因为结钱的判定不该依赖"上游不会漏"。
        return 0
    return _settle(db, inviter, user, None, "动笔首篇")


def credit_import(db: Session, importer: User, source_note_id) -> int:
    """新用户把别人分享的那篇转存进自己库里 → 给那篇的作者 +10。

    和 credit_first_note 是同一本账：同一个人不管是动笔还是转存，一辈子只成就一次；
    多出来的一条是**同一篇笔记只挣一次**（数据库上 `source_note_id` 的部分唯一索引），
    所以把一篇热门的笔记发给一百个人转存，作者拿到的还是 10 篇，不是 1000。

    "新用户"用的是同一个口径：这次转存之前他名下正好一条（就是刚转存的这条）。
    """
    try:
        src = db.get(Note, int(source_note_id))
    except (TypeError, ValueError):
        return 0
    if src is None or not _first_note_of(db, importer):
        return 0

    try:
        author_pk = int(src.user_id)
    except (TypeError, ValueError):
        return 0
    if author_pk == importer.id:
        return 0
    inviter = db.get(User, author_pk)
    if inviter is None:
        return 0
    if (
        db.query(Invitation)
        .filter(Invitation.source_note_id == src.id)
        .first()
        is not None
    ):
        # 已经有一位朋友因为这篇得过了，索引也会挡，但先查能把日志说清楚。
        logger.info("这篇笔记已经挣过一次奖励，未到账：源笔记=%s 作者=%s", src.id, inviter.id)
        return 0
    return _settle(db, inviter, importer, src.id, "转存")
