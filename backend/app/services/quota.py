"""MIND（积分）与邀请台账：规则只写在这一个文件里，路由和 worker 都只调这里的函数。

口径（2026-10-01 站长改定，原话"拆掉后端100篇，不同用户转存都加分，但同一个用户只算一次。
其他的照常。积分规则，可以在官网公布，小程序不需要"）：
- **笔记不限量**。原来那道"每人 100 篇、第 101 篇四条入口当场拦下"的闸门撤掉了，
  100 变成 MIND 的起始值，不再是一个上限；
- 带来一个**新的写作者**给邀请人 **+10**：他动笔写下自己名下第一条才算，
  一个人一辈子只成就一次（`source_note_id IS NULL` 那半边唯一索引）；
- **有人把某一篇转存进自己库里**给原作者 **+1**：不同用户各算一次，
  同一个人对同一篇只算一次（`source_note_id` 非空那半边按"这篇 × 这个人"唯一）。
  转存这条不再要求对方是新用户——老用户转存也算。

能挡的是"同一个人对同一篇反复转存刷分"，挡不掉的是注册小号互转（微信 openid 人手一个），
所以不设总闸、也不设次数上限，跟 +10 那条一个 posture。

起始值、两档奖励都只写在这里，客户端不硬编码：它读 GET /api/user/quota 拿回来的 mind。
"""
import logging

from sqlalchemy import distinct, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.invitation import Invitation
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

logger = logging.getLogger(__name__)

BASE_QUOTA = 100        # MIND 的起始值（不再是"每人几篇"的上限）
INVITE_REWARD = 10      # 带来一个新的写作者
IMPORT_REWARD = 1       # 有人把某一篇转存进自己库里


def mind_score(user: User) -> int:
    """这一页右下角那个大数字。"""
    return BASE_QUOTA + int(user.quota_bonus or 0)


def used_count(db: Session, user: User) -> int:
    return db.query(Note).filter(Note.user_id == str(user.id)).count()


def rewarded_invites(db: Session, inviter_id: int) -> int:
    """"这个人替我带来了几个新写作者"——只数动笔那一路。

    2026-10-01 加了转存 +1 之后，台账里混着两种行；不加这个过滤，字段名就成了假话
    （别人转存一次也会被算成"带来一个人"）。
    """
    return (
        db.query(Invitation)
        .filter(Invitation.inviter_id == inviter_id, Invitation.source_note_id.is_(None))
        .count()
    )


def shared_notes(db: Session, user: User) -> int:
    """当前**公开中**的笔记有几篇（首页那一列「分享」）。

    站长 10-01 定这句："数按照真实来算，避免用户刷量"。不数"累计发出过几张码"——
    同一篇笔记开→撤→开就能把那个数自己刷大，而公开状态是个状态量，撤掉的码不该还算在脸上。
    只认 `is_active`：分享可见性那一轮已经定死"公开不公开只由这一列说话"。
    按笔记去重，一篇一张有效码是数据库索引保证的，去重只是把这层语义写在这句里。
    """
    return (
        db.query(func.count(distinct(Share.note_id)))
        .filter(Share.user_id == str(user.id), Share.is_active.is_(True))
        .scalar()
        or 0
    )


def saved_by_users(db: Session, user: User) -> int:
    """有**多少个不同的人**把你名下的笔记存进了他们自己的库（首页那一列「收藏」）。

    台账里的 `inviter_id` 就是那篇的作者（`credit_import` 结那 +1 分时就是这么指的），
    所以这里不用去 join notes——何况 `source_note_id` 故意不带外键：源笔记后来被删掉，
    不该把"曾经有人收藏过你"这笔账一起带走。

    按人去掉重：同一个人存了你 10 篇只算 1 个人在收藏，不然一个人上头就能顶十个人。
    挡不住的还是注册小号互转（微信 openid 人手一个），和 +1 分那条同一个 posture。
    """
    return (
        db.query(func.count(distinct(Invitation.invitee_id)))
        .filter(Invitation.inviter_id == user.id, Invitation.source_note_id.isnot(None))
        .scalar()
        or 0
    )


