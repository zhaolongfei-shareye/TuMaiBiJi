"""`/v1` 这一路的登录口。契约 §二、§四。

和 `/api/auth/*` 的关系是**并存**，不是替换：小程序手里那批 7 天有效期的 token 认的是
`sub=<users.id>`，撤掉 `/api/auth/wechat` 等于把现网所有人当场踢下线。所以这里只加门，
不动旧门——而新门发的是**另一种钥匙**（`sub=<accounts.id>`、带 `kind=account`），
两把钥匙各开各的门，判据写在 `tests/test_v1_auth_and_link.py`。

为什么 `/v1/auth/apple` 不建 `users` 行：站长 10-09 拍的乙。一个只有 Apple 身份的人在库里
就是 `accounts` 一行 + `account_identities(apple)` 一行，**没有 `users` 行**。给他补一行
`openid=NULL` 的写法（当年的甲）能让所有按 `users.id` 挂业务的老代码原样跑通，代价是
"这个人是哪一行"从此有两个答案，而 iPhone 那一路往后每一步（公开快照、跨端同步）都要
在两个答案之间做翻译。乙把这个问题从源头掐掉：需要 `users` 行的口，本来就登不进 Apple-only 的人。

手机号登录（`/v1/auth/sms` + `/v1/auth/login`）是 H5 那一路的门：H5 没有微信 code 也没有
Apple identityToken，只能走短信验证码。这一支发的钥匙是**老式**（`sub=<users.id>`，不带
`kind`），因为 H5 要调 `/api/notes/*`、`/api/user/profile` 这一堆 legacy 口，那些口只认
老式钥匙。Account + AccountIdentity 照样建（provider="phone"），但 token 走 legacy 那支。

口令登录（`/v1/auth/register|password-login|upgrade|recover|change-password|session`）是 H5
今天**真正走得通**的那一支：现网 `.env` 里 `SMS_*`/`EMAIL_*` 两组凭据一行都没有，上面那两枝
发不出码。口令零外部依赖、零新增 pip 包，钥匙与游客那支同一种（legacy）。它与上面几枝并存、
不替代它们——凭据哪天补齐，短信/邮件自己就活了。边界与理由写在下面那一节的注释里。
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import logging

from app.core.apple_identity import verify_identity_token
from app.core.auth import _create_account_token, _create_token, get_current_user, login_or_register
from app.core.config import settings
from app.core.rate_limit import get_ip_key, limiter
from app.db.database import get_db
from app.models.account import Account
from app.models.user import User
from app.services import accounts, category_names, generation, linking, passwords, sms, email

logger = logging.getLogger(__name__)

router = APIRouter()


class AppleLoginRequest(BaseModel):
    # Apple 那边叫 identityToken，字段名跟着它写，省得两端各自翻译一遍。
    identity_token: str = Field(min_length=8)


class WechatLoginRequest(BaseModel):
    code: str = Field(min_length=1)
    # 和 `/api/auth/wechat` 同一个字段、同一套归因规则（`quota.attribute_inviter` 自己判
    # 认不认），这里带上它只为了"转调同一实现"这句话是真的：两条路上邀请人都归因得到。
    inviter: int | None = None


class LoginResponse(BaseModel):
    token: str
    account_id: str
    # 只报"挂了几种登录方式"，`provider_uid` 一个字符都不下发（契约 §二）。
    providers: list[str]


def _login_response(db: Session, account: Account) -> LoginResponse:
    return LoginResponse(
        token=_create_account_token(account),
        account_id=account.id,
        providers=linking.identity_providers(db, account.id),
    )


@router.post("/apple", response_model=LoginResponse)
@limiter.limit("5/minute", key_func=get_ip_key)
async def apple_login(request: Request, req: AppleLoginRequest, db: Session = Depends(get_db)):
    """验 Apple 签的那张 token，然后**只**按 `sub` 找人。

    `sub` 就是 `provider_uid`：契约 §二 明写的取法。同一个 Apple user identifier 第二次来
    必然回到同一条 account（靠 `ux_identity_provider_uid` 那道唯一索引），这是"换手机重装 App
    之后笔记还在"那句话在库面上的落点。
    """
    provider_uid = await verify_identity_token(req.identity_token)
    account = accounts.ensure_for_provider(db, "apple", provider_uid)
    return _login_response(db, account)


@router.post("/wechat", response_model=LoginResponse)
@limiter.limit("5/minute", key_func=get_ip_key)
async def wechat_login(request: Request, req: WechatLoginRequest, db: Session = Depends(get_db)):
    """契约 §二"另开 `/v1/auth/wechat` 转调同一实现"。同一实现 = 同一支 `login_or_register`，
    建号、邀请归因、account 补齐全部走它，这里不复制任何一条；区别只在**发哪一种钥匙**。

    `login_or_register` 顺手签的那把老钥匙（`sub=<users.id>`）在这里被丢掉：签出来不用它，
    是为了不再写一遍"换 openid、建 user、补 account"那一整段，而不是留着两把都能用。

    第二行必须用 `ensure_for_user`、**不许**换成 `ensure_for_provider`：10-09 独立审抓出的
    另一条 P0 就是这一行——`login_or_register` 内部按 `users.account_id` 认人（`ensure_for_user`），
    而我这里又按 `(wechat, openid)` 那条身份行认人（`ensure_for_provider`）。**两把不同的钥匙
    推导同一个问题**，正常时候答案一样，一旦库里出现"身份行与登录行分家"的状态（解绑那一趟
    就能造出来，修之前），这一趟就会给客户端回一条全新的空 account，而那个人几百篇笔记在另一条
    account 上。现在两条推导共用 `users.account_id` 这一个答案。
    """
    user, _legacy_user_token, _seeded_note_id = await login_or_register(req.code, db, req.inviter)
    account = accounts.ensure_for_user(db, user)
    return _login_response(db, account)


# ---- 手机号 + 验证码登录（H5 那一路）----

def _dev_account(kind: str, account: str) -> bool:
    """开关打开且账号命中锁定的那一枚测试号。发码口用它决定"跳过真实发信"。
    默认关闭时永远 False，生产行为零变化。账号为空也不认（必须锁定到具体号）。"""
    if not settings.DEV_LOGIN_ENABLED:
        return False
    if kind == "phone":
        return bool(settings.DEV_LOGIN_PHONE) and account == settings.DEV_LOGIN_PHONE
    if kind == "email":
        return bool(settings.DEV_LOGIN_EMAIL) and account == settings.DEV_LOGIN_EMAIL
    return False


def _dev_login_ok(kind: str, account: str, code: str) -> bool:
    """登录口用它决定"跳过 Redis 校验"：在 `_dev_account` 之上再要求码 == 固定码。"""
    return (_dev_account(kind, account)
            and bool(settings.DEV_LOGIN_CODE)
            and code == settings.DEV_LOGIN_CODE)


class SendSmsRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=11)


class PhoneLoginRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=11)
    code: str = Field(min_length=4, max_length=6)


class PhoneLoginResponse(BaseModel):
    """H5 登录回体。比 Apple/Wechat 那两支多带用户信息——H5 没有 `/api/user/profile` 的预请求，
    登录成功那一刻就要拿到 nickname/wallpaper 去渲染首屏。legacy token 走 `sub=<users.id>`，
    与小程序那批发出来的是同一种钥匙（`get_current_user` 认它）。"""
    token: str
    user_id: int
    nickname: str
    language: str
    wallpaper: str


@router.post("/sms")
@limiter.limit("3/minute", key_func=get_ip_key)
async def send_sms_code(request: Request, req: SendSmsRequest):
    """发验证码。两道闸：IP 限流（slowapi 那枚装饰器）＋ 手机号冷却（Redis 里那一枚 TTL key）。

    回体只有一个 `{}`：不管发没发成功都回 200。原因与 `/api/auth/wechat` 失败时不回细节同型——
    告诉攻击者「这个号码已被注册」或「冷却中」都是在帮他们枚举手机号。真正的错误只写日志。
    """
    phone = req.phone.strip()
    if not sms.PHONE_RE.match(phone):
        return {}

    # 开发态固定登录号：不存 Redis、不发短信，直接回 200（固定码由 DEV_LOGIN_CODE 认）。
    if _dev_account("phone", phone):
        return {}

    cooldown = await asyncio.to_thread(sms.check_cooldown, phone)
    if cooldown > 0:
        return {}

    code = sms.generate_code()
    try:
        await asyncio.to_thread(sms.store_code, phone, code)
    except Exception:
        logger.exception("验证码存储失败（Redis 不可用）phone=%s…%s", phone[:3], phone[-4:])
        raise HTTPException(status_code=503, detail="验证码服务暂不可用，请稍后重试")
    ok = await sms.send_code(phone, code)
    if ok:
        await asyncio.to_thread(sms.set_cooldown, phone)
    return {}


@router.post("/login", response_model=PhoneLoginResponse)
@limiter.limit("5/minute", key_func=get_ip_key)
async def phone_login(request: Request, req: PhoneLoginRequest, db: Session = Depends(get_db)):
    """手机号 + 验证码登录。验过码之后走 `ensure_for_provider(provider="phone")` 那条现成链——
    与微信、Apple 同一扇门，Account + AccountIdentity 的并发保护、代次分配全部复用。

    与微信那一路的区别：这里**必须**同时建一行 `users`（openid = `phone:<号码>`），因为 H5
    拿到 legacy token 之后要调 `/api/notes/*`、`/api/user/profile`，那些口只认 `get_current_user`，
    而 `get_current_user` 要查得到 `users` 行。Apple 那一路可以不建（站长 10-09 拍的乙），
    是因为 iPhone 走的是 `/v1/*` 那一组口，认 `get_current_account`。
    """
    phone = req.phone.strip()
    if not sms.PHONE_RE.match(phone) or not sms.CODE_RE.match(req.code.strip()):
        raise HTTPException(status_code=400, detail="手机号或验证码格式错误")

    if not _dev_login_ok("phone", phone, req.code.strip()):
        if not await asyncio.to_thread(sms.verify_code, phone, req.code.strip()):
            raise HTTPException(status_code=400, detail="验证码错误或已过期")

    provider_uid = f"phone:{phone}"
    account = accounts.ensure_for_provider(db, "phone", provider_uid)

    user = db.query(User).filter(User.account_id == account.id).first()
    is_new = user is None
    if is_new:
        user = User(
            openid=provider_uid,
            generation=generation.allocate(db),
            account_id=account.id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.account_id != account.id:
        user.account_id = account.id
        db.commit()

    if is_new:
        try:
            category_names.seed_default_categories(db, str(user.id))
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("默认分类没种下去（不影响登录）：user=%s", user.id)

    token = _create_token(user.id, user.generation)
    return PhoneLoginResponse(
        token=token,
        user_id=user.id,
        nickname=user.nickname or "",
        language=user.language or "zh",
        wallpaper=user.wallpaper or "default",
    )


class GuestLoginRequest(BaseModel):
    # 客户端生成的设备指纹（一个 UUID）。它不是秘密、也不是身份，只用来把同一台设备的
    # 游客数据稳定挂到同一行 users 上；换浏览器/清缓存就是新游客，符合"本机试用"预期。
    device_id: str = Field(min_length=8, max_length=64)


@router.post("/guest", response_model=PhoneLoginResponse)
@limiter.limit("30/hour", key_func=get_ip_key)
async def guest_login(request: Request, req: GuestLoginRequest, db: Session = Depends(get_db)):
    """设备游客号：不验证、不登录，凭一个 device_id 就发一把 legacy token，让 H5 游客
    直接跑通"录入→AI 提炼→列表→详情"这条核心业务流（站长 11-09「先跑通核心业务流程，
    登录之类的后面再加」）。

    形状与手机号登录**完全一致**（同一 `PhoneLoginResponse`、同样 `sub=<users.id>` 的老式
    token），所以 H5 拿到它之后调 `/api/notes/*`、`/api/ingest/*`、`/api/user/profile`
    这些 legacy 口全都原样能用，不需要为游客单开一套接口。

    与手机登录的唯一区别是身份来源：这里 provider="guest"、provider_uid=`guest:<device_id>`，
    每台设备一行隔离的 users，游客之间数据互不可见。代价是这把钥匙开的是**真实账号**、
    提炼走的是**付费混元**，所以挂了 IP 限流（30/小时）挡脚本刷号；正常人手一小时内点不了
    几十次新建，摸不到这条线。
    """
    device_id = req.device_id.strip()
    provider_uid = f"guest:{device_id}"
    account = accounts.ensure_for_provider(db, "guest", provider_uid)

    user = db.query(User).filter(User.account_id == account.id).first()
    is_new = user is None
    if is_new:
        user = User(
            openid=provider_uid,
            generation=generation.allocate(db),
            account_id=account.id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.account_id != account.id:
        user.account_id = account.id
        db.commit()

    if is_new:
        try:
            category_names.seed_default_categories(db, str(user.id))
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("游客默认分类没种下去（不影响登录）：user=%s", user.id)

    token = _create_token(user.id, user.generation)
    return PhoneLoginResponse(
        token=token,
        user_id=user.id,
        nickname=user.nickname or "游客",
        language=user.language or "zh",
        wallpaper=user.wallpaper or "default",
    )


# ---- 邮箱 + 验证码登录（H5 那一路，海外用户）----

class SendEmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=100)


class EmailLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=100)
    code: str = Field(min_length=4, max_length=6)


class EmailLoginResponse(BaseModel):
    """H5 邮箱登录回体。与手机号登录同型：legacy token（`sub=<users.id>`），
    因为 H5 要调 `/api/notes/*`、`/api/user/profile`，那些口只认 `get_current_user`。"""
    token: str
    user_id: int
    nickname: str
    language: str
    wallpaper: str


@router.post("/email")
@limiter.limit("3/minute", key_func=get_ip_key)
async def send_email_code(request: Request, req: SendEmailRequest):
    """发邮箱验证码。两道闸：IP 限流（slowapi 那枚装饰器）＋ 邮箱冷却（Redis 里那一枚 TTL key）。

    回体只有一个 `{}`：与 `/v1/auth/sms` 同一条理由——告诉攻击者「这个邮箱已被注册」
    是在帮他们枚举邮箱。真正的错误只写日志。
    """
    email_addr = req.email.strip().lower()
    if not email.EMAIL_RE.match(email_addr):
        return {}

    # 开发态固定登录邮箱：不存 Redis、不发邮件，直接回 200。
    if _dev_account("email", email_addr):
        return {}

    cooldown = await asyncio.to_thread(email.check_cooldown, email_addr)
    if cooldown > 0:
        return {}

    code = email.generate_code()
    try:
        await asyncio.to_thread(email.store_code, email_addr, code)
    except Exception:
        logger.exception("验证码存储失败（Redis 不可用）email=%s…%s", email_addr[:3], email_addr[-4:])
        raise HTTPException(status_code=503, detail="验证码服务暂不可用，请稍后重试")
    ok = await email.send_code(email_addr, code)
    if ok:
        await asyncio.to_thread(email.set_cooldown, email_addr)
    return {}


@router.post("/email-login", response_model=EmailLoginResponse)
@limiter.limit("5/minute", key_func=get_ip_key)
async def email_login(request: Request, req: EmailLoginRequest, db: Session = Depends(get_db)):
    """邮箱 + 验证码登录。与手机号登录同一条链：验过码之后走 `ensure_for_provider(provider="email")`，
    Account + AccountIdentity 的并发保护、代次分配全部复用。

    与手机号的区别：`provider_uid` 前缀是 `email:` 而不是 `phone:`，邮箱要转小写（`a@B.com` = `a@b.com`）。
    """
    email_addr = req.email.strip().lower()
    if not email.EMAIL_RE.match(email_addr) or not email.CODE_RE.match(req.code.strip()):
        raise HTTPException(status_code=400, detail="邮箱或验证码格式错误")

    if not _dev_login_ok("email", email_addr, req.code.strip()):
        if not await asyncio.to_thread(email.verify_code, email_addr, req.code.strip()):
            raise HTTPException(status_code=400, detail="验证码错误或已过期")

    provider_uid = f"email:{email_addr}"
    account = accounts.ensure_for_provider(db, "email", provider_uid)

    user = db.query(User).filter(User.account_id == account.id).first()
    is_new = user is None
    if is_new:
        user = User(
            openid=provider_uid,
            generation=generation.allocate(db),
            account_id=account.id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.account_id != account.id:
        user.account_id = account.id
        db.commit()

    if is_new:
        try:
            category_names.seed_default_categories(db, str(user.id))
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("默认分类没种下去（不影响登录）：user=%s", user.id)

    token = _create_token(user.id, user.generation)
    return EmailLoginResponse(
        token=token,
        user_id=user.id,
        nickname=user.nickname or "",
        language=user.language or "zh",
        wallpaper=user.wallpaper or "default",
    )


# ---- 口令登录（H5/安卓那一路，零外部付费依赖）----
#
# 为什么另开这一支而不是把短信/邮件那两枝修通：现网 `.env` 里 `SMS_*` 与 `EMAIL_*` 两组凭据
# **一行都没有**（11-12 现读），短信要钱、邮件要发信域名与送达率。站长 11-12「去搞登录吧，
# 免费的技术方案」要的是今天就能登进去的那一条，口令是零外部依赖、零新增 pip 包的那条
# （scrypt 在标准库里，见 `services/passwords.py`）。上面那两枝**原样留着**：哪天凭据补齐，
# 它们自己就活了，这一支不替代它们。
#
# 发的钥匙与手机号/游客那两枝**同一种**（legacy，`sub=<users.id>`，不带 kind），因为 H5 拿到它
# 之后要调 `/api/notes/*`、`/api/user/profile`、`/api/ingest/*`，那些口只认 `get_current_user`。
#
# 这一路的诚实边界：登录名不验证归属（没有发信通道），所以 `account_identities.verified_at`
# 留 NULL，界面上必须原样告诉用户"邮箱/手机号只当登录名用，我们不会发验证码"。


class PasswordRegisterRequest(BaseModel):
    login: str = Field(min_length=5, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class PasswordLoginRequest(BaseModel):
    login: str = Field(min_length=5, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class PasswordRecoverRequest(BaseModel):
    login: str = Field(min_length=5, max_length=100)
    # 恢复码原文带横杠是 19 字符，用户可能抄成不带横杠/小写/带空格，所以这里放宽到 64，
    # 归一化与长度闸在 `passwords.recovery_matches` 里（那一支先归一再比 16 位）。
    recovery_code: str = Field(min_length=8, max_length=64)
    new_password: str = Field(min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class PasswordAuthResponse(PhoneLoginResponse):
    """比手机号那支多两格：`login`（登录名，H5「账号」那一行要显示）与 `recovery_code`
    （**只在注册/改密/找回那三趟下发一次**，库里只留 HMAC；普通登录那一趟是 null）。
    """
    login: str
    recovery_code: str | None = None


class SessionResponse(BaseModel):
    """H5 开机那一趟问"我现在是谁"。为什么不用 `GET /v1/account`：那一扇认的是
    `kind=account` 那把钥匙，而 H5 手里只有 legacy 那把，拿错门是 401。
    `login` 为 null = 这个账号还没设过口令（游客/微信/手机号那几支）。
    """
    user_id: int
    account_id: str
    login: str | None
    providers: list[str]


def _user_of_account(db: Session, account: Account, provider_uid: str) -> User:
    """按 account 找那一行 `users`，没有就建（形状与 guest/phone/email 三枝完全一致：
    openid = provider_uid、代次走 `generation.allocate`、新号种默认分类、不种示例笔记）。

    为什么必须建：H5 拿到 legacy token 之后调的那一堆口只认 `get_current_user`，
    而它要查得到 `users` 行。笔记挂的是 `users.id`，所以这一行就是"这个人的数据在哪"。
    """
    user = db.query(User).filter(User.account_id == account.id).first()
    if user is not None:
        return user
    user = User(
        openid=provider_uid,
        generation=generation.allocate(db),
        account_id=account.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    try:
        category_names.seed_default_categories(db, str(user.id))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("默认分类没种下去（不影响登录）：user=%s", user.id)
    return user


def _password_response(user: User, login: str, recovery: str | None) -> PasswordAuthResponse:
    return PasswordAuthResponse(
        token=_create_token(user.id, user.generation),
        user_id=user.id,
        nickname=user.nickname or "",
        language=user.language or "zh",
        wallpaper=user.wallpaper or "default",
        login=login,
        recovery_code=recovery,
    )


def _normalized_login(raw: str) -> str:
    login = passwords.normalize_login(raw)
    if login is None:
        raise HTTPException(status_code=400, detail="登录名要填手机号或邮箱")
    return login


def _checked_password(raw: str) -> str:
    if not passwords.password_ok(raw):
        raise HTTPException(
            status_code=400,
            detail=f"密码要 {passwords.PASSWORD_MIN}–{passwords.PASSWORD_MAX} 位",
        )
    return raw


@router.post("/register", response_model=PasswordAuthResponse)
@limiter.limit("3/hour", key_func=get_ip_key)
async def password_register(request: Request, req: PasswordRegisterRequest, db: Session = Depends(get_db)):
    """注册一个口令账号。建号走 `ensure_for_provider`（与微信/Apple/游客同一扇门），
    口令那一行随后落在同一个事务里。

    409 而不是"静默登录进去"：登录名已被占用时若直接发钥匙，等于把后来者打进前一个人的账号。
    这一句同时也让"这个登录名注册过没有"可被枚举——那是注册口不可避免的代价（要告诉用户
    换一个），所以登录那一头必须回统一的一句话，不许再给第二台判分机。
    """
    login = _normalized_login(req.login)
    password = _checked_password(req.password)
    uid = passwords.uid_of(login)

    if passwords.find_account_by_login(db, login) is not None:
        raise HTTPException(status_code=409, detail="这个登录名已经有人用了，换一个，或者直接登录")

    account = accounts.ensure_for_provider(db, "password", uid, verified=False)
    # 并发那一路：两趟同时注册同一个登录名，后一趟 `ensure_for_provider` 会返回赢家的 account。
    # 那一行已经有口令了 ⇒ 不许覆盖（覆盖 = 把别人的账号密码改成自己的）。
    if passwords.row_for(db, account.id) is not None:
        raise HTTPException(status_code=409, detail="这个登录名已经有人用了，换一个，或者直接登录")

    user = _user_of_account(db, account, uid)
    recovery = passwords.create(db, account, password)
    db.commit()
    return _password_response(user, login, recovery)


@router.post("/password-login", response_model=PasswordAuthResponse)
@limiter.limit("10/minute", key_func=get_ip_key)
async def password_login(request: Request, req: PasswordLoginRequest, db: Session = Depends(get_db)):
    """登录名 + 口令。失败一律回同一句"登录名或密码不对"（400），不区分"号不存在"与"密码错"。

    两道闸：IP 限流 10/分钟（slowapi）＋ **按账号**的失败计数（10 次连错锁 15 分钟，
    落在 `account_passwords` 那两列上）。第二道不能省：IP 限流换 IP 就绕过去了，
    而口令不像验证码那样有 6 位数字 + 5 分钟 TTL 兜着。
    """
    login = passwords.normalize_login(req.login)
    account = passwords.find_account_by_login(db, login) if login else None
    row = passwords.row_for(db, account.id) if account is not None else None
    if row is None:
        # 号不存在也花一次同等成本的 scrypt，否则"注册过没有"能靠响应快慢量出来。
        passwords.dummy_verify(req.password)
        raise HTTPException(status_code=400, detail="登录名或密码不对")
    if passwords.locked(row):
        raise HTTPException(status_code=429, detail=f"试的次数太多了，请 {passwords.LOCK_MINUTES} 分钟后再试")
    if not passwords.verify_password(req.password, row.password_hash):
        passwords.note_failure(db, row)
        raise HTTPException(status_code=400, detail="登录名或密码不对")

    passwords.note_success(db, row)
    user = _user_of_account(db, account, passwords.uid_of(login))
    return _password_response(user, login, None)


@router.post("/upgrade", response_model=PasswordAuthResponse)
@limiter.limit("5/hour", key_func=get_ip_key)
async def password_upgrade(
    request: Request,
    req: PasswordRegisterRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """给**当前这个账号**设口令（游客先用、觉得好再把数据带走那一路）。

    这一支是整条路最要紧的一句：走 `add_identity` 而**不是** `ensure_for_provider`——
    后者在身份不存在时会新建 account，而游客那几百篇笔记挂在当前 account 的 `users` 行上，
    新建一条就等于"设完密码数据全没了"。笔记一个字都不搬（业务表挂 `users.id`）。

    **不抬代次**：加一种登录方式不是归属变更，手里这把钥匙应当继续能用。
    """
    login = _normalized_login(req.login)
    password = _checked_password(req.password)
    account = accounts.ensure_for_user(db, user)

    if passwords.row_for(db, account.id) is not None:
        raise HTTPException(status_code=409, detail="这个账号已经设过密码了，要改请用「修改密码」")
    other = passwords.find_account_by_login(db, login)
    if other is not None and other.id != account.id:
        raise HTTPException(status_code=409, detail="这个登录名已经有人用了，换一个")

    try:
        accounts.add_identity(db, account, "password", passwords.uid_of(login), verified=False)
    except accounts.IdentityTaken:
        raise HTTPException(status_code=409, detail="这个登录名已经有人用了，换一个")

    recovery = passwords.create(db, account, password)
    db.commit()
    return _password_response(user, login, recovery)


@router.post("/recover", response_model=PasswordAuthResponse)
@limiter.limit("5/hour", key_func=get_ip_key)
async def password_recover(request: Request, req: PasswordRecoverRequest, db: Session = Depends(get_db)):
    """恢复码 + 新口令。**没有邮件也没有短信，这是忘记密码之后唯一的入口。**

    改完必须抬代次：找回意味着"手里那把钥匙可能已经在别人手上"，旧 token 全部作废
    （`bump_generation` 一次抬两格，与合并/解绑同一支）。抬完当场发一把新的回给客户端，
    所以用户这一次不会被踢出去。恢复码同时换新的一枚，旧的那枚当场作废。
    """
    login = passwords.normalize_login(req.login)
    account = passwords.find_account_by_login(db, login) if login else None
    row = passwords.row_for(db, account.id) if account is not None else None
    if row is None or not passwords.recovery_matches(req.recovery_code, row.recovery_hash):
        raise HTTPException(status_code=400, detail="登录名或恢复码不对")
    password = _checked_password(req.new_password)

    recovery = passwords.set_password(db, row, password)
    accounts.bump_generation(db, account)
    db.commit()
    user = _user_of_account(db, account, passwords.uid_of(login))
    return _password_response(user, login, recovery)


@router.post("/change-password", response_model=PasswordAuthResponse)
@limiter.limit("5/hour", key_func=get_ip_key)
async def password_change(
    request: Request,
    req: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """知道现在那枚口令的人改口令。与 `/recover` 同一套后果（抬代次 + 换恢复码 + 发新钥匙），
    区别只在凭什么放行：这一支凭旧口令，那一支凭恢复码。

    为什么要有这一支而不是只留 `/recover`：恢复码是抄在纸上的那一串，丢了的人不该连
    "我知道现在的密码、想换一枚"都做不到。
    """
    account = accounts.ensure_for_user(db, user)
    row = passwords.row_for(db, account.id)
    if row is None:
        raise HTTPException(status_code=409, detail="这个账号还没设过密码")
    if not passwords.verify_password(req.old_password, row.password_hash):
        raise HTTPException(status_code=400, detail="现在的密码不对")
    password = _checked_password(req.new_password)

    login = passwords.login_of(db, account.id)
    recovery = passwords.set_password(db, row, password)
    accounts.bump_generation(db, account)
    db.commit()
    db.refresh(user)
    return _password_response(user, login or "", recovery)


@router.get("/session", response_model=SessionResponse)
@limiter.limit("60/minute")
async def auth_session(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """H5 开机验完票之后问一句"我是谁、设过口令没有"。

    为什么必须问服务器而不是读本机存的那份：游客在 A 设备上升了级之后，B 设备本机存的
    还是"游客"，「账号」那一行就会一直显示"登录/注册"，而那个人其实已经有账号了。
    """
    account = accounts.ensure_for_user(db, user)
    return SessionResponse(
        user_id=user.id,
        account_id=account.id,
        login=passwords.login_of(db, account.id),
        providers=linking.identity_providers(db, account.id),
    )
