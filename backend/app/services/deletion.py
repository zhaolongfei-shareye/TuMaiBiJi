"""删掉"一个人"的全部数据——`/api/user/deactivate` 与 `DELETE /v1/account` 共用这一支。

为什么必须是一支而不是两份实现：Apple 5.1.1(v) 要求 App 内能删账号，而 iPhone 那一路的"人"是
`accounts` 那一行（站长 10-09 拍的乙：只有 Apple 身份的人**根本没有 `users` 行**）。小程序那条
老注销已经写了很久、范围是被十几把尺子钉着的；如果 `/v1` 自己再抄一遍"删哪七张表"，两边就会
分别长歪——最典型的歪法是漏一张，然后在现网留下"删了账号却还能查到我的笔记"这种话，
那正是 5.1.1(v) 审查最不能接受的一种。所以：**删什么只在这里说一次**，两个口只决定"删谁"。

`users` 由调用方给，语义也跟着调用方变：
- 小程序那一路传 `[user]` —— 他只能删自己那一行登录行和他名下的数据。
- `/v1` 那一路传这条 account 名下**全部**的 `users` 行 —— 删的是"这个人"，
  他在两个平台留的东西一起走。
这就是把参数写成列表而不是直接写 `user` 的原因：范围这件事必须显式传进来，不许在函数里猜。

`account_id` 是**那一格的值**，不是查出来的对象。这里不收 `Account | None`：`users.account_id`
有值而 `accounts` 里那一行已经不在（半截事务、手工清库、上一轮删到一半崩了）是这台服务器
唯一一种"账坏了"的形状，而注销恰好是修它的那一次——老 `/api` 那段代码按值删，所以它顺带把
留着的身份行摘掉，那个人下次微信登录还能重新建号。改成按对象判就等于把自愈撤了：身份行还
占着那个 openid 的唯一索引，`accounts.ensure_for_provider` 读到孤儿身份直接 RuntimeError
→ 那个人登录 500，比留垃圾行难看得多。

故意**不 commit**：删干净与引发它的那次确认必须在同一个事务里（同 `bump_generation` 的口径）。
调用方（路由）自己提交。
"""
import logging

from sqlalchemy.orm import Session

from app.models.account import Account, AccountIdentity
from app.models.asset import Asset, not_failed
from app.models.category import Category
from app.models.invitation import Invitation
from app.models.job import Job
from app.models.link_code import LinkCode
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.share import Share
from app.models.share_report import ShareReport
from app.models.user import User
from app.models.user_profile import UserProfile

logger = logging.getLogger(__name__)

# 顺序是**先子后父**，逐条写在下面的注释里，别打乱。
_BUSINESS_TABLES = (
    ("shares", Share),
    ("jobs", Job),
    ("notes", Note),
    # notes 删完才轮到它引用的两张：`notes.category_id → categories.id`、
    # `notes.cover_asset_id → assets.id`，方向都是 notes 指过去，所以这两张在后。
    ("categories", Category),
    ("assets", Asset),
    ("cards", NoteCard),
    ("profile", UserProfile),
)


