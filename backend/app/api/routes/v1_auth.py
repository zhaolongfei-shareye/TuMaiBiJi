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
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import logging

from app.core.apple_identity import verify_identity_token
from app.core.auth import _create_account_token, _create_token, login_or_register
from app.core.rate_limit import get_ip_key, limiter
from app.db.database import get_db
from app.models.account import Account
from app.models.user import User
from app.services import accounts, category_names, generation, linking, sms

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
