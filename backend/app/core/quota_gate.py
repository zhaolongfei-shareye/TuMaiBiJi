"""额度闸门的 FastAPI 依赖：三个创建入口共用这一刀。

放在 core 而不是写在每个路由里，是为了让"手写 / 链接 / 截图"三条路走的是同一段判定，
少一条路漏检就是少一层防线。
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import UserError
from app.db.database import get_db
from app.models.user import User
from app.services import quota


def require_note_room(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """还能存就放行（并把 user 原样交出去），到顶就 403 + 中文。

    403 而不是 400：客户端要分得开"额度到顶"（下一句是去分享）和"内容有问题"。
    """
    try:
        quota.ensure_room(user, db)
    except UserError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return user
