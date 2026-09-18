import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

import httpx

from app.core.config import settings


async def ocr_image(image_data: bytes) -> str:
    """调用腾讯云通用 OCR，返回识别文本。"""
    if not settings.TENCENT_OCR_SECRET_ID or not settings.TENCENT_OCR_SECRET_KEY:
        raise ValueError("腾讯云 OCR 密钥未配置，请设置 TENCENT_OCR_SECRET_ID 和 TENCENT_OCR_SECRET_KEY")

    image_b64 = base64.b64encode(image_data).decode()

    payload = {"ImageBase64": image_b64, "LanguageType": "zh"}
    payload_json = json.dumps(payload)

    now = datetime.now(timezone.utc)
    timestamp = int(time.time())
    date = now.strftime("%Y-%m-%d")

    service = "ocr"
    host = f"{service}.tencentcloudapi.com"
    action = "GeneralBasicOCR"
    version = "2018-11-19"

    canonical_headers = f"content-type:application/json\nhost:{host}\nx-tc-action:{action.lower()}\n"
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

    secret_date = _hmac_sha256(("TC3" + settings.TENCENT_OCR_SECRET_KEY).encode(), date)
    secret_service = _hmac_sha256(secret_date, service)
    secret_signing = _hmac_sha256(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode(), hashlib.sha256
    ).hexdigest()

    authorization = (
        f"TC3-HMAC-SHA256 "
        f"Credential={settings.TENCENT_OCR_SECRET_ID}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
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
        raise RuntimeError(f"OCR 失败: {err['Code']} - {err['Message']}")

    items = data["Response"].get("TextDetections", [])
    return "\n".join(item["DetectedText"] for item in items)


async def ocr_images(images_data: list[bytes]) -> str:
    """对多张图片依次 OCR，合并结果。"""
    results = []
    for i, img in enumerate(images_data):
        text = await ocr_image(img)
        if text.strip():
            results.append(f"--- 第{i + 1}页 ---\n{text}")
    return "\n\n".join(results)
