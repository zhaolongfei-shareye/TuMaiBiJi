"""管理页这一把独立的钥匙（方案 docs/方案-cn后台资产管理.md 锚点 A7）。

为什么不用 `users` 表加一列 `is_admin`：那是把"运营凭证"和"一个人的身份"永久绑在一起——
将来第二个人要管后台就得改表，而小程序那 35 个真实用户里任何一条 token 都会多一个
"万一被提权"的可能性。这一把钥匙只开 `/api/admin/*` 和 `/ops` 背后的那几个口，
泄露了影响的也只是"全站首页那一张图"，且换掉 `.env` 里那一行就当场作废。

三个判据合起来才是这一层，缺一个都白搭：

1. **带 `scope`。** `core/auth.py:_decode_token` 见 scope 就拒（那是防私密解锁凭证当登录钥匙用），
   这条现成的闸门顺手把管理凭证也关在用户那批门外：拿着管理 session 打 `GET /api/notes`
   是 401，而不是"看运气"。反向也判：`get_admin` 只认 `scope == "admin"`，
   用户登录 token 与 15 分钟解锁 token 都开不了管理口。
2. **带 `atk`——ADMIN_TOKEN 的指纹。** 不加这一格，"可轮换"是句空话：session 是用
   `JWT_SECRET_KEY` 签的，改了 `ADMIN_TOKEN` 之后已经发出去的那把还能用到自然过期。
   指纹的写法照 `core/private_access.py:_pin_fingerprint`（加前缀再散，日志里看见指纹
   也推不回原值）。
3. **`ADMIN_TOKEN` 为空 → 一律 503，绝不当成"没设密码"放行。** 与 `APPLE_CLIENT_ID`
   在 `/v1/auth/apple` 那一条同型：猜不出正确值时必须是"这个功能不可用"，不能是"门槛消失"。
   这里不拒启动：现网 `.env` 今天还没有这一行，硬失败等于让下一次部署起不来。
"""
import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)

ADMIN_SCOPE = "admin"


def enabled() -> bool:
    return bool(_configured())


def _configured() -> str:
    """去掉首尾空白之后的那一把钥匙。

    `.env` 里手抖多打一个空格或行尾带了个制表符，肉眼看不出来，而不去空白的症状是
    "口令明明填对了却每次 401"——这条链上最难查的一类静默失败（浏览器那头的输入框不会替你 strip）。
    长随机串本身不含空格，所以这样规范化不会让任何一把真钥匙变成另一把。
    """
    return (settings.ADMIN_TOKEN or "").strip()


def _token_fingerprint(secret: str) -> str:
    """把 ADMIN_TOKEN 压成短指纹塞进 session 里，用来实现"换了钥匙，旧 session 当场失效"。"""
    if not secret:
        return ""
    return hashlib.sha256(("admin-session:" + secret).encode()).hexdigest()[:16]


def create_session_token() -> str:
    """登录成功后发的那把短命凭证。调用方负责先比对过 ADMIN_TOKEN，这里只管签。"""
    if not enabled():
        raise HTTPException(status_code=503, detail="后台未开放：服务器还没配置管理口令")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "admin",
        "scope": ADMIN_SCOPE,
        "atk": _token_fingerprint(_configured()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.ADMIN_SESSION_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def check_login(candidate: str) -> bool:
    """比对管理口令。**用 compare_digest 而不是 `==`**：这一句的结果只有"对/不对"两种，
    但比较本身耗时随前缀匹配长度变化——这是这条链上唯一一个离线可反复试的判据，
    不值得留那条侧信道。限流（`routes/admin_ops.py` 那个 5/minute）是外面那道。

    两边都先 encode：`compare_digest` 吃 str 时遇到非 ASCII 直接 `TypeError`（实测），
    而"打口令的人正用中文输入法、或者粘过来的是全角引号"是站长自己会走的那条路——
    不加这一句，症状是登录框报 500，而不是"口令不对"。
    """
    if not enabled():
        return False
    return hmac.compare_digest(
        (candidate or "").strip().encode("utf-8"),
        _configured().encode("utf-8"),
    )


def get_admin(authorization: str | None = Header(None)) -> str:
    """FastAPI 依赖：不是管理凭证就 401，没配口令就 503。返回值目前没人用，留着是为了
    调用方能拿到"这是谁"的那一天不用再改签名（多管理员在负面清单第 4 条，今天不建）。"""
    if not enabled():
        raise HTTPException(status_code=503, detail="后台未开放：服务器还没配置管理口令")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录后台")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "jti"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="后台登录已过期，请重新输入管理口令")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="后台凭证无效，请重新输入管理口令")
    if payload.get("scope") != ADMIN_SCOPE:
        # 到这一步的通常是三类：小程序登录 token、私密解锁 token、`/v1` 那把 account 钥匙。
        # 都不该开这一路——记一行日志，泄露的凭证长什么样能从日志里对出来。
        logger.warning("非管理凭证打后台 scope=%r", payload.get("scope"))
        raise HTTPException(status_code=401, detail="这把钥匙开不了后台")
    if payload.get("atk") != _token_fingerprint(_configured()):
        raise HTTPException(status_code=401, detail="管理口令已更换，请重新登录")
    return "admin"