def quota_view(user: User, db: Session) -> dict:
    """`limit` / `remaining` 是留给线上老客户端的：1.5.0 那一版「我的」读的是
    `${used}/${limit}`，字段删了那一行会显示成 "37/undefined"。闸门已经撤了，
    这两个数不再拦任何人，等线上换到读 `mind` 的版本之后就可以一起删掉。
    """
    used = used_count(db, user)
    mind = mind_score(user)
    rewarded = rewarded_invites(db, user.id)
    from app.models.category import Category

    return {
        "used": used,
        "categories": db.query(Category).filter(Category.user_id == str(user.id)).count(),
        "mind": mind,
        "limit": mind,
        "remaining": max(0, mind - used),
        "base": BASE_QUOTA,
        "bonus": int(user.quota_bonus or 0),
        "reward_each": INVITE_REWARD,
        "import_each": IMPORT_REWARD,
        "invites_rewarded": rewarded,
        # 首页顶部那三列的后两列（第一列就是上面的 used）。两个都是状态量 / 按人去重，
        # 不给"自己开关一下就能 +1"留口子。
        "shares_active": shared_notes(db, user),
        "saved_by_users": saved_by_users(db, user),
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


def _is_his_first_note(db: Session, user: User) -> bool:
    """刚 commit 完这条，他名下正好一条 → 这就是他动笔写下的第一篇。"""
    return used_count(db, user) == 1


def _settle(db: Session, inviter: User, invitee: User, source_note_id, reward: int, why: str) -> int:
    """两条路共用的那一段：记一笔台账，给收账的人加这一档分。

    唯一索引是最后一道闸。两个请求真同时进来时（同步路由跑在线程池里，确实会并发），
    后到的那个会在 commit 撞上 IntegrityError，由公开入口那层 `_never_breaks` 兜住：
    回滚的只有这一笔台账和这一笔加分，笔记本身早就 commit 过了，
    所以用户那边仍然只看见"存好了"。这里不留 except——留了就成了两层一样的兜底，
    而变异检查会告诉你其中一层删掉行为不变（那就是没在测东西）。

    余额走 SQL 侧自增，不在 Python 里"读出来加完写回去"：那样两笔并发各自读到旧值、
    后写的把先写的覆盖掉，台账记了 6 行而余额只加 1（临时库 6 线程真并发实测过）。
    自增和 INSERT 在同一个事务里，撞索引时一起回滚，不会留下"分了加了、账没记"。
    """
    db.add(
        Invitation(
            inviter_id=inviter.id,
            invitee_id=invitee.id,
            source_note_id=source_note_id,
            reward=reward,
        )
    )
    db.execute(
        update(User).where(User.id == inviter.id).values(quota_bonus=User.quota_bonus + reward)
    )
    db.commit()
    logger.info(
        "MIND 到账（%s）：收账人=%s +%d（现 %d）来人=%s 源笔记=%s",
        why, inviter.id, reward, mind_score(inviter), invitee.id, source_note_id,
    )
    return reward


def _credit_first_note(note: Note, db: Session, user: User) -> int:
    """被邀请人自己动笔写下第一篇笔记 → 给邀请人 +10。返回本次实际到账分（0 = 没到账）。

    在笔记 commit 之后调用。一个人只成就一次这件事由数据库兜：动笔那一路
    `source_note_id` 留空，`invitee_id` 上的部分唯一索引（只钉空行）保证同一个人
    第二次动笔也结不出第二笔。
    """
    if not user.invited_by or not _is_his_first_note(db, user):
        return 0

    inviter = db.get(User, user.invited_by)
    if inviter is None or inviter.id == user.id:
        # 自己指向自己这种状态，登录那条路（attribute_inviter）本来就写不出来；
        # 这里再挡一次是因为结钱的判定不该依赖"上游不会漏"。
        return 0
    return _settle(db, inviter, user, None, INVITE_REWARD, "动笔首篇")


def _credit_import(db: Session, importer: User, source_note_id) -> int:
    """有人把某一篇转存进自己库里 → 给那篇的作者 +1。

    口径（2026-10-01 改定）：**不同用户各算一次，同一个用户对同一篇只算一次**。
    不再要求转存的人是新用户——老用户转存也算，所以原来那句"他名下正好一条"
    从这条路上撤掉了。防线从"一篇一辈子一次"换成"一篇 × 一个人一次"：
    `source_note_id` 非空那半边的复合唯一索引。

    挡得住同一个人反复转存刷分，挡不住注册小号互转（微信 openid 人手一个）——
    这一条和 +10 那条是同一个 posture，不设总闸也不设上限。
    """
    try:
        src = db.get(Note, int(source_note_id))
    except (TypeError, ValueError):
        return 0
    if src is None:
        return 0

    try:
        author_pk = int(src.user_id)
    except (TypeError, ValueError):
        return 0
    if author_pk == importer.id:
        # 自己转自己那篇不算：转存入口本来就只给别人看的那篇才出现，
        # 但接口能直接被调，所以这一刀在这里补上。
        return 0
    inviter = db.get(User, author_pk)
    if inviter is None:
        return 0
    already = (
        db.query(Invitation)
        .filter(Invitation.source_note_id == src.id, Invitation.invitee_id == importer.id)
        .first()
    )
    if already is not None:
        # 索引也会挡，先查一次是为了把日志说清楚：这是"同一个人第二次转同一篇"，
        # 不是并发撞车。
        logger.info("这个人已经因为这篇得过分，未到账：源笔记=%s 作者=%s 来人=%s", src.id, inviter.id, importer.id)
        return 0
    return _settle(db, inviter, importer, src.id, IMPORT_REWARD, "转存")


def credit_first_note(note: Note, db: Session, user: User) -> int:
    """公开入口：结不到账绝不能把一个已经存好的笔记回成 500。判据在 `_credit_first_note`。"""
    return _never_breaks(db, "动笔首篇", _credit_first_note, note, db, user)


def credit_import(db: Session, importer: User, source_note_id) -> int:
    """公开入口：同上，判据在 `_credit_import`。"""
    return _never_breaks(db, "转存", _credit_import, db, importer, source_note_id)


def _never_breaks(db: Session, what: str, fn, *args) -> int:
    """只兜 `IntegrityError` 是不够的。

    API 与 worker 共用同一个 SQLite 文件，`database is locked` 是 OperationalError：
    那时候笔记已经 commit 过了，让它冒到路由上就是回 500——用户重试会多存一份，
    而那笔分因为名下条数变了再也结不出来。所以这里把一切异常都收在"这笔没结成"，
    原文只进日志。**笔记存好了这件事，比分数到没到账重要。**
    """
    try:
        return fn(*args)
    except IntegrityError:
        db.rollback()
        logger.info("这一笔已被并发的那趟记走，未重复到账：%s", what)
        return 0
    except Exception:
        db.rollback()
        logger.exception("MIND 结算失败（笔记已保存，不影响用户）：%s", what)
        return 0
