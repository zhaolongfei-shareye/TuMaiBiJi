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
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.apple_identity import verify_identity_token
from app.core.auth import _create_account_token, login_or_register
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.account import Account
from app.services import accounts, linking

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
@limiter.limit("5/minute")
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
@limiter.limit("5/minute")
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
    user, _legacy_user_token = await login_or_register(req.code, db, req.inviter)
    account = accounts.ensure_for_user(db, user)
    return _login_response(db, account)
