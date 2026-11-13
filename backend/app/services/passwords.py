"""口令登录的全部算式：归一化、scrypt、恢复码、失败闸。这一张表的唯一写口。

**为什么是口令而不是验证码**（站长 11-12「去搞登录吧，免费的技术方案」）：现网 `.env` 里
`SMS_*` 与 `EMAIL_*` 两组凭据一行都没有，短信要钱、邮件要发信域名与送达率，两条都不是
"免费"能立刻落地的。口令登录零外部依赖、零新增 pip 包（scrypt 在标准库里），今天就能通。

**这一路的诚实边界，必须写在界面上**：登录名（手机号或邮箱）**不验证归属**——我们没有发信
通道，验不了。所以它只是一个"名字"，不是"这个邮箱属于你"的证明；谁先注册谁占用。
`account_identities.verified_at` 因此留 **NULL**（那一列本来就是为"绑上了但没验证"设的），
不跟着微信/Apple 那两支写 now。

恢复码是这一路唯一的找回入口：没有邮件就没有"发一封重置链接"。所以注册/改密/找回那三趟
各下发一枚 80 位随机串，**只出现那一次**，用户自己抄走。丢了恢复码又忘了密码 = 这个账号
找不回来，这句话要在设密码那一屏原样说给用户听，不许藏。
"""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.account import Account, AccountIdentity
from app.models.account_password import AccountPassword
from app.services.email import EMAIL_RE
from app.services.sms import PHONE_RE

PROVIDER = "password"
UID_PREFIX = "pwd:"

# scrypt 参数：n=2^14 / r=8 / p=1 是 OWASP 口令存储 cheatsheet 给的最低档，
# 单次约几十毫秒、吃 16 MiB 内存。不往上抬是因为现网那台机只有 3.6 GiB 且 :8080 已占 1.3 GiB，
# n=2^15 会把并发登录的内存翻倍；这一档已经让离线爆破比 sha256 贵四个数量级。
SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1
_SALT_BYTES = 16
_DK_LEN = 32

PASSWORD_MIN = 8
PASSWORD_MAX = 64

# 恢复码字母表：32 个字符，剔掉 I/O/0/1 这四个手抄最容易认错的。16 位 = 80 bit。
_RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_RECOVERY_CHARS = 16

MAX_FAILED = 10
LOCK_MINUTES = 15


def normalize_login(raw: str) -> str | None:
    """手机号或邮箱，自动认；认不出回 None。邮箱转小写（`a@B.com` = `a@b.com`），
    与 `/v1/auth/email-login` 同一口径。两样都不认时**不猜**——不接受任意用户名，
    因为"名字"一旦可以是任意串，就没法在将来接上真实发信通道时对上同一个人。
    """
    value = (raw or "").strip().lower()
    if PHONE_RE.match(value) or EMAIL_RE.match(value):
        return value
    return None


def password_ok(raw: str) -> bool:
    """长度闸 8–64。**不做复杂度规则**（必须大小写数字符号那种）：NIST SP 800-63B 明写
    组合规则只会让人写 `Passw0rd!`，长度才是真正挡爆破的那一格。
    上限 64 是为了不让 scrypt 变成按请求计费的碾压机（同 `RedeemRequest` 钉 6 位那条理由）。
    """
    return isinstance(raw, str) and PASSWORD_MIN <= len(raw) <= PASSWORD_MAX


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=_DK_LEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """格式不对一律 False，不抛：库里那一列将来可能被别的写法填过，
    而"读不懂"与"密码不对"对调用方是同一个答案（都不让进）。
    """
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex),
            n=int(n), r=int(r), p=int(p), dklen=len(bytes.fromhex(hash_hex)),
        )
    except (AttributeError, ValueError, TypeError):
        return False
    return hmac.compare_digest(dk.hex(), hash_hex)


# 登录名不存在时也走一次同等成本的 scrypt。少了这一句，"这个号注册过没有"能靠响应快慢量出来
# （存在 → 几十毫秒，不存在 → 立刻回），而 `/register` 那句 409 已经把同一件事说出去了，
# 这里不补就是白留一条更隐蔽的判分机。这一枚哈希在模块加载时算一次，之后每发只花验的那一次。
_DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")


