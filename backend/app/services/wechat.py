import hashlib
import json
import logging
import time
from collections import OrderedDict

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
# 一段最多送几次：8 段 × 2,000 = 16,000 字，这就是**单个字段能被检到的上限**。
# notes 路由的 MAX_BODY / MAX_SUMMARY 特意钉在同一个数上——手打内容一旦超过这个窗口，
# 多出来的部分永远不会被检，把违规文本垫在一万六千字之后就是一条现成的绕过路径。
# 抓取来的正文可以远超这个窗口（worker 直接落库），那部分只能检前 16,000 字，
# 所以下面截断时会记一条 warning，别让"检了"和"其实只检了开头"混成一件事。
SEC_MAX_CHUNKS = 8

_access_token_cache = {"token": None, "expires_at": 0}

# 小程序码是"同一个 scene 出一张一模一样的图"，每次都去微信要等于白烧那个接口的日配额，
# 而且从我们这边的错误率完全看不出来（微信回得一切正常，钱却花掉了）。
# 上限是刻意的：一张码实测约 55KB，100 张封顶 5.5MB，这台机器内存本来就紧。
# 键里带 env_version，所以测试期改成 trial、发布前改回 release 时，旧图自然失效。
_QR_CACHE_MAX = 100
_qr_cache: "OrderedDict[tuple, bytes]" = OrderedDict()

# 内容安全是**按次配额**的接口：未上架的小程序 100 次/天（实测 2026-09-23 打到过上限，
# 回 45009），上架后才是 200 万次/天。一次保存要按字段打好几趟，而其中绝大多数是
# "这段文本今天已经判过正常"——所以按 (openid, 文本散列) 记住 pass。
# 只记 pass：risky/review 不进缓存，判罚偶尔不对时下一次还能纠正；unavailable 更进不得，
# 那等于把"配额打光"固化成永久放行，第二天额度恢复了也不会再检。
_SEC_PASS_CACHE_MAX = 4000
_sec_pass_cache: "OrderedDict[tuple, bool]" = OrderedDict()


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

    cache_key = (openid, hashlib.sha256(content.encode("utf-8")).hexdigest())
    if _sec_pass_cache.get(cache_key):
        # 同一个人同一段文本判过"正常"就不再问微信。省下来的都是真额度：
        # 一次保存原本要按 6 个字段各打一次，而移动端保存往往把没改过的字段一起 PUT 回来。
        _sec_pass_cache.move_to_end(cache_key)
        return "pass"

    verdict = _ask_sec_check(openid, content)["verdict"]
    if verdict == "pass":
        _sec_pass_cache[cache_key] = True
        _sec_pass_cache.move_to_end(cache_key)
        while len(_sec_pass_cache) > _SEC_PASS_CACHE_MAX:
            _sec_pass_cache.popitem(last=False)
    return verdict


def probe_sec_check(openid: str, content: str) -> dict:
    """部署自检用的那一趟：必定真打，并且把微信原样回的 errcode 一起交出来。

    为什么不复用 check_text：同样是"没检成"，三种原因的处置完全不同——网络抖动不用管；
    额度打光是今天剩下的时间内容安全等于没做，明天 00:00 自己恢复，不该拦下这次部署；
    凭据或 openid 错则是永远不好，必须拦。自检要按这个分流，就只有拿得到 errcode 才行。
    也不吃判定缓存：自检要的就是这一趟真的出网。
    """
    if not settings.SEC_CHECK_ENABLED:
        return {"verdict": "unavailable", "errcode": "disabled"}
    return _ask_sec_check(openid, content)


