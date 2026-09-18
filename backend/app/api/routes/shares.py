import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.core.auth import get_current_user
from app.services.wechat import get_qr_code_image

router = APIRouter()


class ShareCreateRequest(BaseModel):
    note_id: int


class ShareResponse(BaseModel):
    token: str
    title: str | None
    summary: str | None
    tags: list | None
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成小程序码失败: {e}")

    return Response(content=image_data, media_type="image/png")
