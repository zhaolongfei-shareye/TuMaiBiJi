"""邮箱验证码那一发的邮件服务。

两条路：
- **生产**：腾讯云邮件推送 SES 的 **API**（`EMAIL_SES_SECRET_ID` / `EMAIL_SES_SECRET_KEY` /
  `EMAIL_SES_FROM_ADDRESS` / `EMAIL_SES_TEMPLATE_ID` 四栏都在 `service_secrets` 或 `.env` 里配齐）。
  签名走 TC3-HMAC-SHA256，整条链只用 `httpx`，不引 SDK——与 `sms.py` 同一条理由。
- **开发**：四栏任一为空 ⇒ 不发邮件，验证码写日志（`INFO` 级，关键字段打码只剩后四位）。
  H5 那一端照样能登录，只是要从服务器日志里抄那 6 位。与短信兜底同型。

⚠ 为什么这一层不是 SMTP（11-15 实测，三条都是现读不是文档转述）：
1. SES 对 2026-03-02 之后新建的账号关掉了 SMTP 发信：控制台那枚「设置 SMTP 密码」按钮持续禁用，
   `ListEmailAddress` 回 `SmtpPwdType=0`。
2. `SendEmail` 只认模板正文：`Body`／`Content`／`HtmlContent`／`TextContent`／`HtmlBody`／
   `EmailContent` 全部回 `UnknownParameter`，`Simple` 里的子字段同样回 `UnknownParameter`（官方
   模型里 `Simple` 只剩 `Html`/`Text` 两栏、且注明"已废弃"）；只有 `Template` 这一支走得到发信
   那一步（官方文档「默认仅支持使用模板发送邮件」在这一枚账号上坐实）。
3. 模板要过审核：新建后控制台「发信模板」那一行念「审核中」，页面原话「预计1个工作日内完成审核
   （周末、节假日顺延）」。**同一发请求在 11-15 19:31 前回 `FailedOperation.InvalidTemplateID`、
   19:41 起回 `MessageId` 且真投递**，中间唯一的读数是模板那行从审核中变成 `TemplateStatus=0`
   （官方数据结构：0=已通过）⇒ 这一档按"审核没完就发不出去"办，成因只记到这一句、不再往上推。

送达那一格已经量过（11-15 夜，本机直发）：同一把子账号密钥连发 6 封到外部邮箱，正文两个变量
全渲染，服务端 `GetSendEmailStatus` 六行 `SendStatus=0`（处理成功）＋ `DeliverStatus=1`（递送成功）。
成功回体只有 `{RequestId, MessageId}` 两栏——**没有 `SendStatus`**，所以回执以 `MessageId` 为准。

验证码存 Redis，key = `email:code:<email>`，TTL = `EMAIL_CODE_TTL_MINUTES`。
同一邮箱两次发送之间最少隔 `EMAIL_COOLDOWN_SECONDS` 秒，key = `email:cool:<email>`。
两道 key 都用 `queue.get_redis_conn()` 那一条现成连接，不另起池。

为什么 `provider_uid` 存 `email:<邮箱>` 而不是裸邮箱：与 `sms.py` 同一条理由——
`account_identities` 那张表里 `(provider, provider_uid)` 是唯一索引，加前缀是防将来
有人拿同一串邮箱去注册 Apple 身份时，两道身份被当成同一个人。
"""
import asyncio
import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.services import service_secrets
from app.services.queue import get_redis_conn

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
CODE_RE = re.compile(r"^\d{4,6}$")
REDIS_CODE_PREFIX = "email:code:"
REDIS_COOL_PREFIX = "email:cool:"


def _resolve_all(cfg) -> dict:
    """四栏一次读完，往下传——分成四次读的话同一发要打通四次密钥库。

    ⚠ 这四个名字**必须写成字面量**、不许收一个 name 参数再 `resolve(name, ...)`：
    `tests/test_service_secrets.py::test_名单与真读它的字面量一字不差` 扫的是 AST 里
    `resolve("...")` 的第一个**实参常量**。走变量传进去它扫不到，`CONSUMED_NAMES` 与源码
    就分成两本账，后台那一页会对没人读的名字说"库里这一行正在生效"——那句是假话。
    """
    return {
        "secret_id": service_secrets.resolve("EMAIL_SES_SECRET_ID", cfg.EMAIL_SES_SECRET_ID),
        "secret_key": service_secrets.resolve("EMAIL_SES_SECRET_KEY", cfg.EMAIL_SES_SECRET_KEY),
        "from_address": service_secrets.resolve("EMAIL_SES_FROM_ADDRESS", cfg.EMAIL_SES_FROM_ADDRESS),
        "template_id": service_secrets.resolve("EMAIL_SES_TEMPLATE_ID", cfg.EMAIL_SES_TEMPLATE_ID),
    }


