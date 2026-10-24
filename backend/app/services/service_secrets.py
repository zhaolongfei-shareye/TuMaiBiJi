"""密钥配置这一条链唯一碰库的地方：规范化、存、删、读侧那一句覆盖。

为什么写在服务而不是路由里：读的那一侧不在后台那几个口上——登录（`core/auth.py`）、
微信 token（`services/wechat.py`）、提炼凭据（`services/llm.py`）都要问"这个名字库里有没有值"。
那份判据一旦有两处实现，症状不是报错而是"后台明明换了，登录还是用 .env 那把旧钥匙"，
而这种不一致没有任何一层会替你发现（与 `services/mp_assets.py` 文件头同一条理由）。

三条纪律，缺一条这一页就不能上现网：

1. **值只进不出。** `describe()` 交出去的是长度与指纹，不是 `value`。接口回体、页面 HTML、
   日志三处都不许出现原值——`updated_at` 与指纹够操作者确认"刚那一趟真的存进去了、
   存的是不是同一把"，判据不缺，值不外流。
2. **库里那一行只是覆盖层，不是唯一真相。** `resolve()` 查不到行就回调用方传进来的
   `.env` 值；删一行 = 当场回到 `.env`。所以"撤回一次改动"不需要知道旧值是什么，
   这一条是它敢上现网的前提。
3. **读侧不许抛。** 这一句写在 `resolve()` 里：表还没建出来（迁移还没跑）、库被锁、
   任何异常都只记一行日志然后退回 `.env`。凭据读取挂在登录那条链上，
   它失败的样子必须是"和没这一页时一样"，不能是"登录 500"。

不做缓存，故意的：缓存一份就等于"换了钥匙要重启才生效"，而"不发版、不重启换一把凭据"
就是这一页存在的唯一理由。代价是一次按主键的 SELECT，摊在 token 缓存（两小时一次）与
登录那一趟上，比它省掉的那次 ssh + 编辑 + 重启便宜得多。
"""
import hashlib
import logging
import os
import re

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import UserError
from app.core.timefmt import _as_utc_iso
from app.db.database import SessionLocal
from app.models.service_secret import ServiceSecret

logger = logging.getLogger(__name__)

NAME_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]{1,63}$")
# 上限只是防"把整个文件粘进来"和防粘半截，不是安全判据。4096 字容得下任何一把真实凭据
# （微信 AppSecret 32 字、云函数 key 几十字），超过就说明粘贴时带上了别的东西。
MAX_VALUE_CHARS = 4096
MAX_NOTE_CHARS = 200

# 今天真被代码读的那几个名字：只有在这里点名的，`resolve()` 才真有调用方。
# 后台那一页用它决定要不要多说一句"这一条存进去了，但还没有代码在读"。
# ⚠ 加一条读法 = 在这里加一个名字，同时 `tests/test_service_secrets.py` 里那条
# 「名单里每一个名字都要真改得出消费者的行为」会跟着加一条——少了那一条，这张名单会说假话。
CONSUMED_NAMES = ("WECHAT_APP_SECRET", "HUNYUAN_CF_KEY")


def canonical_name(raw: str) -> str:
    """规范化 + 校验那一个名字。写侧唯一的入口，读侧不复用它（见 `resolve` 那句）。

    形状话只有这一句：`1abc`、`带空格`、`deepseek-api-key` 这三种都会在这一句里被同一条
    判据拒掉，判据改了不会有一处忘改。上限 64 与 `models/service_secret.py` 那一个
    `String(64)` 是同一个数，写在这里也就不用他猜"到底多长算长"。
    """
    name = (raw or "").strip().upper()
    if not NAME_PATTERN.match(name):
        raise UserError("名字要用大写英文：字母开头、只含字母数字下划线、最长 64 字，例 DEEPSEEK_API_KEY")
    return name


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]


def _note(raw: str | None) -> str | None:
    return (raw or "").strip()[:MAX_NOTE_CHARS] or None


