import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import UserError
from app.db.database import get_db
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services.wechat import get_qr_code_image

logger = logging.getLogger(__name__)

router = APIRouter()


class ShareCreateRequest(BaseModel):
    note_id: int


class ShareResponse(BaseModel):
    token: str
    title: str | None
    summary: str | None
    tags: list | None
    key_links: list | None
    created_at: datetime

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
        raise HTTPException(status_code=404, detail="Note not found")

    token = secrets.token_urlsafe(16)
    share = Share(
        user_id=str(user.id),
        note_id=note.id,
        token=token,
        title=note.title,
        summary=note.summary,
        tags=note.tags,
        key_links=note.key_links,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
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
async def get_share_qrcode(token: str, db: Session = Depends(get_db)):
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
