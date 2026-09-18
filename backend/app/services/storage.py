import logging
import uuid
from datetime import datetime, timezone

from qcloud_cos import CosConfig, CosS3Client

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.COS_SECRET_ID or not settings.COS_BUCKET:
        return None
    config = CosConfig(
        Region=settings.COS_REGION,
        SecretId=settings.COS_SECRET_ID,
        SecretKey=settings.COS_SECRET_KEY,
        Scheme="https",
    )
    _client = CosS3Client(config)
    return _client


def upload_file(data: bytes, file_type: str, user_id: str) -> dict:
    client = _get_client()
    if client is None:
        raise RuntimeError("COS 未配置")

    now = datetime.now(timezone.utc)
    date_prefix = now.strftime("%Y/%m/%d")
    ext = file_type.lower() if file_type else "bin"
    object_key = f"tmbj/{user_id}/{date_prefix}/{uuid.uuid4().hex}.{ext}"

    client.put_object(
        Bucket=settings.COS_BUCKET,
        Body=data,
        Key=object_key,
        ContentType=_guess_content_type(ext),
    )

    logger.info("Uploaded %s to COS: %s (%d bytes)", file_type, object_key, len(data))
    return {
        "object_key": object_key,
        "file_type": file_type,
        "file_size": len(data),
    }


def get_download_url(object_key: str, expires: int = 3600) -> str:
    client = _get_client()
    if client is None:
        raise RuntimeError("COS 未配置")
    url = client.get_presigned_url(
        Bucket=settings.COS_BUCKET,
        Key=object_key,
        Method="GET",
        Expired=expires,
    )
    return url


def delete_file(object_key: str):
    client = _get_client()
    if client is None:
        return
    try:
        client.delete_object(Bucket=settings.COS_BUCKET, Key=object_key)
    except Exception:
        logger.warning("Failed to delete COS object: %s", object_key, exc_info=True)


def is_configured() -> bool:
    return bool(settings.COS_SECRET_ID and settings.COS_BUCKET)


def _guess_content_type(ext: str) -> str:
    mapping = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "aac": "audio/aac",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4",
    }
    return mapping.get(ext, "application/octet-stream")
