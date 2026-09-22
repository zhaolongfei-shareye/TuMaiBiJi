import json
import logging
import time

import httpx

from app.core.config import settings
from app.core.errors import UserError

logger = logging.getLogger(__name__)

WX_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token"
WX_QRCODE_URL = "https://api.weixin.qq.com/wxa/getwxacodeunlimit"
WX_SEC_CHECK_URL = "https://api.weixin.qq.com/wxa/msg_sec_check"

# 实测（2026-09-22，现网凭据）：v2 送 2,501 字和 6,000 字都正常返回，不报错。
# 但文档口径是单次 2,500 字符，而且模型到底看了前 2,500 还是全文无从验证——
# 分段送才不漏检，所以按 2,000 字一段切。
SEC_CHUNK = 2000
# 一段最多送几次：整篇笔记上限 12,000 字，留一点余量
SEC_MAX_CHUNKS = 8

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


def _access_token_sync() -> str:
    """同步版取 token，和上面共用同一份缓存。

    为什么再来一份而不是复用异步版：笔记写入和创建分享这几条路由是同步 def（跑在
    threadpool 里），在里面 `asyncio.run` 一个协程去拿 token 是给自己埋雷。两边都只
    读写同一个 dict，最坏是并发时多取一次 token，不会拿到错值。
    """
    now = time.time()
    if _access_token_cache["token"] and _access_token_cache["expires_at"] > now + 300:
        return _access_token_cache["token"]

    with httpx.Client(timeout=10) as client:
        resp = client.get(
            WX_TOKEN_URL,
            params={
                "grant_type": "client_credential",
                "appid": settings.WECHAT_APP_ID,
                "secret": settings.WECHAT_APP_SECRET,
            },
        )
        # 同异步版：不用 raise_for_status，异常文本会带上含 AppSecret 的整条 URL
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


def check_text(openid: str, content: str) -> str:
    """送一段文本给微信内容安全，返回 pass / review / risky / unavailable。

    `unavailable` 是"这次没检成"而不是"内容没问题"：调用方必须把它和 pass 区分开，
    否则接口挂了会导致自检误报绿灯。
    """
    if not settings.SEC_CHECK_ENABLED:
        # 只有测试环境会走到这里（conftest 显式置 false，为的是整套用例不出网）
        return "unavailable"
    if not content or not content.strip():
        return "pass"
    try:
        token = _access_token_sync()
        payload = {"content": content, "version": 2, "scene": 1, "openid": openid}
        with httpx.Client(timeout=10) as client:
            # 不能用 client.post(json=...)：httpx 默认 ensure_ascii=True，中文会被转义成
            # \uXXXX，而微信这个接口**不解析转义**——实测同一段赌博引流文本，原样 UTF-8 体
            # 判 risky(20006)，转义体判 pass。用 json= 就等于把内容安全静默关掉。
            resp = client.post(
                f"{WX_SEC_CHECK_URL}?access_token={token}",
                content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
        data = resp.json()
    except Exception as exc:
        # httpx 异常文本可能带整条含 token 的 URL，只进日志
        logger.error("内容安全接口异常 %s: %s", type(exc).__name__, exc)
        return "unavailable"

    errcode = data.get("errcode")
    if errcode != 0:
        # 实测 44004=空内容（上面已挡）、40003=openid 非法、45009=限流、-1=系统繁忙。
        # 这些都不是"内容有问题"，日志级别按会不会让机制静默失效来分。
        if errcode in (40001, 42001, 40003, 48001):
            logger.error("内容安全接口配置异常 errcode=%s errmsg=%s", errcode, data.get("errmsg"))
        else:
            logger.warning("内容安全接口暂不可用 errcode=%s errmsg=%s", errcode, data.get("errmsg"))
        return "unavailable"

    suggest = ((data.get("result") or {}).get("suggest") or "").lower()
    if suggest in ("risky", "review"):
        logger.info("内容安全判定 %s label=%s", suggest, (data.get("result") or {}).get("label"))
        return suggest
    return "pass"


def enforce_text_safety(openid: str, *parts) -> None:
    """用户要公开或自己写的内容，送检；命中 risky/review 直接拒。

    策略上两条分开：**内容确实违规 → 拒**；**接口没检成（unavailable）→ 放行并记日志**，
    不能让微信侧抖动变成"用户存不了自己的笔记"。静默失效的风险由部署自检兜（deploy.sh
    会拿一段已知违规的文本打一次，断言必须被拦下来）。
    """
    chunks = []
    for part in parts:
        if isinstance(part, (list, tuple)):
            part = ' / '.join(str(x) for x in part)
        text = str(part or '').strip()
        if not text:
            continue
        for i in range(0, min(len(text), SEC_CHUNK * SEC_MAX_CHUNKS), SEC_CHUNK):
            chunks.append(text[i:i + SEC_CHUNK])

    for chunk in chunks:
        verdict = check_text(openid, chunk)
        if verdict == 'risky':
            raise UserError('内容包含违规信息，无法保存，请修改后再试')
        if verdict == 'review':
            raise UserError('内容需人工复核，请调整表述后再试')


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