def _ask_sec_check(openid: str, content: str) -> dict:
    """真打一趟 msgSecCheck，回 {"verdict": ..., "errcode": ...}。"""
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
        return {"verdict": "unavailable", "errcode": "exception"}

    errcode = data.get("errcode")
    if errcode != 0:
        # 实测 44004=空内容（上面已挡）、40003=openid 非法、45009=限流、-1=系统繁忙。
        # 这些都不是"内容有问题"，日志级别按会不会让机制静默失效来分。
        if errcode in (45009, 44991):
            # 额度打光不是"抖一下"：未上架的小程序这个接口只有 100 次/天（2026-09-23 实测
            # 打到过上限），此后今天所有检查看作没做。必须留 ERROR，否则它和一次普通的
            # 网络抖动在日志里长得一模一样。
            logger.error(
                "内容安全额度已打光（errcode=%s），此后今天的检查看作没做。"
                "未上架小程序上限 100 次/天，上架后 200 万次/天：%s",
                errcode, data.get("errmsg"),
            )
        elif errcode in (40001, 42001, 40003, 48001):
            logger.error("内容安全接口配置异常 errcode=%s errmsg=%s", errcode, data.get("errmsg"))
        else:
            logger.warning("内容安全接口暂不可用 errcode=%s errmsg=%s", errcode, data.get("errmsg"))
        return {"verdict": "unavailable", "errcode": errcode}

    suggest = ((data.get("result") or {}).get("suggest") or "").lower()
    if suggest in ("risky", "review"):
        logger.info("内容安全判定 %s label=%s", suggest, (data.get("result") or {}).get("label"))
        return {"verdict": suggest, "errcode": 0}
    return {"verdict": "pass", "errcode": 0}


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
        window = SEC_CHUNK * SEC_MAX_CHUNKS
        if len(text) > window:
            logger.warning(
                "内容安全只检了前 %d 字，后面 %d 字未送检（openid=%s）",
                window, len(text) - window, openid,
            )
        for i in range(0, min(len(text), window), SEC_CHUNK):
            chunks.append(text[i:i + SEC_CHUNK])

    for chunk in chunks:
        verdict = check_text(openid, chunk)
        if verdict == 'risky':
            raise UserError('内容包含违规信息，无法保存，请修改后再试')
        if verdict == 'review':
            raise UserError('内容需人工复核，请调整表述后再试')


async def get_qr_code_image(scene: str, page: str = "") -> bytes:
    """调用微信 getUnlimitedQRCode 接口，返回图片字节；同一张码只真打一次。

    实测微信回的是 JPEG，调用方别按 PNG 声明硬编码。
    scene 最长 32 字符。page 那个路径必须存在于码指向的那个版本里：不传 env_version
    时微信按正式版（release）出码，所以在过审之前那张码扫开必然打不开——这就是
    SHARE_QR_ENV_VERSION 存在的理由，测试期填 trial，发布前改回 release。

    命中缓存时连 access_token 都不取：这个接口没有鉴权，被反复打的时候烧的是我们
    自己的微信接口配额，而失败方从我们的日志里看不出来（微信回得一切正常）。
    """
    # 填错值微信回 40097 invalid args，用户只会看到一句"小程序码生成失败"，查不到原因。
    # 所以这里宁可静默退回最安全的 release。
    env_version = settings.SHARE_QR_ENV_VERSION
    if env_version not in ("release", "trial", "develop"):
        logger.warning("SHARE_QR_ENV_VERSION=%r 不是合法值，按 release 出码", env_version)
        env_version = "release"

    key = (env_version, page, scene)
    cached = _qr_cache.get(key)
    if cached is not None:
        _qr_cache.move_to_end(key)
        return cached

    token = await get_access_token()
    body = {"scene": scene, "check_path": False, "width": 280, "env_version": env_version}
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

        image = resp.content
        _qr_cache[key] = image
        _qr_cache.move_to_end(key)
        while len(_qr_cache) > _QR_CACHE_MAX:
            _qr_cache.popitem(last=False)
        # 这一行是"有没有真的回源"唯一的外部证据：命中缓存时不打。
        # 只记 scene 的前 6 位和字节数——URL 上挂着 access_token，整条请求日志都不能留。
        logger.info("小程序码回源微信 env=%s scene=%s… %d 字节",
                    env_version, scene[:6], len(image))
        return image