def purge(db: Session, users: list[User], account_id: str | None) -> tuple[dict, list[str]]:
    """删净这些 `users` 行和 `account_id` 那条 account。返回 (每张表删掉的条数, 待清的云对象 fileID 清单)。

    `file_ids` 是客户端清云端对象的**唯一一份**清单：这台自建后端没有云开发凭据，只有客户端
    `wx.cloud.deleteFile` 删得动，而账号删掉之后再打任何接口都是 401——**这是最后一次机会**。
    所以清单必须在删之前抄，且必须跟着回体一起发回去。
    """
    uids = [str(user.id) for user in users]
    # 七张表**一律出现在回体里**，哪怕这个人一行数据都没有：只有 Apple 身份的那个人就是这种
    # （他连 `users` 行都没有，乙拍下来之后这是常态）。不预先摆平的话，键集合会随着"这个人
    # 有没有笔记"变。这一格现网**没人读**（实测：`grep -rn "\.deleted" miniprogram` 空，
    # `pages/me/me.js` 注销那段只把回体交给 `cloudUpload.dropFromDeleteRes`，它只取 `file_ids`），
    # 留着它是对账用的，而一份"随人变形"的对账数字下一次换客户端还得先判键在不在。
    deleted: dict[str, int] = {key: 0 for key, _ in _BUSINESS_TABLES}
    # 「人」那三格的键与上面七格同一句口径：**不许随"这一路带不带 account"变形**。2026-10-10
    # 拍甲之后 `/api` 在"名下还有第二行"时传 None，那时它们是 0 而不是消失——回体是给人对账的，
    # 键集合一变，下一个客户端就得先判"这个键今天该不该在"。
    deleted.update({"identities": 0, "link_codes": 0, "account": 0})

    # 举报行只挂 token、不挂外键（`share_reports.token`——撤掉的码也要收得到举报，这是刻意
    # 不设约束的理由），所以删 shares 之后再也问不出这个人公开过哪些码。先抄下来。
    # 配图与卡片对象同理，且都并进**同一份** `file_ids`（与 `routes/notes.py:delete_note`
    # 同一条决定：客户端只读那一个键）。历史行也一起带走——云上那些对象还占着全站配额。
    asset_ids: list[str] = []
    share_tokens: list[str] = []
    for uid in uids:
        asset_ids += [
            r[0]
            for r in db.query(Asset.object_key).filter(Asset.user_id == uid, not_failed()).all()
        ]
        asset_ids += [
            r[0]
            for r in db.query(NoteCard.object_key).filter(NoteCard.user_id == uid).all()
        ]
        # 名片那四格同理（2.1 起图在云上）。逐行读 JSON 列而不是在 SQL 里筛——`slots` 是一个
        # 数组，四格里哪格有图只有解出来才知道。
        for (slots,) in db.query(UserProfile.slots).filter(UserProfile.user_id == uid).all():
            for s in (slots or []):
                if s and s.get("file_id"):
                    asset_ids.append(s["file_id"])
        share_tokens += [r[0] for r in db.query(Share.token).filter(Share.user_id == uid).all()]

    # **表在外层、人在内层**：一张表一次把这批人删完（`user_id IN (…)`），不是一个人跑一轮。
    # "先子后父"那个顺序必须在**所有人之间**成立：反过来的双层循环（外层是人）会让第二个人的
    # shares/jobs 排在第一个人的 notes 之后。10-09 新那把外键尺子
    # （`tests/test_v1_account_deletion.py::Test外键强制下这一路走得通`）就是红在这一句上——
    # `DELETE FROM notes WHERE user_id='911'` 撞上还挂着的 `jobs.note_id`（那行 job 属于第二行）。
    # 老 `/api` 永远只传 `[user]`，两种写法同形，所以这一刀是 `/v1` 那一路多行才引出来的。
    if uids:
        for key, model in _BUSINESS_TABLES:
            deleted[key] = (
                db.query(model).filter(model.user_id.in_(uids)).delete()
            )

    # 排在 shares 之后、account 之前，语义就是"这个人公开过的码，收到的举报一起带走"。
    deleted["reports"] = 0
    if share_tokens:
        deleted["reports"] = (
            db.query(ShareReport)
            .filter(ShareReport.token.in_(share_tokens))
            .delete(synchronize_session=False)
        )

    # 邀请这一环必须在**删 users 行之前**跑完：回退奖励要 `db.get(User, inviter_id)` 读
    # **别人**那一行，而两个人互邀（或将来 iPhone 那侧也发邀请）时，"别人"可能就是这次
    # 一起删的另一行。原来 `/api` 只有 `[user]` 一行，读不到自己那一行的情况走不到。
    for user in users:
        _release_invitations(db, user)

    # 「人」那两张表也要跟着走。不删的后果不是留垃圾行：那个 openid 会一直被唯一索引占着，
    # 同一个人重新注册时插第二条身份直接撞库（把这一段撤掉试过，第二条身份当场
    # IntegrityError，红在 `tests/test_account_and_identity.py::Test注销连带`）。
    # 判的是**那一格的值在不在**而不是"查没查到对象"——见模块 docstring 里那段自愈。
    if account_id is not None:
        deleted["identities"] = (
            db.query(AccountIdentity).filter(AccountIdentity.account_id == account_id).delete()
        )
        # 死账号名下的码必须一起删：留着的话它还能被 redeem 一次，而 `find_usable` 会查出
        # `account_id` 指向一行已经不存在的 account——那时能给的只有 500。`merge_into` 里
        # 已经钉过同一句话；这一刀是抽公共函数时才发现 `/api` 那条**一直漏着**的（那条路由
        # 写下的时候这张表还不存在），钉在 `tests/test_v1_account_deletion.py`。
        deleted["link_codes"] = (
            db.query(LinkCode).filter(LinkCode.account_id == account_id).delete()
        )
        deleted["account"] = db.query(Account).filter(Account.id == account_id).delete()

    for user in users:
        db.delete(user)

    # 去重保序，理由同 `routes/notes.py:delete_note`：注销这一份最容易撞重复——
    # 同一张图既在 assets 里又在 note_cards 里（换过模板又换回来）时，两处各列一次。
    return deleted, list(dict.fromkeys(asset_ids))


def _release_invitations(db: Session, user: User) -> None:
    """回退他发给邀请人的奖励，并清掉两个方向的邀请台账。"""
    # 防止邀请奖励上限绕过：注销前先把该用户贡献给邀请人的 bonus 扣掉，
    # 这样反复注册→写笔记→注销→再注册的循环就无法累积无限奖励。
    for record in db.query(Invitation).filter(Invitation.invitee_id == user.id).all():
        inviter = db.get(User, record.inviter_id)
        if inviter is None:
            continue
        if inviter.quota_bonus < record.reward:
            # 正常情况下走不到：除了这里，没有别的地方会减 quota_bonus。真走到了说明
            # 台账和余额已经对不上，宁可不追讨也不能把余额扣成负数（负数会把上限压到
            # BASE_QUOTA 以下，那个人自己的笔记就存不下了）。留一条日志好事后对账。
            logger.error(
                "注销回退邀请奖励时发现余额不足，跳过：inviter=%s bonus=%s 应退=%s invitee=%s",
                inviter.id, inviter.quota_bonus, record.reward, user.id,
            )
            continue
        before = inviter.quota_bonus
        inviter.quota_bonus = before - record.reward
        logger.info(
            "注销时回退邀请奖励：inviter=%s -%d（%d → %d）invitee=%s",
            inviter.id, record.reward, before, inviter.quota_bonus, user.id,
        )

    # 邀请台账两个方向都删：留着被邀请人那条，等于把"谁邀的他"这件事留在一个已注销的
    # 账号之外；留着邀请人那条，奖励来源就查得到。两边都不该在账号消失后还留着。
    db.query(Invitation).filter(
        (Invitation.invitee_id == user.id) | (Invitation.inviter_id == user.id)
    ).delete()
    db.query(User).filter(User.invited_by == user.id).update({User.invited_by: None})
