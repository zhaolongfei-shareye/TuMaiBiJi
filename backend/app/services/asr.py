import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def transcribe_audio(audio_data: bytes, format: str = "aac") -> str:
    """调用腾讯云一句话识别，返回转写文本。

    限制：音频时长 ≤ 60 秒，大小 ≤ 10MB。
    """
    if not settings.TENCENT_ASR_SECRET_ID or not settings.TENCENT_ASR_SECRET_KEY:
        raise ValueError(
            "腾讯云 ASR 密钥未配置，请设置 TENCENT_ASR_SECRET_ID 和 TENCENT_ASR_SECRET_KEY"
        )

    audio_b64 = base64.b64encode(audio_data).decode()

    payload = {
        "ProjectId": 0,
        "SubServiceType": 1,
        "EngineModelType": "16k_zh",
        "SourceType": 0,
        "VoiceFormat": format,
        "SourceStringData": audio_b64,
    }
    payload_json = json.dumps(payload)

    now = datetime.now(timezone.utc)
    timestamp = int(time.time())
    date = now.strftime("%Y-%m-%d")

    service = "asr"
    host = f"{service}.tencentcloudapi.com"
    action = "SentenceRecognition"
    version = "2019-06-14"

    canonical_headers = (
        f"content-type:application/json\nhost:{host}\nx-tc-action:{action.lower()}\n"
    )
    signed_headers = "content-type;host;x-tc-action"
    hashed_payload = hashlib.sha256(payload_json.encode()).hexdigest()
    canonical_request = (
        f"POST\n/\n\n{canonical_headers}\n{signed_headers}\n{hashed_payload}"
    )

    credential_scope = f"{date}/{service}/tc3_request"
    hashed_canonical = hashlib.sha256(canonical_request.encode()).hexdigest()
    string_to_sign = (
        f"TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical}"
    )

    def _hmac_sha256(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode(), hashlib.sha256).digest()

    secret_date = _hmac_sha256(("TC3" + settings.TENCENT_ASR_SECRET_KEY).encode(), date)
    secret_service = _hmac_sha256(secret_date, service)
    secret_signing = _hmac_sha256(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode(), hashlib.sha256
    ).hexdigest()

    authorization = (
        f"TC3-HMAC-SHA256 "
        f"Credential={settings.TENCENT_ASR_SECRET_ID}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    resp = await httpx.AsyncClient(timeout=30).post(
        f"https://{host}",
        headers={
            "Authorization": authorization,
            "Content-Type": "application/json",
            "Host": host,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": version,
        },
        content=payload_json,
    )
    resp.raise_for_status()
    data = resp.json()

    if "Error" in data.get("Response", {}):
        err = data["Response"]["Error"]
        raise RuntimeError(f"ASR 失败: {err['Code']} - {err['Message']}")

    return data["Response"].get("Result", "")
