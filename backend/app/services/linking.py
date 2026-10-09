"""把两个平台的身份合成一个"人"：短码 Redeem 与解绑的全部规则都在这一个文件里。

契约 §二 那四步（iPhone 生成短码 → 用户去小程序念 → 服务端把两条 identity 归到一个
account → 两边 token 全部作废）里，只有"归到哪一个"这句话是有歧义的，所以它必须有
**一个**出处。写在这里而不是写在路由里，是因为 `DELETE /v1/account/link/{provider}`
将来问的是同一个问题：这个人现在还算不算一个人。

主账号的选法（契约原文："谁已有笔记谁是主，两边都有则合并到较早创建的 account"）：
1. 只有一边有笔记 → 那一边是主。**数据不动**是这一条的全部意义：几百篇笔记的主人
   不该因为他在另一台设备上点了一下"关联 iPhone"就换了地方。
2. 两边都有笔记 → 较早创建的那个是主。
3. 两边都没笔记 → 也取较早创建的那个。契约没写这一种，但它是必然会出现的分支
   （两个人都是新号），而"随便哪一个"不是答案：结果必须只取决于库里已有的值，
   不然同一对账号在两次请求里可能得到相反的答案。
4. 两个创建时间**一模一样**（`accounts.created_at` 在 SQLite 上是秒级，同一秒里建出来的
   两条就会撞）→ 取传进来的第一个，也就是**发起这一趟的那条**（`redeem` 里是微信那条）。
   这一条不是凑出来的：`redeem` 固定按 `choose_main(db, mine, target)` 传参，而业务数据
   今天只可能挂在微信那条上，所以撞平的时候把主账号给微信那边是唯一不会搬坏数据的答案。
   钉它的尺子是 `tests/test_v1_auth_and_link.py::Test合并方向与吊销::test_创建时间一模一样_发起那一趟的一方是主`
   ——10-09 那批反向验证里，两条判据（"有笔记的那边是主"和"一张码只能消费一次"）因为
   这个平局**假绿**过，所以它必须既写在规则里、又有尺子，不能只留在注释里。

**笔记为什么不需要搬家**：业务表挂的是 `users.id`（整型），而 `users.account_id` 指的是
`accounts.id`。合并动的是"哪条 account 活着"和"哪个 users 行归到哪条 account"，
`notes.user_id` 一个字都不改，笔记自然跟着那个人走。这也是拍乙之前要先量清的一件事。
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.errors import UserError
from app.models.account import Account, AccountIdentity
from app.models.link_code import LinkCode
from app.models.note import Note
from app.models.user import User
from app.services import accounts, link_codes


class LinkRefused(UserError):
    """这一步不让过。`status_code` 是给路由翻成 HTTP 用的；文本按 UserError 的规矩，
    能原样弹给用户，不含栈、库名、别人的 openid。"""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def identity_providers(db: Session, account_id: str) -> list[str]:
    """这个人名下挂了哪些登录方式。**只回 provider 名**，`provider_uid` 一个字都不出去
    （契约 §二：openid 和 Apple 的 user identifier 不出现在给客户端的响应里）。"""
    rows = (
        db.query(AccountIdentity.provider)
        .filter(AccountIdentity.account_id == account_id)
        .order_by(AccountIdentity.provider)
        .all()
    )
    return [r[0] for r in rows]


def has_notes(db: Session, account_id: str) -> bool:
    """这个人名下有没有笔记。绕一圈是因为笔记挂在 `users.id` 上，不挂在 account 上：
    account → 它的 users 行 → 那些 user 的 notes。

    两处细节都是本仓既有的口径，不是我发明的：
    - `notes.user_id` 那一列是 `String(100)`，所以比较值必须转成 `str`（routes/user.py 里
      查 `categories` 的每一处都写 `str(user.id)`）。SQLite 会替你把整型隐式转成文本，
      Postgres 不会——在那里 `text = integer` 直接是"operator does not exist"。
    - 空 `IN` 在两种引擎上都不成立，所以先捞 id 再判空。
    """
    user_ids = [str(row[0]) for row in db.query(User.id).filter(User.account_id == account_id).all()]
    if not user_ids:
        return False
    return db.query(Note.id).filter(Note.user_id.in_(user_ids)).first() is not None


def _created_at(account: Account) -> datetime:
    # `created_at` 有 server_default，正常不会是 NULL；这里为 NULL 时**不许**当成 1970 年
    # 去和另一边比（那等于让一个时间戳坏掉的人永远当主账号），直接响。
    if account.created_at is None:
        raise LinkRefused("账号创建时间缺失，无法判断合并方向，请联系开发者", 500)
    value = account.created_at
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def choose_main(db: Session, a: Account, b: Account) -> tuple[Account, Account]:
    """返回 (留下的那个, 被并进去的那个)。规则写在文件头。"""
    a_notes, b_notes = has_notes(db, a.id), has_notes(db, b.id)
    if a_notes and not b_notes:
        return a, b
    if b_notes and not a_notes:
        return b, a
    return (a, b) if _created_at(a) <= _created_at(b) else (b, a)


def merge_into(db: Session, keep: Account, absorb: Account) -> None:
    """把 `absorb` 的身份、微信登录行、还没用过的短码都搬到 `keep` 上，然后删掉它。

    逐行走 ORM 而不是三条批量 UPDATE：这几张表每个账号名下都只有个位数的行，而批量
    update 不会同步已在 session 里的那些对象——调用方紧接着还要用同一个 User 对象发 token，
    读到旧的 `account_id` 就把人挂回一条**已经被删掉**的 account 上。

    `link_codes` 里那张死账号的码必须一起删：留着的话它还能被 redeem 一次，
    而 `find_usable` 会查出 `account_id` 指向一行不存在的 account——那时能给的只有 500。
    """
    for identity in db.query(AccountIdentity).filter(AccountIdentity.account_id == absorb.id).all():
        identity.account_id = keep.id
    for user in db.query(User).filter(User.account_id == absorb.id).all():
        user.account_id = keep.id
    db.query(LinkCode).filter(LinkCode.account_id == absorb.id).delete(synchronize_session=False)
    db.delete(absorb)


def redeem(db: Session, user: User, code: str) -> tuple[Account, bool]:
    """小程序拿着用户输入的 6 位码走过来。返回 (这个人现在归属的 account, 是否发生了合并)。

    顺序是有讲究的：**先消费码、再动账**。反过来（先合并再标记用过）的话，合并成功但
    mark_used 因为并发失败时，同一对账号会被第二次 redeem 再合一遍——而第二次进来时
    `absorb` 已经不存在了，能给的只有 500。先消费则失败面只剩"码作废了但账没合"，
    用户在 iPhone 上再生成一张就是了。
    """
    row = link_codes.find_usable(db, code)
    if row is None:
        raise LinkRefused("短码不对、已经用过，或者过期了", 400)
    if not link_codes.mark_used(db, row):
        raise LinkRefused("这张短码刚刚已经被用过了", 409)

    mine = accounts.ensure_for_user(db, user)
    target = db.query(Account).filter(Account.id == row.account_id).first()
    if target is None:
        # 生成短码之后、redeem 之前，那个人在 iPhone 上删了账号。账没坏，是这一条请求来晚了。
        raise LinkRefused("这个 iPhone 账号已经不在了", 404)
    if mine.id == target.id:
        # 同一个 account 的两条登录方式已经在一块了（他之前绑过，或者 iPhone 上就是用这个微信
        # 登的）。幂等返回，不重复抬代次——否则"再点一次关联"会把他自己也踢下线。
        return mine, False

    # 一对一的闸门：一个 iPhone 账号只能挂一个微信号。放过去的话，两个真人的笔记会并成一份，
    # 而"我的笔记"里凭空多出另一个人的东西——这是不可逆的数据混合，必须在这里响。
    if "wechat" in identity_providers(db, target.id):
        raise LinkRefused("这个 iPhone 已经关联了一个微信号，一个 iPhone 只能关联一个", 409)

    keep, absorb = choose_main(db, mine, target)
    merge_into(db, keep, absorb)
    # 代次必须在**搬完之后**抬：`bump_generation` 抬的是 keep 这一格加"当前挂在 keep 名下
    # 的所有 users 行"。先抬后搬的话，被并掉那个人手里的微信 token 还活着，
    # 而契约 §二 第 4 步要的是两侧旧 token **全部**失效。
    accounts.bump_generation(db, keep)
    db.commit()
    # 第二个值 = 这次是不是真的把两条 account 并成了一条。走到这里必然是并了（本来就是一条的
    # 那种情况在上面已经原样返回），所以恒为 True；客户端真正要拿的是第一个值——
    # 它现在该用哪个 account 重新登录。契约 §二 第 3 步"在响应里说明合并发生了"就落在这一位。
    return keep, True


def unbind(db: Session, account: Account, provider: str) -> Account:
    """摘掉某一条登录方式（契约 §二"可撤销"）。返回原 account。

    最后一条不许摘：那样会留下一行没有任何登录方式的 `accounts`，谁也登不进去、
    谁也删不掉（`DELETE /v1/account` 需要带 token，而带 token 需要能登录）。
    要真想走人，走删账号那条路。
    """
    rows = db.query(AccountIdentity).filter(
        AccountIdentity.account_id == account.id,
        AccountIdentity.provider == provider,
    ).all()
    if not rows:
        raise LinkRefused(f"这个账号没有关联过 {provider}", 404)
    total = db.query(AccountIdentity).filter(AccountIdentity.account_id == account.id).count()
    if total == len(rows):
        raise LinkRefused("这是最后一种登录方式，解绑就登不进来了；要删账号请走删除账号", 409)
    for row in rows:
        db.delete(row)
    accounts.bump_generation(db, account)
    db.commit()
    return account
