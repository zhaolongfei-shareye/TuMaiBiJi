"""私密笔记在服务端的这道闸。

判据只有一条：笔记所属分类的名字等于「私密」。库里 notes 表没有 is_private 这一列，
详情响应里那个字段是读的时候现算的——所以"算不算私密"必须只有一个地方能回答，
不然列表、详情、分享三处各判一次，早晚会判出三种答案。

这一模块存在的原因：09-29 那批把私密密码做完了，但锁只装在客户端。实测
`GET /api/notes/{id}` 不要密码就把正文、要点、原文全给了，列表更是直接带着 summary；
`POST /api/shares` 也没看过分类，对一篇私密笔记照样能发码——扫开就是公开可读的正文。
"手机在别人手里时翻不开内容"这句承诺在服务端当时是不成立的。

解锁凭证走一条独立的短命 JWT（不是把密码塞进每个请求）：
- 密码只在 verify 那一次过线，之后请求头带 `X-Private-Token`；
- 凭证里绑了密码摘要那一列的指纹（`pk`），改密或重置之后旧凭证当场作废，
  不需要另存一份"哪些 token 还有效"的状态；
- 校验失败一律回"没解锁"而不是 401：拿一个过期的解锁凭证把人整台踢下线，
  症状会是"我的笔记突然全没了"，那比让他重新输一次密码糟得多。
"""
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.category import Category
from app.models.user import User

logger = logging.getLogger(__name__)

PRIVATE_CATEGORY_NAME = "私密"
UNLOCK_SCOPE = "private"
UNLOCK_HEADER = "X-Private-Token"

# 锁着的时候从响应里去掉的那几列。列表和详情分开列，是因为列表本来就只有 NoteBrief
# 那几列——把 summary 漏在列表里正是原来那个洞：界面上"要点开、验过密码才看得到内容"，
# 而概要其实一直随列表下发。两份清单都按"少列一个字段就等于那个字段照给"来对待。
LOCKED_DROP_LIST = ("summary",)
LOCKED_DROP_DETAIL = ("summary", "key_points", "key_links", "content", "original_content")

NOTE_BRIEF_FIELDS = (
    "id", "title", "summary", "tags", "source_type", "source_url",
    "category_id", "is_pinned", "created_at",
)
NOTE_DETAIL_FIELDS = NOTE_BRIEF_FIELDS + (
    "key_points", "key_links", "content", "original_content", "updated_at", "imported_from",
)


def private_category_ids(db: Session, user_id: int) -> set:
    """这个账号名下所有叫「私密」的分类 id。名字没有唯一约束，所以按集合处理。"""
    rows = (
        db.query(Category.id)
        .filter(Category.user_id == str(user_id), Category.name == PRIVATE_CATEGORY_NAME)
        .all()
    )
    return {r[0] for r in rows}


def is_private_note(note, private_ids: set) -> bool:
    return note.category_id is not None and note.category_id in private_ids


def _pin_fingerprint(stored_hash: str | None) -> str:
    """把库里那列摘要压成短指纹放进凭证里。

    加了一个前缀再散：凭证里那个值不该和库里的摘要长得一样——两者相同的话，
    谁在日志里看到凭证就等于拿到了一条可以直接拿去撞库的密码摘要。
    """
    if not stored_hash:
        return ""
    return hashlib.sha256(("private-unlock:" + stored_hash).encode()).hexdigest()[:16]


def create_unlock_token(user: User) -> str:
    """验过密码之后发的那条短命凭证。调用方负责先确认密码对，这里只管签。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "gen": user.generation,
        "scope": UNLOCK_SCOPE,
        "pk": _pin_fingerprint(user.private_password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=settings.PRIVATE_UNLOCK_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def unlocked(request, user: User) -> bool:
    """这条请求解没解锁。任何一步不对都只回 False，不抛错（理由见模块头）。"""
    token = request.headers.get(UNLOCK_HEADER) if request is not None else None
    if not token:
        return False
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "jti"]},
        )
    except jwt.InvalidTokenError:
        return False
    if payload.get("scope") != UNLOCK_SCOPE:
        return False
    if payload.get("sub") != str(user.id):
        return False
    if payload.get("gen") != user.generation:
        return False
    # 没设过密码的账号不可能有有效凭证：重置之后旧凭证必须当场失效，
    # 而不是等到自然过期还能读私密内容。
    if not user.private_password_hash:
        return False
    return payload.get("pk") == _pin_fingerprint(user.private_password_hash)


def locked_view(note, fields, drop) -> dict:
    """按字段清单拼一份"锁着"的响应体：该裁的裁掉，其余原样，并标上 is_private。"""
    data = {name: getattr(note, name, None) for name in fields}
    for name in drop:
        data[name] = None
    data["is_private"] = True
    return data