def _env_present(name: str) -> bool:
    """`.env` 那一头这一名有没有值。只回布尔，值本身一次都不出去。

    为什么问两边：`os.getenv` 是进程真实看到的（uvicorn 带 `--env-file` 或 systemd 注入的），
    `getattr(settings, name)` 是 pydantic 装载完 `.env` 与默认值之后的。只看一边会说出假话——
    只看前者，页面会对着一个 `.env` 里明明有值的名字说"库里没有可回去的值"。
    """
    raw = os.getenv(name)
    if raw is not None and raw.strip():
        return True
    value = getattr(settings, name, None)
    return isinstance(value, str) and bool(value.strip())


def describe(row: ServiceSecret) -> dict:
    """给后台那一页的一份账。**这一句里没有 `value`**，接口回体因此不可能带出原值。"""
    return {
        "name": row.name,
        "length": len(row.value),
        "fingerprint": fingerprint(row.value),
        "note": row.note,
        "updated_at": _as_utc_iso(row.updated_at or row.created_at),
        "env_present": _env_present(row.name),
        "consumed": row.name in CONSUMED_NAMES,
    }


def list_items(db: Session) -> list[dict]:
    rows = db.query(ServiceSecret).order_by(ServiceSecret.name).all()
    return [describe(r) for r in rows]


def put(db: Session, name_raw: str, value: str, note: str | None = None) -> dict:
    """存一把：没有这行就建，有了就整把覆盖（不做"追加"也不做部分改）。"""
    name = canonical_name(name_raw)
    secret = (value or "").strip()
    if not secret:
        raise UserError("密钥值是空的，请整把粘贴进来")
    if len(secret) > MAX_VALUE_CHARS:
        raise UserError(f"密钥值有 {len(secret)} 字，超过上限 {MAX_VALUE_CHARS}，请确认粘贴的内容")
    row = db.get(ServiceSecret, name)
    created = row is None
    if created:
        row = ServiceSecret(name=name, value=secret, note=_note(note))
        db.add(row)
    else:
        row.value = secret
        # `note=None` 是"这一次没写备注，保留原来那句"；空串照同一句处理。
        # 页面每次都会把当前那句带回来，所以这里不需要第二套读法。
        if note is not None:
            row.note = _note(note)
    db.commit()
    db.refresh(row)
    # 只定位，不打值：journald 没有按人隔离，也不会随任何东西删掉（同 admin_login 那条）。
    logger.info("密钥%s name=%s 长度=%d 指纹=%s", "已存入" if created else "已覆盖",
                name, len(secret), fingerprint(secret))
    return describe(row)


def delete(db: Session, name_raw: str) -> bool:
    """删一行 = 那个名字立刻回到 `.env`。返回 False 表示库里本来就没有这一行。"""
    name = canonical_name(name_raw)
    row = db.get(ServiceSecret, name)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    logger.info("密钥已删除 name=%s（这个名字回到 .env 的值）", name)
    return True


def resolve(name: str, fallback: str = "") -> str:
    """库里那一行优先，查不到就回 `fallback`（调用方从 `settings` 里拿的那一份）。

    读侧不调 `canonical_name` 而是就地取大写：那一句会抛 `UserError`，而这一句站在登录、
    token、提炼三条链上，**任何输入都只能回一个值，不能回一个异常**。名字是代码里写死的
    字面量，真要有人传进来一个脏名字，结果也只是"查不到、退回 .env"。
    """
    key = (name or "").strip().upper()
    if not key:
        return fallback
    try:
        db = SessionLocal()
        try:
            row = db.get(ServiceSecret, key)
        finally:
            db.close()
    except Exception as exc:
        # 表还没建（迁移没跑）、库被锁、连接数打满——三种都只该有一个结果：照旧用 .env。
        logger.error("读密钥失败 name=%s %s（退回 .env 的值）", key, type(exc).__name__)
        return fallback
    if row is not None and row.value.strip():
        return row.value
    return fallback
