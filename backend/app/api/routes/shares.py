import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import UserError
from app.core.rate_limit import limiter
from app.core.timefmt import UTCDatetime
from app.db.database import get_db
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services.sharing import (
    active_shares,
    public_fields,
    snapshot_matches,
    sync_snapshot,
    visible_fields,
)
from app.services.wechat import enforce_text_safety, get_qr_code_image

logger = logging.getLogger(__name__)

router = APIRouter()


class ShareCreateRequest(BaseModel):
    note_id: int


class ShareResponse(BaseModel):
    token: str
    title: str | None
    summary: str | None
    tags: list | None
    key_points: list | None
    key_links: list | None
    source_url: str | None
    created_at: UTCDatetime

    class Config:
        from_attributes = True


@router.post("/", response_model=ShareResponse)
def create_share(
    req: ShareCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = (
        db.query(Note)
        .filter(Note.id == req.note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")

    # 一条笔记只留一个有效分享：卡片上的码是按 token 生成的，反复点"生成分享图"
    # 再各发一个新 token，等于同一篇笔记散出去好几张互不相干的码，旧的那些还一直有效。
    existing = next((s for s in active_shares(db, note.id) if not _is_expired(s)), None)
    if existing is not None and snapshot_matches(existing, note):
        # 公开页上的内容和上次送检时一字不差，就不要再打一遍 msgSecCheck。
        # 顺序很关键：先判"要不要检"再做检，反过来这个接口就成了一个刷配额的路径
        # ——每次调用最多 7 个字段 × 分段，而它烧的是我们自己的微信接口额度。
        return existing

    # 分享是这条笔记第一次"别人也能看到"的时刻，所以公开出口在这里被过滤，
    # 而不是在抓取/识别那一步——外部原文里出现一个敏感词，不该让笔记存不下来。
    try:
        enforce_text_safety(user.openid, *public_fields(note))
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if existing is not None:
        sync_snapshot(db, note)
        db.commit()
        db.refresh(existing)
        return existing

    token = secrets.token_urlsafe(16)
    # 不设 expires_at：这张码是印在海报上的纸，别人一周后扫到也应该能看到那条笔记。
    # 原来给 7 天，等于每张发出去的海报都会在一周之后变成"分享已过期"。
    share = Share(
        user_id=str(user.id),
        note_id=note.id,
        token=token,
        **visible_fields(note),
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


def _is_expired(share: Share) -> bool:
    if not share.expires_at:
        return False
    expires = share.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= expires


def _get_active_share(token: str, db: Session) -> Share:
    share = (
        db.query(Share)
        .filter(Share.token == token, Share.is_active == True)
        .first()
    )
    if not share or _is_expired(share):
        raise HTTPException(status_code=404, detail="分享不存在或已过期")
    return share


@router.get("/{token}", response_model=ShareResponse)
def get_share(token: str, db: Session = Depends(get_db)):
    return _get_active_share(token, db)


@router.get("/{token}/qrcode")
@limiter.limit("60/minute")
async def get_share_qrcode(request: Request, token: str, db: Session = Depends(get_db)):
    """这个接口不要登录，所以必须限流。

    真正兜住"反复刷它烧微信接口配额"的是 get_qr_code_image 里那层缓存：同一张码只真打
    一次。限流是外面那道，防的是拿一堆有效 token 轮番刷。次数按真实客户端 IP 分桶——
    现网 uvicorn 带 --proxy-headers、nginx 传了 X-Forwarded-For，这两件都已实测确认。
    60 而不是 20：移动网络出口是共享的（一个基站 IP 后面可能几百人），限太狠会误伤
    只是正常打开卡片的人。
    """
    share = _get_active_share(token, db)

    try:
        image_data = await get_qr_code_image(
            scene=token,
            page="pages/share/view",
        )
    except UserError as e:
        # 面向用户的文案（如"微信接口暂不可用"）可以直接给，但只这一类
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        # 这里面的 errmsg / httpx 异常文本可能带 access_token 或整条含 secret 的 URL，
        # 只能进日志。这个接口不需要登录，detail 会被匿名调用方拿到。
        logger.exception("生成小程序码失败 token=%s: %s: %s", token, type(e).__name__, e)
        raise HTTPException(status_code=502, detail="小程序码生成失败，请稍后重试")

    # 微信 getUnlimitedQRCode 实测返回的是 JPEG（文件头 FF D8 FF E0 …JFIF），这里原先硬编码
    # image/png，声明与实际字节不符。按文件头判定，PNG/JPEG 都能对上。
    media_type = "image/png" if image_data[:4] == b"\x89PNG" else "image/jpeg"
    return Response(content=image_data, media_type=media_type)
