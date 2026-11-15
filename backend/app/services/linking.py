"""把两个平台的身份合成一个"人"：短码 Redeem、绑邮箱、解绑的全部规则都在这一个文件里。

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
from app.models.account_password import AccountPassword
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
    - 空 `IN` 先挡住再查。10-09 实测过这句的理由（原来这里写的是"空 IN 在两种引擎上都不成立"，
      是假话）：SQLAlchemy 会把空集合展开成一个恒假条件，SQLite 上是
      `user_id IN (SELECT 1 FROM (SELECT 1) WHERE 1!=1)`、Postgres 上是 `user_id IN (NULL) AND (1 != 1)`，
      两种引擎都**正常返回零行**、不报错。所以这道 `if not user_ids` 不是 correctness 闸门，
      它买的是"这个人的名下没有 users 行"这句话在代码里看得见，而不是埋在展开出来的 SQL 里。
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

    口令那一行（`account_passwords`）跟着人走，但一个 account 只能有一行（那一列唯一）。
    keep 已经有了 ⇒ 被并掉那条的口令**与它的 password 身份行一起**摘掉：只删口令行会留下
    一个"念得出登录名、却永远登不进去"的名字。两样一起摘的口径同 `unbind`。
    """
    keep_pwd = db.query(AccountPassword).filter(AccountPassword.account_id == keep.id).first()
    absorb_pwd = db.query(AccountPassword).filter(AccountPassword.account_id == absorb.id).first()
    if absorb_pwd is not None:
        if keep_pwd is None:
            absorb_pwd.account_id = keep.id
        else:
            db.delete(absorb_pwd)
            for row in db.query(AccountIdentity).filter(
                AccountIdentity.account_id == absorb.id,
                AccountIdentity.provider == "password",
            ).all():
                db.delete(row)
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
    # 判据问的是**"这条 account 里还有没有第二个微信的人"**，所以两样都要看：身份行
    # (`account_identities`) 和登录行 (`users.account_id`)。10-09 独立审只看到前者那一半被
    # 解绑掏空、后者还挂着一个人和几百篇笔记，于是闸门形同虚设、第二个人顺利并进来（P0-1）。
    if "wechat" in identity_providers(db, target.id) or users_of(db, target.id):
        raise LinkRefused("这个 iPhone 已经关联了一个微信号，一个 iPhone 只能关联一个", 409)

    keep, absorb = choose_main(db, mine, target)
    merge_into(db, keep, absorb)
    # ⚠ 这一句 `flush` 与 `bind_email` 里那句是同一条命：`SessionLocal` 是 `autoflush=False`，
    # 而 `merge_into` 搬 `users.account_id` 走的是 ORM 赋值——不 flush 的话紧随其后的
    # `bump_generation` 那句 `WHERE users.account_id = keep.id` 打到库上读到的是**搬之前**的库面。
    # 主账号是 iPhone 那一条时（`choose_main` 完全可能选出它：那边有笔记、或两边都没笔记但那边
    # 更早创建），发起者自己的微信登录行正是这一趟刚搬过来的 ⇒ 他的 `users.generation` 没被抬 ⇒
    # **他手里那把旧钥匙在归属已经变了之后照样开门**，而契约 §二 第 4 步要的是两侧全部失效。
    # `test_主账号换成_iphone_时发起者那把老钥匙也失效` 钉这一发；`db.commit()` 在下一行，
    # 所以 flush 不改变事务边界，只改变那两句 SELECT 看得见什么。
    db.flush()
    # 代次必须在**搬完之后**抬：`bump_generation` 抬的是 keep 这一格加"当前挂在 keep 名下
    # 的所有 users 行"。先抬后搬的话，被并掉那个人手里的微信 token 还活着，
    # 而契约 §二 第 4 步要的是两侧旧 token **全部**失效。
    accounts.bump_generation(db, keep)
    db.commit()
    # 第二个值 = 这次是不是真的把两条 account 并成了一条。走到这里必然是并了（本来就是一条的
    # 那种情况在上面已经原样返回），所以恒为 True；客户端真正要拿的是第一个值——
    # 它现在该用哪个 account 重新登录。契约 §二 第 3 步"在响应里说明合并发生了"就落在这一位。
    return keep, True


def users_of(db: Session, account_id: str) -> list[User]:
    """这条 account 名下那些**微信登录行**。`/v1` 这一路不看它，但闸门必须看：
    `users.account_id` 是"这个人归哪条 account"的另一个答案，只看 identity 会漏。

    筛 `openid is not None` 是必须的，不是顺手：`users` 那张表将来也会挂**只有 Apple 身份**
    的人的行（阶段3 同步落地之后笔记仍然按 `users.id` 挂，那种行 `openid` 为 NULL，
    `test_两边都有笔记_取较早创建的那个` 钉的就是这个形状）。把那种行也算成"这个 iPhone
    已经关联过一个微信号"，闸门就会把每一次正常合并都挡死——我 10-09 补这一句时就是这样
    一脚踩翻了那三条已有用例。闸门问的是"还有没有**别的真人微信**挂在这里"。
    """
    return db.query(User).filter(
        User.account_id == account_id,
        User.openid.isnot(None),
    ).all()


