import logging
import time

import httpx

from app.core.config import settings
from app.core.errors import UserError

logger = logging.getLogger(__name__)

WX_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token"
WX_QRCODE_URL = "https://api.weixin.qq.com/wxa/getwxacodeunlimit"

_access_token_cache = {"token": None, "expires_at": 0}


async def get_access_token() -> str:
    """获取微信 access_token，带内存缓存（提前 5 分钟刷新）。"""
    now = time.time()
    if _access_token_cache["token"] and _access_token_cache["expires_at"] > now + 300:
        return _access_token_cache["token"]

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            WX_TOKEN_URL,
            params={
                "grant_type": "client_credential",
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
            },
        )
        # 这里不用 raise_for_status：httpx 的异常文本会把请求 URL 整条拼进去，而这个 URL 的
        # query 里带着 AppSecret。状态码和响应体单独记日志，往外只抛不含凭据的固定文案。
        if resp.status_code >= 400:
            logger.error("获取 access_token 失败：HTTP %s，响应=%s", resp.status_code, resp.text[:200])
            raise UserError("微信接口暂不可用，请稍后重试")
        data = resp.json()

    if "access_token" not in data:
        logger.error("获取 access_token 被拒：%s", data)
        raise UserError("微信接口暂不可用，请稍后重试")

    _access_token_cache["token"] = data["access_token"]
    _access_token_cache["expires_at"] = now + data.get("expires_in", 7200)
    logger.info("微信 access_token 已刷新")
    return data["access_token"]


async def get_qr_code_image(scene: str, page: str = "") -> bytes:
    """调用微信 getUnlimitedQRCode 接口，返回图片字节。

    实测微信回的是 JPEG，调用方别按 PNG 声明硬编码。
    scene 最长 32 字符，page 必须是已发布的小程序页面路径。
    """
    token = await get_access_token()
    body = {"scene": scene, "check_path": False, "width": 280}
    if page:
        body["page"] = page

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{WX_QRCODE_URL}?access_token={token}",
            json=body,
        )
        
        # Check HTTP status first
        if resp.status_code != 200:
            raise RuntimeError(f"生成小程序码失败: HTTP {resp.status_code}")
        
        content_type = resp.headers.get("content-type", "")
        
        # Handle JSON error responses
        if content_type.startswith("application/json"):
            data = resp.json()
            raise RuntimeError(f"生成小程序码失败: errcode={data.get('errcode')}, errmsg={data.get('errmsg')}")
        
        # Verify we got an image
        if "image" not in content_type and content_type:
            raise RuntimeError(f"生成小程序码失败: 非图片响应 (content-type: {content_type})")

        return resp.content