def _email_ready(creds: dict) -> bool:
    """四栏全有值才算「能发邮件」。任一为空回 False ⇒ 走日志兜底。纯函数，不出网不查库。"""
    return all(creds.values())


def generate_code() -> str:
    """6 位数字验证码。与 `sms.py` 共用同一枚生成器（`secrets` 模块，CSPRNG）。"""
    return f"{secrets.randbelow(1_000_000):06d}"


def check_cooldown(email: str) -> int:
    """返回这一枚邮箱还要等几秒才能再发。0 = 现在就能发。

    ⚠ 同步打 Redis ⇒ 异步口调用它必须裹 `asyncio.to_thread`（在册于
    `tests/test_事件循环里不许同步调用.py` 的 BLOCKING 名单）。
    """
    try:
        conn = get_redis_conn()
        ttl = conn.ttl(f"{REDIS_COOL_PREFIX}{email}")
        return max(0, ttl) if ttl and ttl > 0 else 0
    except Exception:
        # Redis 挂了不许挡住登录：回 0 = 不冷却。代价是极端情况下能连发，但比「发邮件接口 500」好。
        return 0


def store_code(email: str, code: str) -> None:
    """把验证码写进 Redis，TTL = `EMAIL_CODE_TTL_MINUTES`。

    Redis 不可用时**往外抛**：调用方（路由）应当回 503，因为没有存储就没有验证——
    静默跳过这一句等于告诉用户"验证码已发"，而它从没被记下来，下一次登录必然 400。
    """
    conn = get_redis_conn()
    ttl = settings.EMAIL_CODE_TTL_MINUTES * 60
    conn.setex(f"{REDIS_CODE_PREFIX}{email}", ttl, code)


def set_cooldown(email: str) -> None:
    """冷却 key 单独拆出来，只有发送成功才写——邮件发失败不该罚用户等 60 秒。"""
    try:
        conn = get_redis_conn()
        conn.setex(f"{REDIS_COOL_PREFIX}{email}", settings.EMAIL_COOLDOWN_SECONDS, "1")
    except Exception:
        pass


def verify_code(email: str, code: str) -> bool:
    """比对验证码。在 `MULTI` 里原子取走：**取与删在同一次事务里**，
    并发请求不会读到同一枚码再各自判"我对了"。

    比完就删：一枚码只能用一次，不管对错（错了也删——不许留着让人反复试）。

    ⚠ 不用 `GETDEL`：它要 Redis 6.2，而现网那台是 **6.0.16**（11-15 20:47 现读
    `conn.info("server")`）。原来那句 `hasattr(conn, "getdel")` 判的是**客户端**有没有这个
    方法（服务器上的 redis-py 8.1.0 一直有），命令发出去服务端回 `unknown command GETDEL`，
    异常被下面的 `except` 吞成 False ⇒ 正码也验不过。`MULTI` 里的 `GET`+`DEL` 在 6.0 与
    6.2+ 上都是一次往返、都原子，不必再分档（`pipeline(True)` 那个位置参数就是
    `transaction`，两版客户端现验过）。

    ⚠ 同步打 Redis ⇒ 异步口调用它必须裹 `asyncio.to_thread`。
    """
    if not EMAIL_RE.match(email) or not CODE_RE.match(code):
        return False
    try:
        conn = get_redis_conn()
        key = f"{REDIS_CODE_PREFIX}{email}"
        pipe = conn.pipeline(True)
        pipe.get(key)
        pipe.delete(key)
        stored = pipe.execute()[0]
        if stored is None:
            return False
        return hmac.compare_digest(
            stored.decode() if isinstance(stored, bytes) else stored, code)
    except Exception:
        logger.exception("验证码比对失败 email=%s…%s", email[:3], email[-4:])
        return False


async def send_code(email: str, code: str) -> bool:
    """发邮件。配齐了走腾讯云 SES API，没配齐写日志。返回 True = 发出去了（或日志里记了），False = 失败。

    失败时不抛异常、不设冷却（冷却由调用方在拿到 True 之后写）：
    与 `sms.py` 同一条理由——邮件发不出去，验证码已经在日志里了，开发环境还能用；
    生产环境配齐凭据之前，至少不会 500。
    """
    creds = await asyncio.to_thread(_resolve_all, settings)
    if not _email_ready(creds):
        logger.info("【邮件兜底】email=%s…%s code=%s（EMAIL_SES 四栏未配齐，走日志兜底）",
                     email[:3], email[-4:], code)
        return True

    try:
        await _ses_send(email, code, creds)
        logger.info("邮件已发送 email=%s…%s", email[:3], email[-4:])
        return True
    except Exception:
        logger.exception("邮件发送失败 email=%s…%s", email[:3], email[-4:])
        return False


