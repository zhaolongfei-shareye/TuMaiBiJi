import logging
import time

import httpx

from app.core.config import settings

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
        resp.raise_for_status()
        data = resp.json()

    if "access_token" not in data:
        raise RuntimeError(f"获取 access_token 失败: {data}")

    _access_token_cache["token"] = data["access_token"]
    _access_token_cache["expires_at"] = now + data.get("expires_in", 7200)
    logger.info("微信 access_token 已刷新")
    return data["access_token"]


async def get_qr_code_image(scene: str, page: str = "") -> bytes:
    """调用微信 getUnlimitedQRCode 接口，返回 PNG 图片字节。

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
        content_type = resp.headers.get("content-type", "")
        if "image" not in content_type and resp.headers.get("content-type") != "application/json":
            pass
        if resp.headers.get("content-type", "").startswith("application/json"):
            data = resp.json()
            raise RuntimeError(f"生成小程序码失败: errcode={data.get('errcode')}, errmsg={data.get('errmsg')}")

        return resp.content