def dummy_verify(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def new_recovery_code() -> str:
    """带横杠的原文（`ABCD-EFGH-JKLM-NPQR`），给人抄的。库里存的是去掉横杠那一串的 HMAC。"""
    chars = [secrets.choice(_RECOVERY_ALPHABET) for _ in range(_RECOVERY_CHARS)]
    return "-".join("".join(chars[i:i + 4]) for i in range(0, _RECOVERY_CHARS, 4))


def normalize_recovery(raw: str) -> str:
    """用户可能抄成小写、带空格、不带横杠。统一成大写无分隔再比。"""
    return re.sub(r"[^A-Z0-9]", "", (raw or "").strip().upper())


def recovery_hash(code: str) -> str:
    return hmac.new(
        settings.JWT_SECRET_KEY.encode(), normalize_recovery(code).encode(), hashlib.sha256
    ).hexdigest()


def recovery_matches(raw: str, stored_hash: str) -> bool:
    normalized = normalize_recovery(raw)
    if len(normalized) != _RECOVERY_CHARS:
        return False
    return hmac.compare_digest(recovery_hash(normalized), stored_hash)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def uid_of(login: str) -> str:
    return f"{UID_PREFIX}{login}"


def find_account_by_login(db: Session, login: str) -> Account | None:
    identity = db.query(AccountIdentity).filter(
        AccountIdentity.provider == PROVIDER,
        AccountIdentity.provider_uid == uid_of(login),
    ).first()
    if identity is None:
        return None
    return db.query(Account).filter(Account.id == identity.account_id).first()


def login_of(db: Session, account_id: str) -> str | None:
    """这个账号的口令登录名；没设过口令就是 None。H5「账号」那一行读它，
    不读 localStorage——本机存的那份在"另一台设备上升了级"之后就是陈的。
    """
    identity = db.query(AccountIdentity).filter(
        AccountIdentity.account_id == account_id,
        AccountIdentity.provider == PROVIDER,
    ).first()
    if identity is None or not identity.provider_uid.startswith(UID_PREFIX):
        return None
    return identity.provider_uid[len(UID_PREFIX):]


def row_for(db: Session, account_id: str) -> AccountPassword | None:
    return db.query(AccountPassword).filter(AccountPassword.account_id == account_id).first()


def create(db: Session, account: Account, password: str) -> str:
    """给这条 account 落第一行口令，返回恢复码原文。**不 commit**：调用方那次写
    （建号 / 挂身份）必须与这一行在同一个事务里落地，口径同 `services/generation`。
    """
    code = new_recovery_code()
    db.add(AccountPassword(
        account_id=account.id,
        password_hash=hash_password(password),
        recovery_hash=recovery_hash(code),
    ))
    return code


def set_password(db: Session, row: AccountPassword, password: str) -> str:
    """改口令并**换一枚新恢复码**（旧的那枚当场作废：找回之后旧码还能再用一次的话，
    捡到旧码的人就能把刚改好的密码再改回去）。返回新恢复码原文。**不 commit**，
    理由同 `create`，而且这一支后面紧跟着 `bump_generation`——两者必须同一个事务。
    """
    code = new_recovery_code()
    row.password_hash = hash_password(password)
    row.recovery_hash = recovery_hash(code)
    row.failed_count = 0
    row.locked_until = None
    return code


def locked(row: AccountPassword) -> bool:
    if row.locked_until is None:
        return False
    return datetime.now(timezone.utc) < _as_utc(row.locked_until)


def note_failure(db: Session, row: AccountPassword) -> None:
    """连错一次记一笔；到 MAX_FAILED 就锁 LOCK_MINUTES 并把计数清零
    （不清零的话锁到期后第一发错的就又立刻锁上，等于永久锁）。
    这一支**自己 commit**：它是一次独立的计数写，后面紧跟的是抛错回滚，
    不提交的话这一笔会被那次回滚抹掉，闸就永远是 0。
    """
    row.failed_count = (row.failed_count or 0) + 1
    if row.failed_count >= MAX_FAILED:
        row.failed_count = 0
        row.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)
    db.commit()


def note_success(db: Session, row: AccountPassword) -> None:
    if row.failed_count or row.locked_until is not None:
        row.failed_count = 0
        row.locked_until = None
        db.commit()