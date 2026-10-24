"""后台那一页背后的七个口：登录、看状态、上传、改生效位，加看密钥、存密钥、删密钥。

路径都写在这一份文件里（`/api/admin/*`），所以 `app/main.py` 挂载时不给 prefix——
与 `assets`/`cards`/`profiles`/`landing` 同一族做法。理由在这条链上更硬一层：
`/ops` 那一页在另一个模块里，两个模块合起来才是"后台"这一个东西，
路径写在一起（而不是靠 prefix 拼）才看得出全貌。

鉴权一律走 `app/core/admin_access.py` 那把独立的钥匙，**除了 `/api/admin/login` 本身**。
口令没配的时候其余六个口全回 503（不是 401）：401 会让人以为"口令打错了"，
而真实情况是"这台服务器还没开这一页"，两句话得靠不同状态码分开。

这一段上现网之后现网小程序的行为一行都不变：客户端还没有读 `/api/mp/config` 的代码，
`mp_assets` / `mp_settings` 两张表除了这一页以外没有任何写入者（方案 §四 P0-a 的副作用声明）；
`service_secrets` 同理，且它空表时 `resolve()` 回的就是 `.env` 那一份（10-25 加的三个口）。
"""
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.admin_access import check_login, create_session_token, enabled, get_admin
from app.core.config import settings
from app.core.errors import UserError
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.services import mp_assets, service_secrets

logger = logging.getLogger(__name__)

router = APIRouter()

# 上传口挂在管理凭证后面，所以这里的限流防的是"登录态被拿着之后手滑"，不是防爆破。
# 真正要限的是 login：那是这一条链上唯一一个匿名可反复试的判据，5/分钟按 IP 分桶
# （uvicorn 带 --proxy-headers、nginx 传 X-Forwarded-For 已实测，见 shares.py:264-274 那段）。


class LoginIn(BaseModel):
    # 长度上限只是个防"把整个文件粘进来"的护栏，不是安全判据——口令对不对由 compare_digest 说。
    token: str = Field(min_length=1, max_length=200)


class PublishIn(BaseModel):
    """`asset_id` 给数字是"发这一张"，给 null 是"停用，回到包里那张"。

    一个口两种写法（而不是 `/publish` + `/deactivate` 两个口）的理由在锚点 A1：
    这两句在数据层本来就是同一栏的两种取值，分成两个口就会有两个"怎么写这一栏"的实现。
    """
    asset_id: int | None = None


@router.post("/api/admin/login")
@limiter.limit("5/minute")
def admin_login(request: Request, body: LoginIn):
    """换成一把短命管理 session。成功只回 token，失败回一句不含任何线索的话。

    日志里绝不出现提交的值：打错口令的人通常是正在试的那个人，而这一行日志
    会进 journald——那是没有按用户隔离、也不会随任何东西删掉的地方（同 `main.py` 里
    校验失败只记定位不记 input 那条）。
    """
    if not enabled():
        raise HTTPException(status_code=503, detail="后台未开放：服务器还没配置管理口令")
    if not check_login(body.token):
        logger.warning("管理口令不对 remote=%s", request.client.host if request.client else "?")
        raise HTTPException(status_code=401, detail="管理口令不对")
    logger.info("后台登录 remote=%s", request.client.host if request.client else "?")
    return {
        "session": create_session_token(),
        "expires_in": settings.ADMIN_SESSION_MINUTES * 60,
    }


@router.get("/api/admin/mp/state")
@limiter.limit("60/minute")
def admin_mp_state(request: Request, db: Session = Depends(get_db), _admin: str = Depends(get_admin)):
    """那一页要显示的全部事实：每一栏的生效位、是否被冻结、历史（含一键回滚要挑的那几张）。"""
    return mp_assets.admin_state(db)


@router.post("/api/admin/mp/assets")
@limiter.limit("20/minute")
async def admin_mp_upload(
    request: Request,
    kind: str = Form(...),
    file: UploadFile = File(...),
    note: str | None = Form(None),
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """存一张到盘上并记一行账。**不动生效位**——上传和发布是两步，
    中间那一格留给操作者看预览（方案 §五.3 那条"换图会把头部几行字的对比度带偏"要的就是这个停顿）。
    """
    # 读到这里就停：不然一张 500MB 的图会整份进内存（Starlette 会把超出 1MB 的部分先落到临时文件，
    # 但 `read()` 不带界就是全读进来）。判上限的句子只有一份，在 `services/mp_assets.over_bytes_hint`。
    data = await file.read(mp_assets.MAX_BYTES + 1)
    if len(data) > mp_assets.MAX_BYTES:
        # 原始文件名一个字都不提：它可能带路径分隔符，也可能是别人的文件名。
        raise HTTPException(status_code=400, detail=mp_assets.over_bytes_hint())
    try:
        asset = mp_assets.upload(db, kind, data, note)
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return mp_assets.describe(asset)


@router.put("/api/admin/mp/settings/{kind}")
@limiter.limit("30/minute")
def admin_mp_setting(
    kind: str,
    body: PublishIn,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    try:
        if body.asset_id is None:
            mp_assets.unpublish(db, kind)
            return {"kind": kind, "current": None}
        asset = mp_assets.publish(db, kind, body.asset_id)
        return {"kind": kind, "current": mp_assets.describe(asset)}
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


class SecretIn(BaseModel):
    """存一把凭据。`value` 只在写的那一刻过界，读的一侧永远拿不到它。

    这里只留一个 64KB 的"防粘错东西"护栏，**上限那句话说的是服务层那一个 4096**：
    两处各写一条判据，改上限的那天就会有一处忘了改，而 422 与 400 的文案是两个出处
    （与 `mp_assets.over_bytes_hint` 同一条纪律）。空串与"全是空白"也不在这里判——
    那是服务层那一句"密钥值是空的"，与它自己的 4096 那一句同一个出处。
    """
    value: str = Field(max_length=65536)
    note: str | None = Field(default=None, max_length=service_secrets.MAX_NOTE_CHARS)


@router.get("/api/admin/secrets")
@limiter.limit("60/minute")
def admin_secrets(
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """那一页要显示的密钥账：名字、长度、指纹、备注、更新时间，加两句"能不能回到 .env"。

    这里没有 `value`，所以这一句不需要"记得删掉敏感字段"——判据从源头上就不往外给。
    """
    return {
        "items": service_secrets.list_items(db),
        "consumed_names": list(service_secrets.CONSUMED_NAMES),
    }


@router.put("/api/admin/secrets/{name}")
@limiter.limit("20/minute")
def admin_secret_put(
    name: str,
    body: SecretIn,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """存一把（没有就建、有就整把覆盖）。**回体里没有提交的那一把**，只有长度与指纹。"""
    try:
        return service_secrets.put(db, name, body.value, body.note)
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/admin/secrets/{name}")
@limiter.limit("20/minute")
def admin_secret_delete(
    name: str,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """删一行 = 那个名字当场回到 `.env`。所以"撤销一次改动"不必知道旧值是什么。"""
    try:
        return {"name": name, "deleted": service_secrets.delete(db, name)}
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
