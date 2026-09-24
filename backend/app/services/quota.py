"""邀请归因：谁把新用户带进来、那个人是不是真的写下了第一篇。

口径（2026-09-24 定）：**笔记篇数不设上限**。原来那道 100 篇闸门，连同"邀请一位真写的
好友 +10 篇、最多记 5 次"这套兑换机制一起撤掉——免费产品拿篇数拦人没有收益，被挡住的
恰恰是写得最多的那批人。图片不落盘、不进对象存储，一条笔记在库里就是文字，不设上限的
代价只在数据库和长列表。

所以这个文件里只剩"记账"：`invitations` 表照写，用途从"发额度"变成"这次分享确实带来了
一个新的写作者"。`users.quota_bonus` 列就此停用——历史值原样留着，代码不再读它，也没有
再往上添的路径（删那一列要一次迁移，收益不值）。
"""
import logging

from sqlalchemy.orm import Session

from app.models.invitation import Invitation
from app.models.note import Note
from app.models.user import User

logger = logging.getLogger(__name__)


def used_count(db: Session, user: User) -> int:
    return db.query(Note).filter(Note.user_id == str(user.id)).count()


def quota_view(user: User, db: Session) -> dict:
    """「我的」页那几个数字的唯一来源。没有上限，所以只有已记条数与分类数。"""
    from app.models.category import Category

    return {
        "used": used_count(db, user),
        "categories": db.query(Category).filter(Category.user_id == str(user.id)).count(),
    }


def attribute_inviter(user: User, db: Session, inviter_id) -> bool:
    """登录时把"谁邀我来的"记在账号上；只记账，不发奖励。

    四条不认：没带参数、自己邀自己、已经有归属、名下已经有笔记。
    最后一条是给老用户的——他哪天从别人的分享链接进来一次，不能就此把归属改写到
    那个人名下，那笔账就凭空冒出来了。
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


def record_first_note(note: Note, db: Session, user: User) -> bool:
    """被邀请人写下第一篇笔记 → 记一笔邀请台账。返回是否记上了（False = 不算数）。

    在笔记 commit 之后调用，判定条件就是"这条是他名下第一条"。重复调用不会重复记账：
    invitations.invitee_id 上有唯一约束，一个被邀请人只能成就一次。
    """
    if not user.invited_by:
        return False
    already = (
        db.query(Invitation).filter(Invitation.invitee_id == user.id).first()
    )
    if already:
        return False
    if used_count(db, user) != 1:
        return False

    inviter = db.get(User, user.invited_by)
    if inviter is None or inviter.id == user.id:
        # 自己指向自己这种状态，登录那条路（attribute_inviter）本来就写不出来；
        # 这里再挡一次是因为记账不该依赖"上游不会漏"。
        return False

    db.add(
        Invitation(
            inviter_id=inviter.id,
            invitee_id=user.id,
            reward=0,
        )
    )
    db.commit()
    logger.info("邀请成账：inviter=%s invitee=%s note=%s", inviter.id, user.id, note.id)
    return True
