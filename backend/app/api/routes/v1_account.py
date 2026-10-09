"""`/v1/account`：我是谁、关联另一个平台、解绑、删账号。契约 §二、§四。

鉴权这一路是**混着**的，而且是故意的，因为两扇门后面站的人不一样：
`GET /v1/account`、`POST /v1/account/link/code`、`DELETE /v1/account/link/{provider}`、
`DELETE /v1/account` 拿的是 iPhone 那把钥匙（`kind=account`）；`POST /v1/account/link/redeem`
拿的是小程序那把老钥匙（`sub=<users.id>`）——契约 §二 第 3 步写的就是"小程序调"，而小程序手里
只有那一种 token。要它换一把，得先让所有客户端升一次级；在那之前，认老钥匙才是照实写。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_account, get_current_user
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.account import Account
from app.models.user import User
from app.services import deletion, linking, link_codes
from app.services.linking import LinkRefused

router = APIRouter()


class AccountResponse(BaseModel):
    account_id: str
    providers: list[str]


class AccountDeletionResponse(BaseModel):
    """与小程序那份 `DeactivateOut` **同一套键**：`message` / `deleted` / `file_ids`。
    两个客户端读同一份契约，`file_ids` 是它们清云端对象的唯一一份清单。"""
    message: str
    deleted: dict[str, int]
    file_ids: list[str] = []


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
    """生成一次性短码。**码只在响应里出现这一次**，库里只有 HMAC。

    限流这一档要说准它到底挡了什么：`app/core/rate_limit.py` 的 key 是
    `get_user_key`——带得上有效 token 时按 `sub` 计（这一条门上是 `accounts.id`），
    带不上就退回来源 IP。所以它挡的是**同一个人**刷码，不是"猜中一枚码要多少分钟"：
    猜的人攻击的是 `/link/redeem`，那一头的 key 是**redeem 发起者自己**的 `users.id`，
    他多有几个微信号就有几份 5/分钟。这一条上挂限流真正的用处是不让一个人的名下堆出
    几千行没人念的 HMAC（每发都是一次写库）。
    短码本身的安全不靠这个数：靠的是 6 位十进制 + 15 分钟 TTL + 一次消费（`used_at`
    条件 UPDATE）+ 猜错与用过的码回同一句话（不给判分机）。真正还嫌薄的一环是
    "对**某一枚**码的尝试次数"没有单独计数——记在 docs/产品需求.md「阶段2-2 落成」那一节（现编号 §8.174）的遗留里，审计回执是 §8.179。
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


@router.delete("", response_model=AccountDeletionResponse)
@limiter.limit("5/minute")
def delete_account(
    request: Request,
    confirm: bool = Query(False),
    db: Session = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """删掉**这个人**的一切（Apple 5.1.1(v) 要求 App 内可删账号，不能只给"联系我们"）。

    范围与小程序那条 `/api/user/deactivate` 出自同一支 `services/deletion.purge`——
    两份实现迟早会漏删一张表，而"删了账号却还查得到我的笔记"正是这一条审核条款要打回的话。
    区别只在**删谁**：这一路删的是整条 account 名下所有 `users` 行（微信登录行 + 将来 iPhone
    自己那行）。小程序那一路传的只是它自己那一行，但它同样会把背后那条 account 连带 identity
    一起删掉（今天一条 account 只有一行微信登录行，所以两边同形；那一句的边界写在
    `routes/user.py:deactivate_account` 的 docstring 里）。

    `confirm` 是一个显式的查询参数：这一步不可逆，服务端不接受"打了个 DELETE 就当确认"。
    没带它就 400，而且**什么都不删**（判据按表逐张比对 400 前后的行数，一张少了就红）。

    为什么**不**抬代次：契约 §二 那句"generation += 1 让所有 token 立刻失效"在删除这一路上是
    多余的——代次比的是"库里那一格"，而这里连那一行都删了：`get_current_account` 查不到
    account → 401，`get_current_user` 查不到 users 行 → 401。抬一格再删只会让"抬"这一步
    变成没人读的写操作。真需要"吊销但不删"的是合并与解绑那两处，它们各自钉着尺子。

    回体里的 `file_ids` 与小程序那份同形、同一支函数生成：那批云存储对象这台服务器删不掉，
    只有客户端删得动，而**这是最后一次有机会**——账号没了之后没有任何接口能再问出留了哪些图。
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="请先确认删除账号")
    rows = db.query(User).filter(User.account_id == account.id).all()
    deleted, file_ids = deletion.purge(db, rows, account.id)
    db.commit()
    return AccountDeletionResponse(message="账号已删除", deleted=deleted, file_ids=file_ids)