async def _ses_send(email: str, code: str, creds: dict) -> None:
    """腾讯云 SES `SendEmail`（版本 `2020-10-02`），只按模板发。

    签名与 `sms.py:_tencent_send` 同一套 TC3-HMAC-SHA256 四步，SignedHeaders 也带
    `x-tc-action`/`x-tc-region`（11-15 拿同一把 SES 子账号密钥现验过这一型回 `http 200`＋正文）；
    两个头不签进去就等于中间人可以改动作名与地域。

    三处形状是实测不是抄文档（细节在本文件开头那三条）：发信地址那栏叫 `FromEmailAddress`（不叫
    `Sender`，回 `MissingParameter` 点名的就是它）；`Subject` 是顶层必填、模板只管正文；
    正文只有 `Template` 这一支收得进去，`TemplateData` 要的是**一个 JSON 字符串**而不是对象。
    """
    template_id = str(creds["template_id"]).strip()
    if not template_id.isdigit():
        # 后台密钥页那一格容易粘成模板名，这里不转成 int 打出去只会回一句看不懂的 InvalidTemplateID。
        raise RuntimeError(f"EMAIL_SES_TEMPLATE_ID 要的是纯数字模板 ID，读到的是 {template_id[:16]!r}")

    host = "ses.tencentcloudapi.com"
    action = "SendEmail"
    version = "2020-10-02"
    region = "ap-hongkong"
    now = datetime.now(timezone.utc)
    timestamp = int(now.timestamp())
    date = now.strftime("%Y-%m-%d")

    payload = json.dumps({
        "FromEmailAddress": creds["from_address"],
        "Subject": "图麦笔记验证码",
        "Destination": [email],
        # 1 = 触发类（验证码）。SES 文档把验证码归这一类；11-15 夜六发真信全按这一档发出去并
        # 投递成功，所以这一枚账号不需要另外报备那一类。
        "TriggerType": 1,
        "Template": {
            "TemplateID": int(template_id),
            # {{minutes}} 从 `EMAIL_CODE_TTL_MINUTES` 现读：正文里那句「几分钟后失效」不许跟
            # Redis 那枚 TTL 说两样话，所以不写进模板里冻死。
            "TemplateData": json.dumps({"code": code,
                                       "minutes": str(settings.EMAIL_CODE_TTL_MINUTES)}),
        },
    })
    content_type = "application/json; charset=utf-8"

    hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = (
        f"POST\n/\n\ncontent-type:{content_type}\nhost:{host}\n"
        f"x-tc-action:{action.lower()}\nx-tc-region:{region}\n\n"
        f"content-type;host;x-tc-action;x-tc-region\n{hashed_payload}"
    )
    credential_scope = f"{date}/ses/tc3_request"
    hashed_canonical = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = f"TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical}"

    def _hmac_sign(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    secret_date = _hmac_sign(("TC3" + creds["secret_key"]).encode("utf-8"), date)
    secret_service = _hmac_sign(secret_date, "ses")
    secret_signing = _hmac_sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    headers = {
        "Authorization": (
            f"TC3-HMAC-SHA256 Credential={creds['secret_id']}/{credential_scope}, "
            f"SignedHeaders=content-type;host;x-tc-action;x-tc-region, Signature={signature}"
        ),
        "Content-Type": content_type,
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": version,
        "X-TC-Region": region,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(f"https://{host}", headers=headers, content=payload)

    if resp.status_code >= 400:
        logger.error("腾讯云 SES HTTP %s: %s", resp.status_code, resp.text[:200])
        raise RuntimeError(f"SES HTTP {resp.status_code}")

    data = resp.json()
    body = data.get("Response") or {}
    error = body.get("Error")
    if error:
        # SES 的业务失败也回 http 200，错只在 `Response.Error` 里，所以这一句不能省。
        logger.error("腾讯云 SES 业务错误: %s", error)
        raise RuntimeError(f"SES business error: {error.get('Code')} {error.get('Message')}")
    # 成功回体实测只有这两栏（11-15 夜六发全一样），`MessageId` 是唯一那张贴纸：
    # 拿它能在 `GetSendEmailStatus` 里查到 `SendStatus`/`DeliverStatus`，"投到了"这句话才有出处。
    logger.info("SES MessageId=%s", body.get("MessageId"))
