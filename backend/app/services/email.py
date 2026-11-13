"""邮箱登录那一发的邮件服务。

两条路：
- **生产**：AWS SES 或任意 SMTP（`EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` / `EMAIL_SMTP_USER` /
  `EMAIL_SMTP_PASSWORD` / `EMAIL_FROM_ADDRESS` 五栏都在 `service_secrets` 或 `.env` 里配齐）。
  用 Python 内置 `smtplib`，不引第三方包。
- **开发**：五栏任一为空 ⇒ 不发邮件，验证码写日志（`INFO` 级，关键字段打码只剩后四位）。
  H5 那一端照样能登录，只是要从服务器日志里抄那 6 位。与短信兜底同型。

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
import logging
import re
import secrets
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timezone

from app.core.config import settings
from app.services import service_secrets
from app.services.queue import get_redis_conn

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
CODE_RE = re.compile(r"^\d{4,6}$")
REDIS_CODE_PREFIX = "email:code:"
REDIS_COOL_PREFIX = "email:cool:"


def _resolve_all(cfg) -> dict:
    """五栏一次读完，往下传——分成五次读的话同一发要打通五次密钥库。

    ⚠ 这五个名字**必须写成字面量**、不许收一个 name 参数再 `resolve(name, ...)`：
    `tests/test_service_secrets.py::test_名单与真读它的字面量一字不差` 扫的是 AST 里
    `resolve("...")` 的第一个**实参常量**。走变量传进去它扫不到，`CONSUMED_NAMES` 与源码
    就分成两本账，后台那一页会对没人读的名字说"库里这一行正在生效"——那句是假话。
    """
    return {
        "smtp_host": service_secrets.resolve("EMAIL_SMTP_HOST", cfg.EMAIL_SMTP_HOST),
        "smtp_port": service_secrets.resolve("EMAIL_SMTP_PORT", str(cfg.EMAIL_SMTP_PORT)),
        "smtp_user": service_secrets.resolve("EMAIL_SMTP_USER", cfg.EMAIL_SMTP_USER),
        "smtp_password": service_secrets.resolve("EMAIL_SMTP_PASSWORD", cfg.EMAIL_SMTP_PASSWORD),
        "from_address": service_secrets.resolve("EMAIL_FROM_ADDRESS", cfg.EMAIL_FROM_ADDRESS),
    }


def _email_ready(creds: dict) -> bool:
    """五栏全有值才算「能发邮件」。任一为空回 False ⇒ 走日志兜底。纯函数，不出网不查库。"""
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
    """比对验证码。用 `GETDEL`（Redis 6.2+）原子取走：**取与删在同一条命令里**，
    并发请求不会读到同一枚码再各自判"我对了"。

    比完就删：一枚码只能用一次，不管对错（错了也删——不许留着让人反复试）。
    redis-py 版本不带 `getdel()` 时回退到 pipeline（MULTI 里取+删，仍比裸 GET+DEL 安全）。

    ⚠ 同步打 Redis ⇒ 异步口调用它必须裹 `asyncio.to_thread`。
    """
    if not EMAIL_RE.match(email) or not CODE_RE.match(code):
        return False
    try:
        conn = get_redis_conn()
        key = f"{REDIS_CODE_PREFIX}{email}"
        if hasattr(conn, "getdel"):
            stored = conn.getdel(key)
        else:
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
    """发邮件。配齐了走 SMTP，没配齐写日志。返回 True = 发出去了（或日志里记了），False = 失败。

    失败时不抛异常、不设冷却（冷却由调用方在拿到 True 之后写）：
    与 `sms.py` 同一条理由——邮件发不出去，验证码已经在日志里了，开发环境还能用；
    生产环境配齐凭据之前，至少不会 500。
    """
    creds = await asyncio.to_thread(_resolve_all, settings)
    if not _email_ready(creds):
        logger.info("【邮件兜底】email=%s…%s code=%s（EMAIL 凭据未配齐，走日志兜底）",
                     email[:3], email[-4:], code)
        return True

    try:
        await _smtp_send(email, code, creds)
        logger.info("邮件已发送 email=%s…%s", email[:3], email[-4:])
        return True
    except Exception:
        logger.exception("邮件发送失败 email=%s…%s", email[:3], email[-4:])
        return False


async def _smtp_send(email: str, code: str, creds: dict) -> None:
    """SMTP 发送。用 Python 内置 `smtplib`，支持 STARTTLS（587 端口）与 SSL（465 端口）。

    邮件内容只有一行：验证码 + 有效期。不加链接、不加品牌图——H5 登录页不需要那些，
    多了反而容易被邮箱服务商判成营销邮件。
    """
    smtp_host = creds["smtp_host"]
    smtp_port = int(creds["smtp_port"])
    smtp_user = creds["smtp_user"]
    smtp_password = creds["smtp_password"]
    from_address = creds["from_address"]

    ttl = settings.EMAIL_CODE_TTL_MINUTES
    subject = "图麦笔记验证码"
    body = f"您的验证码为 {code}，{ttl} 分钟内有效，请勿泄露。"

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_address
    msg["To"] = email

    # 端口 465 = SSL，587 = STARTTLS，25 = 明文（不推荐）。
    # 这里只处理 465 和 587 两种，25 留给运维自己配。
    if smtp_port == 465:
        import ssl
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as server:
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, [email], msg.as_string())
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.sendmail(from_address, [email], msg.as_string())