def detach_users_of(db: Session, account_id: str) -> int:
    """把这条 account 名下的微信登录行**摘干净**（`account_id` 置空）。返回摘掉的行数。

    摘了身份却不摘登录行会留下一个分家状态：那个人按 `users.account_id` 还归这条 account、
    按 `account_identities` 已经不归了。10-09 独立审就是抓在这一句上（P0）——那条状态下
    闸门（只看 identity）看不见还挂着的人，第二个人拿一枚新码就能把两个真人的笔记并成一份。
    所以解绑必须是**两样一起摘**，而不是只删那一行身份。

    范围跟着 `users_of` 走，只摘**带 openid 的那些行**：一条 `openid` 为 NULL 的 `users` 行
    是 iPhone 那个人自己的行，不是"微信绑定"，摘 Apple 那一条登录方式时不该动它。
    """
    rows = users_of(db, account_id)
    for row in rows:
        row.account_id = None
    return len(rows)


def unbind(db: Session, account: Account, provider: str) -> Account:
    """摘掉某一条登录方式（契约 §二"可撤销"）。返回原 account。

    最后一条不许摘：那样会留下一行没有任何登录方式的 `accounts`，谁也登不进去、
    谁也删不掉（`DELETE /v1/account` 需要带 token，而带 token 需要能登录）。
    要真想走人，走删账号那条路。

    摘掉微信那一条时，这个人的 `users` 行会跟着脱离这条 account——那才是"解绑"两个字
    的真实意思：**他带着自己的笔记回到"只有微信"的那个人**，下次从小程序登录时
    `ensure_for_user` 会给他立一条新 account（或对上已有的那条微信身份）。笔记不搬：
    业务表挂的是 `users.id`，人走数据走。如果只删身份行、把 `users` 行留在原 account 上，
    留在手里的那把微信钥匙还能读那些笔记，而"这个人算哪条 account"从此有两个答案。
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
    # 代次先抬、再摘人。今天这一句顺序**不咬人**，而这是量出来的不是推的：`SessionLocal`
    # 是 `autoflush=False`，`detach_users_of` 只改了内存里的对象，`bump_generation` 那句
    # SELECT 打到库上时 `account_id` 还是旧值，所以那一行照样被抬——反向验证 S3 把两句调过来，
    # 判据仍然绿（10-09 实测，见 probes/反向验证-阶段2-2.sh 头部那条清单）。
    # 但把 bump 放在前面不靠这个巧合：哪天有人在这两句之间加一次 flush/commit、或者把
    # detach 换成批量 update，顺序立刻就开始决定结果——那时"人已经被摘走、代次抬不到他"
    # 就是字面上的"他手里那把旧钥匙还活着"。
    accounts.bump_generation(db, account)
    if provider == "wechat":
        detach_users_of(db, account.id)
    for row in rows:
        db.delete(row)
    db.commit()
    return account


# ---- 把一枚验过归属的邮箱绑到当前这个人身上 ----

def email_provider_uid(email_addr: str) -> str:
    """邮箱那条身份的 `provider_uid` = `email:<小写地址>`。

    前缀与转小写都不是随手写的：`services/email.py` 头部钉过"裸邮箱会与别的 provider 撞",
    而 `v1_auth.py:364`（H5 邮箱**登录**）早就按 `email:{addr}` 建号了。绑定与登录必须算出
    **同一串**——差一个前缀，同一个人同一枚邮箱就会落出两条 account，"绑上就打通"那句是假话。
    """
    return f"email:{email_addr.strip().lower()}"


def real_wechat_users(db: Session, account_id: str) -> list[User]:
    """这条 account 名下**真正用微信登录**的那些 `users` 行。

    与 `users_of` 差一句筛子，而这一句决定这个功能能不能用：H5 那四枝（游客／手机号／
    邮箱／口令）把 `provider_uid` 直接塞进了 `users.openid`（`v1_auth.py:207/:266/:371/:468`），
    那些串开头是 `phone:`／`guest:`／`email:`／`pwd:`。只看 `openid is not None` 的话，
    "先在安卓上用过邮箱、再回小程序绑同一枚邮箱"这条**本该合并**的路会被当成
    "这里已经有一个微信真人了"而当场 409。冒号是那些前缀与微信 openid 之间唯一稳定的分界。
    """
    return [row for row in users_of(db, account_id) if ":" not in (row.openid or "")]


def _drop_other_emails(db: Session, account_id: str, keep_uid: str) -> int:
    """摘掉这条 account 上除 `keep_uid` 之外的 email 身份行，返回摘掉的条数。

    一个人只留一枚邮箱：`GET /v1/account` 那一句"绑了没有"、以及"下次拿这枚邮箱登进来
    的是谁"，都只在这条不变量成立时才有唯一答案。留两枚的话界面会念出其中一枚而另一枚
    照样能登录，那不是"多一个入口"，是两个人共用一份笔记还看不见彼此。
    """
    rows = db.query(AccountIdentity).filter(
        AccountIdentity.account_id == account_id,
        AccountIdentity.provider == "email",
    ).all()
    stale = [row for row in rows if row.provider_uid != keep_uid]
    for row in stale:
        db.delete(row)
    return len(stale)


def bind_email(db: Session, user: User, email_addr: str) -> tuple[Account, bool]:
    """把一枚**已经收过验证码**的邮箱挂到当前这个人身上。返回 (归属的 account, 是否并了账)。

    调用方（`POST /v1/account/email/bind`）负责先验码——这一支不再看 Redis，它只回答
    "这个人现在算哪条 account"，与 `redeem` 是同一个问题，所以规则也住在这一个文件里。

    三种库面状态，代价不同，分开走：

    ① **这枚邮箱在库里没有主人** ⇒ `add_identity` 挂到当前 account 上，**不抬代次**。
       与 `/v1/auth/upgrade`（游客号设口令）同一条理由：加一种登录方式不是归属变更，
       手里这把钥匙应当继续能用。
    ② **这枚邮箱就是当前这个人已经绑的那一枚** ⇒ 原样返回，一行不写。他多点一次"绑定"
       不该把他踢下线，也不该把 `verified_at` 刷新成今天（那格记的是"什么时候验过归属"）。
    ③ **这枚邮箱属于另一条 account**（他在安卓／iPhone 上用邮箱登过）⇒ 这才是"打通多端"
       真正发生的那一支：先过一对一闸门（那条 account 名下已有**别的微信真人**就 409，
       两个真人的笔记并成一份是不可逆的），再按 `choose_main`／`merge_into` 并账，
       最后抬一次代次。方向规则与 `redeem` 共用同一支函数，不在此处另写一遍。

    换绑（这一支的 `user` 原来绑着 a@x、现在改绑 b@y）不单独成条：①与③之后各接一次
    `_drop_other_emails`，把 a@x 摘掉。摘旧登录方式按 `unbind` 的口径**要抬代次**——
    从那条身份换来的钥匙不能再开门；③本来就抬，①只在真摘掉旧邮箱时才抬。
    """
    mine = accounts.ensure_for_user(db, user)
    uid = email_provider_uid(email_addr)
    holder = db.query(AccountIdentity).filter(
        AccountIdentity.provider == "email",
        AccountIdentity.provider_uid == uid,
    ).first()

    if holder is not None and holder.account_id == mine.id:
        return mine, False

    target = None
    if holder is not None:
        target = db.query(Account).filter(Account.id == holder.account_id).first()
        if target is None:
            # 身份行指着一条不存在的 account：账坏了，不在这里猜（同 `ensure_for_provider` 那句）。
            raise LinkRefused("这个邮箱的归属记录坏了，请联系开发者", 500)
        if "wechat" in identity_providers(db, target.id) or real_wechat_users(db, target.id):
            raise LinkRefused("这个邮箱已经绑在另一个微信号上了，一个邮箱只能属于一个人", 409)

    if target is None:
        try:
            accounts.add_identity(db, mine, "email", uid, verified=True)
        except accounts.IdentityTaken:
            # ①与③之间隔了几毫秒，另一个人恰好把同一枚邮箱绑走了（他验得过那封邮件）。
            # 闸门读的是我这一趟开始时的库，并发时它会说错——所以这里再认一次真答案。
            db.rollback()
            raise LinkRefused("这个邮箱刚刚已经绑到别的账号上了", 409)
        if _drop_other_emails(db, mine.id, uid):
            accounts.bump_generation(db, mine)
        db.commit()
        return mine, False

    keep, absorb = choose_main(db, mine, target)
    merge_into(db, keep, absorb)
    # ⚠ 这一句 `flush` 不是卫生代码，它挡的是一类**静默不生效**：`SessionLocal` 是
    # `autoflush=False`（`db/database.py`），而 `merge_into` 搬身份行与登录行走的是 ORM 赋值——
    # 不 flush 的话，紧随其后的两次 SELECT 读到的仍是**搬之前**的库面：
    # `_drop_other_emails` 看不见从对面搬过来的那枚邮箱，`bump_generation` 更致命，它按
    # `users.account_id == keep.id` 逐行抬代次，看不见刚搬过来的登录行 ⇒ 对面那台设备手里
    # 的 legacy token 在"归属已经变了"之后照样开门，而契约 §二 第 4 步要的是两侧全部失效。
    # `redeem` 今天撞不到这一发，因为被并掉的 iPhone 那侧按拍乙**没有 `users` 行**；
    # 邮箱这一侧有（H5 邮箱登录就是靠那行存在的），所以这条路上必须显式 flush。
    db.flush()
    # `merge_into` 已经把两边其余的 email 身份行一起搬到 keep 上了，所以"只留这一枚"
    # 在这一处摘就够了，不必在合并之前分两侧各摘一遍。
    _drop_other_emails(db, keep.id, uid)
    # 代次必须在搬完之后抬，理由与 `redeem` 里那一段一模一样（契约 §二 第 4 步：归属一变，
    # 两侧旧 token 全部失效）。发起者手里这把会在回体里换成新的，见那只路由。
    accounts.bump_generation(db, keep)
    db.commit()
    return keep, True
