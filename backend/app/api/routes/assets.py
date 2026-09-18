import logging

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.models.asset import Asset
from app.core.auth import get_current_user
from app.services import storage

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/")
async def upload_asset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件超过 20MB 限制")

    ext = ""
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()

    if storage.is_configured():
        result = storage.upload_file(data, ext, str(user.id))
        asset = Asset(
            user_id=str(user.id),
            object_key=result["object_key"],
            file_type=result["file_type"],
            file_size=result["file_size"],
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        return {"id": asset.id, "object_key": asset.object_key, "url": storage.get_download_url(asset.object_key)}
    else:
        logger.warning("COS 未配置，文件仅保存到本地临时存储")
        raise HTTPException(status_code=503, detail="文件存储服务未配置")


@router.get("/{asset_id}/url")
async def get_asset_url(
    asset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == str(user.id)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="文件不存在")
    url = storage.get_download_url(asset.object_key)
    return {"id": asset.id, "url": url}
