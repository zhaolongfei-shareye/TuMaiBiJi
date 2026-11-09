"""手机号登录那一发的短信服务。

两条路：
- **生产**：腾讯云 SMS（`SMS_SECRET_ID` / `SMS_SECRET_KEY` / `SMS_SDK_APPID` / `SMS_SIGN_NAME` /
  `SMS_TEMPLATE_ID` 五栏都在 `service_secrets` 或 `.env` 里配齐）。签名走 TC3-HMAC-SHA256，
  整条链只用 `httpx`，不引 `tencentcloud-sdk-python`——那一枚包会带几十个子模块进来，
  而这里只打一个 `SendSms` 动作。
- **开发**：五栏任一为空 ⇒ 不发短信，验证码写日志（`INFO` 级，关键字段打码只剩后四位）。
  H5 那一端照样能登录，只是要从服务器日志里抄那 6 位。这条路径是站长 10-09 拍「先跑通再配凭据」
  的那一套，与 `APPLE_CLIENT_ID` 留空 = 503 不同型——登录口不能因为短信没配就整扇关掉。

验证码存 Redis，key = `sms:code:<phone>`，TTL = `SMS_CODE_TTL_MINUTES`。
同一手机号两次发送之间最少隔 `SMS_COOLDOWN_SECONDS` 秒，key = `sms:cool:<phone>`。
两道 key 都用 `queue.get_redis_conn()` 那一条现成连接，不另起池。

为什么 `provider_uid` 存 `phone:<号码>` 而不是裸号码：`account_identities` 那张表里
`(provider, provider_uid)` 是唯一索引，裸号码和微信 openid 在字符串空间里不会撞，
但加前缀是防将来有人拿同一串号码去注册 Apple 身份（Apple 那边也是手机号当 UID 的场景）
时，两道身份被当成同一个人。前缀成本几乎为零，防线留在这里比写在注释里靠谱。
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

PHONE_RE = re.compile(r"^1\d{10}$")
CODE_RE = re.compile(r"^\d{4,6}$")
REDIS_CODE_PREFIX = "sms:code:"
REDIS_COOL_PREFIX = "sms:cool:"


def _resolve_all(cfg) -> dict:
    """五栏一次读完，往下传——分成五次读的话同一发要打通五次密钥库（每次一趟同步 SELECT，
    撞锁时最坏等满 `busy_timeout` 5000ms）。

    ⚠ 这五个名字**必须写成字面量**、不许收一个 name 参数再 `resolve(name, ...)`：
    `tests/test_service_secrets.py::test_名单与真读它的字面量一字不差` 扫的是 AST 里
    `resolve("...")` 的第一个**实参常量**。走变量传进去它扫不到，`CONSUMED_NAMES` 与源码
    就分成两本账，后台那一页会对没人读的名字说"库里这一行正在生效"——那句是假话。

    `cfg` 显式传进来而不是就地取模块级的 `settings`：一是这一发要落进
    `asyncio.to_thread(_resolve_all, settings)` 那一趟（判据认的是至少两个实参），
    二是用例可以塞一份假配置进去，不必 monkeypatch 全局。
    """
    return {
        "secret_id": service_secrets.resolve("SMS_SECRET_ID", cfg.SMS_SECRET_ID),
        "secret_key": service_secrets.resolve("SMS_SECRET_KEY", cfg.SMS_SECRET_KEY),
        "app_id": service_secrets.resolve("SMS_SDK_APPID", cfg.SMS_SDK_APPID),
        "sign_name": service_secrets.resolve("SMS_SIGN_NAME", cfg.SMS_SIGN_NAME),
        "template_id": service_secrets.resolve("SMS_TEMPLATE_ID", cfg.SMS_TEMPLATE_ID),
    }


def _sms_ready(creds: dict) -> bool:
    """五栏全有值才算「能发短信」。任一为空回 False ⇒ 走日志兜底。纯函数，不出网不查库。"""
    return all(creds.values())


def generate_code() -> str:
    """6 位数字验证码。用 `secrets` 模块（CSPRNG），`random` 是 Mersenne Twister，
    连续观察若干枚就能推内部状态、预测后续验证码。"""
    return f"{secrets.randbelow(1_000_000):06d}"


def check_cooldown(phone: str) -> int:
    """返回这一枚手机号还要等几秒才能再发。0 = 现在就能发。

    ⚠ 同步打 Redis ⇒ 异步口调用它必须裹 `asyncio.to_thread`（在册于
    `tests/test_事件循环里不许同步调用.py` 的 BLOCKING 名单）。
    """
    try:
        conn = get_redis_conn()
        ttl = conn.ttl(f"{REDIS_COOL_PREFIX}{phone}")
        return max(0, ttl) if ttl and ttl > 0 else 0
    except Exception:
        # Redis 挂了不许挡住登录：回 0 = 不冷却。代价是极端情况下能连发，但比「发短信接口 500」好。
        return 0


def store_code(phone: str, code: str) -> None:
    """把验证码写进 Redis，TTL = `SMS_CODE_TTL_MINUTES`。

    冷却 key 不在这里写——见 `set_cooldown`（发送失败不该罚用户等一分钟）。

    Redis 不可用时**往外抛**：调用方（路由）应当回 503，因为没有存储就没有验证——
    静默跳过这一句等于告诉用户"验证码已发"，而它从没被记下来，下一次登录必然 400。
    """
    conn = get_redis_conn()
    ttl = settings.SMS_CODE_TTL_MINUTES * 60
    conn.setex(f"{REDIS_CODE_PREFIX}{phone}", ttl, code)


def set_cooldown(phone: str) -> None:
    """冷却 key 单独拆出来，只有发送成功才写——短信发失败不该罚用户等 60 秒。"""
    try:
        conn = get_redis_conn()
        conn.setex(f"{REDIS_COOL_PREFIX}{phone}", settings.SMS_COOLDOWN_SECONDS, "1")
    except Exception:
        pass


def verify_code(phone: str, code: str) -> bool:
    """比对验证码。用 `GETDEL`（Redis 6.2+）原子取走：**取与删在同一条命令里**，
    并发请求不会读到同一枚码再各自判"我对了"。

    比完就删：一枚码只能用一次，不管对错（错了也删——不许留着让人反复试）。
    redis-py 版本不带 `getdel()` 时回退到 pipeline（MULTI 里取+删，仍比裸 GET+DEL 安全）。

    ⚠ 同步打 Redis ⇒ 异步口调用它必须裹 `asyncio.to_thread`。
    """
    if not PHONE_RE.match(phone) or not CODE_RE.match(code):
        return False
    try:
        conn = get_redis_conn()
        key = f"{REDIS_CODE_PREFIX}{phone}"
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
        logger.exception("验证码比对失败 phone=%s…%s", phone[:3], phone[-4:])
        return False


async def send_code(phone: str, code: str) -> bool:
    """发短信。配齐了走腾讯云，没配齐写日志。返回 True = 发出去了（或日志里记了），False = 失败。

    失败时不抛异常、不设冷却（冷却由调用方在拿到 True 之后写）：
    站长 10-09 拍的那条「登录口不许因为旁路挂掉」在这里的落点——
    短信发不出去，验证码已经在日志里了，开发环境还能用；生产环境配齐凭据之前，至少不会 500。
    """
    creds = await asyncio.to_thread(_resolve_all, settings)
    if not _sms_ready(creds):
        logger.info("【短信兜底】phone=%s…%s code=%s（SMS 凭据未配齐，走日志兜底）",
                     phone[:3], phone[-4:], code)
        return True

    try:
        await _tencent_send(phone, code, creds)
        logger.info("短信已发送 phone=%s…%s", phone[:3], phone[-4:])
        return True
    except Exception:
        logger.exception("短信发送失败 phone=%s…%s", phone[:3], phone[-4:])
        return False


async def _tencent_send(phone: str, code: str, creds: dict) -> None:
    """腾讯云 SMS `SendSms` 接口。签名算法 TC3-HMAC-SHA256，文档在 `cloud.tencent.com/document/product/382/52064`。

    这一发只用 `httpx`，不引 SDK。签名四步：
    1. 拼 CanonicalRequest（HTTP method + URI + querystring + headers + signed headers + payload hash）
    2. 拼 StringToSign（算法 + 时间戳 + credential scope + CanonicalRequest 的 SHA256）
    3. 派生签名密钥（HMAC 链：Date → Service → tc3 request）
    4. 算 HMAC-SHA256(StringToSign) 转 hex，塞进 Authorization 头

    `X-TC-Region` 必填（国内消息固定 `ap-guangzhou`），不传腾讯云回 `MissingParameter`。
    """
    secret_id = creds["secret_id"]
    secret_key = creds["secret_key"]
    app_id = creds["app_id"]
    sign_name = creds["sign_name"]
    template_id = creds["template_id"]

    host = "sms.tencentcloudapi.com"
    action = "SendSms"
    version = "2021-01-11"
    region = "ap-guangzhou"
    now = datetime.now(timezone.utc)
    timestamp = int(now.timestamp())
    date = now.strftime("%Y-%m-%d")

    payload = json.dumps({
        "SmsSdkAppId": app_id,
        "SignName": sign_name,
        "TemplateId": template_id,
        "TemplateParamSet": [code],
        "PhoneNumberSet": [f"+86{phone}"],
    })
    content_type = "application/json; charset=utf-8"

    # Step 1: CanonicalRequest
    # 参与签名的 header 必须按 key 字典序排；x-tc-action 小写（官方文档明确要求）。
    # x-tc-region 也进签名头集合，不签进去 = 可以被中间人改。
    hashed_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = (
        f"POST\n/\n\ncontent-type:{content_type}\nhost:{host}\n"
        f"x-tc-action:{action.lower()}\nx-tc-region:{region}\n\n"
        f"content-type;host;x-tc-action;x-tc-region\n{hashed_payload}"
    )

    # Step 2: StringToSign
    credential_scope = f"{date}/sms/tc3_request"
    hashed_canonical = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = f"TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical}"

    # Step 3: Signing key
    def _hmac_sign(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    secret_date = _hmac_sign(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = _hmac_sign(secret_date, "sms")
    secret_signing = _hmac_sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    # Step 4: Authorization
    authorization = (
        f"TC3-HMAC-SHA256 Credential={secret_id}/{credential_scope}, "
        f"SignedHeaders=content-type;host;x-tc-action;x-tc-region, Signature={signature}"
    )

    headers = {
        "Authorization": authorization,
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
        logger.error("腾讯云 SMS HTTP %s: %s", resp.status_code, resp.text[:200])
        raise RuntimeError(f"SMS HTTP {resp.status_code}")

    data = resp.json()
    error = (data.get("Response") or {}).get("Error")
    if error:
        logger.error("腾讯云 SMS 业务错误: %s", error)
        raise RuntimeError(f"SMS business error: {error.get('Code')} {error.get('Message')}")
