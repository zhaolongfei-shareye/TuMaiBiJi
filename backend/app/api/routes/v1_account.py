"""`/v1/account`：我是谁、关联另一个平台、解绑。契约 §二、§四。

鉴权这一路是**混着**的，而且是故意的，因为两扇门后面站的人不一样：
`GET /v1/account`、`POST /v1/account/link/code`、`DELETE /v1/account/link/{provider}`
拿的是 iPhone 那把钥匙（`kind=account`）；`POST /v1/account/link/redeem` 拿的是小程序
那把老钥匙（`sub=<users.id>`）——契约 §二 第 3 步写的就是"小程序调"，而小程序手里
只有那一种 token。要它换一把，得先让所有客户端升一次级；在那之前，认老钥匙才是照实写。
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_account, get_current_user
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.account import Account
from app.models.user import User
from app.services import linking, link_codes
from app.services.linking import LinkRefused

router = APIRouter()


class AccountResponse(BaseModel):
    account_id: str
    providers: list[str]


class LinkCodeResponse(BaseModel):
    code: str
    expires_in_seconds: int


class RedeemRequest(BaseModel):
    # 钉死 6 位数字：放行长字符串等于让 `link_codes` 这张表被任意输入的哈希填满，
    # 而每一发都是一次 HMAC——那是台现成的、按请求计费的哈希碾压机。
    code: str = Field(pattern=r"^\d{6}$")


class RedeemResponse(BaseModel):
    account_id: str
    merged: bool


def _refused(exc: LinkRefused) -> HTTPException:
    """服务层只说"这一步为什么不让过"，HTTP 的翻译只在这一处。"""
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("", response_model=AccountResponse)
def whoami(db: Session = Depends(get_db), account: Account = Depends(get_current_account)):
    """契约 §四"我是谁：account uuid、已绑 provider 列表（不含 provider_uid 原文）"。

    iPhone 上「我的 → 关联微信」那一屏要先知道这个人已经绑过没有，绑过就不必再让他去
    小程序念一遍码；这一个请求就是那一句判断的全部依据。
    """
    return AccountResponse(account_id=account.id, providers=linking.identity_providers(db, account.id))


@router.post("/link/code", response_model=LinkCodeResponse)
@limiter.limit("5/minute")
def create_link_code(
    request: Request,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """生成一次性短码。**码只在响地里出现这一次**，库里只有 HMAC。

    限流是这一条的命门：码只有 6 位、15 分钟有效，一百万种可能里随便猜中一枚的期望是
    十万次量级——但那是"没有任何闸"时的算法。5/分钟按账号算，猜中一枚要连着几十万分钟。
    """
    code = link_codes.create(db, account)
    return LinkCodeResponse(code=code, expires_in_seconds=link_codes.TTL_MINUTES * 60)


@router.post("/link/redeem", response_model=RedeemResponse)
@limiter.limit("5/minute")
def redeem_link_code(
    request: Request,
    req: RedeemRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """小程序拿着用户输入的 6 位码走过来。合并规则、代次、幂等，全在 `services/linking.py`。

    返回 200 **不等于**"这把钥匙还能用"：合并一旦真的发生，两侧的代次都被抬了，
    手里这把 token 下一发就是 401。客户端必须重新登录拿新 token——这一句写在这里是因为
    它就是契约 §二 第 4 步在客户端侧的全部后果，忘了它的人会把"关联成功"当成"可以继续用旧的"。
    """
    try:
        account, merged = linking.redeem(db, user, req.code)
    except LinkRefused as exc:
        raise _refused(exc)
    return RedeemResponse(account_id=account.id, merged=merged)


@router.delete("/link/{provider}", response_model=AccountResponse)
def unlink(
    provider: str,
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """摘掉某一种登录方式。解绑同样抬代次：手里那把钥匙是从这条 identity 换来的，
    它不能再继续开这扇门。"""
    try:
        linking.unbind(db, account, provider)
    except LinkRefused as exc:
        raise _refused(exc)
    return AccountResponse(account_id=account.id, providers=linking.identity_providers(db, account.id))
