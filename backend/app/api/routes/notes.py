from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
from pydantic import BaseModel, Field, model_validator
from datetime import datetime, timezone
from sqlalchemy import or_
from app.db.database import get_db
from app.models.note import Note
from app.models.user import User
from app.core.auth import get_current_user
from app.core.quota_gate import require_note_room
from app.core.timefmt import UTCDatetime, UTCDatetimeOrNone
from app.core.errors import UserError
from app.services.wechat import enforce_text_safety
from app.services.sharing import (
    SNAPSHOT_COLUMNS,
    active_shares,
    public_fields,
    sync_snapshot,
)
from app.services import quota

router = APIRouter()

# 模型上写的 String(500) 在 SQLite 上只是装饰：实测 500 万字的标题、2 千万字的正文
# 都照样 200 存进去，三次请求就把库撑到 74MB。而 title 会进列表响应，一条超长标题
# 足以让每个人的首页拉不动。长度只能在入口这一层卡。
# MAX_BODY / MAX_SUMMARY 特意和内容安全的送检窗口（wechat.SEC_CHUNK * SEC_MAX_CHUNKS
# = 16,000 字/字段）对齐：再长的话，超出那部分永远检不到，用户只要把违规内容垫在
# 一万六千字之后就绕过了公开分享那道闸。抓取来的正文由 worker 直接落库、不走这里，
# 所以这个上限只约束手打的量——一万六千字已经远超任何真人笔记。
MAX_TITLE = 500
MAX_SUMMARY = 16_000
MAX_BODY = 16_000
MAX_URL = 1000
MAX_LIST_ITEMS = 50
MAX_ITEM_LEN = 200

Title = Annotated[str, Field(max_length=MAX_TITLE)]
Summary = Annotated[str, Field(max_length=MAX_SUMMARY)]
Body = Annotated[str, Field(max_length=MAX_BODY)]
Url = Annotated[str, Field(max_length=MAX_URL)]
Item = Annotated[str, Field(max_length=MAX_ITEM_LEN)]
Items = Annotated[list[Item], Field(max_length=MAX_LIST_ITEMS)]


# 手动笔记里"用户自己写的、落库前要过内容安全"的那几列。创建和编辑两条路共用这一份：
# 少列一个字段，就等于"改那个字段时不复检"。key_links 原本就是这么漏掉的——它客户端
# 可写，又会出现在公开分享页上，却一次都没进过 msgSecCheck。
MANUAL_TEXT_FIELDS = ("title", "summary", "key_points", "tags", "key_links", "content")


def _guard_manual_text(user: User, note) -> None:
    """用户自己写的内容在落库前过一遍微信内容安全；命中违规回 400 + 中文。

    只卡 manual：链接抓取和截图识别带进来的是外部原文，一篇旧文章里出现一个
    敏感词就让整条笔记存不下来，是误伤。真正需要过滤的是"公开可见"那一刻，
    所以那条放在创建分享里（shares.create_share 会校验整条笔记）。
    """
    if getattr(note, "source_type", None) != "manual":
        return
    try:
        enforce_text_safety(
            user.openid,
            *(getattr(note, f, None) for f in MANUAL_TEXT_FIELDS),
        )
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


class NoteBrief(BaseModel):
    id: int
    title: str
    summary: str | None
    tags: list | None
    source_type: str
    source_url: str | None
    category_id: int | None
    is_pinned: bool
    created_at: UTCDatetime

    class Config:
        from_attributes = True


class NoteDetail(NoteBrief):
    key_points: list | None
    key_links: list | None
    content: str | None
    original_content: str | None
    updated_at: UTCDatetimeOrNone
    # 转存进来的那一条才有的来源信息。只出不进：NoteCreate / NoteUpdate 里都没有它，
    # 所以编辑接口碰不到这一栏，转存之后来源改不掉。
    imported_from: dict | None = None


class NoteCreate(BaseModel):
    title: Title
    summary: Optional[Summary] = None
    key_points: Optional[Items] = None
    key_links: Optional[Items] = None
    tags: Optional[Items] = None
    content: Optional[Body] = None
    original_content: Optional[Body] = None
    # source_type 故意不在这个模型里：它是"要不要过内容安全"的开关（见 _guard_manual_text），
    # 交给客户端填等于让客户端自己决定是否被审查。抓取/截图来的笔记由 worker 直接落库，
    # 不走这个入口，所以 HTTP 建的一律是 manual。客户端多传的这个字段会被 Pydantic 忽略。
    source_url: Optional[Url] = None
    category_id: int | None = None


class NoteUpdate(BaseModel):
    title: Optional[Title] = None
    summary: Optional[Summary] = None
    key_points: Optional[Items] = None
    key_links: Optional[Items] = None
    tags: Optional[Items] = None
    content: Optional[Body] = None
    original_content: Optional[Body] = None
    source_url: Optional[Url] = None
    category_id: int | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_title(cls, values):
        if isinstance(values, dict) and "title" in values and values["title"] is None:
            values.pop("title")  # Remove null title so it won't be updated
        return values


@router.get("/", response_model=List[NoteBrief])
def list_notes(
    skip: int = 0,
    limit: int = Query(20, ge=1, le=100),
    category_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Note).filter(Note.user_id == str(user.id))
    if category_id is not None:
        q = q.filter(Note.category_id == category_id)
    if search:
        escaped = search.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        q = q.filter(
            or_(
                Note.title.ilike(pattern, escape="\\"),
                Note.summary.ilike(pattern, escape="\\"),
                Note.content.ilike(pattern, escape="\\"),
                Note.original_content.ilike(pattern, escape="\\"),
            )
        )
    notes = (
        q.order_by(Note.is_pinned.desc(), Note.pinned_at.desc().nullslast(), Note.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return notes


@router.get("/{note_id}", response_model=NoteDetail)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")
    return note


@router.post("/", response_model=NoteDetail)
def create_note(
    note: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_note_room),
):
    from app.models.category import Category
    
    # Validate category ownership if provided
    if note.category_id is not None:
        category = (
            db.query(Category)
            .filter(Category.id == note.category_id, Category.user_id == str(user.id))
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="分类不存在或无权使用")

    db_note = Note(**note.model_dump(), user_id=str(user.id), source_type="manual")

    # 检的是 db_note 而不是入参 note：_guard_manual_text 靠 source_type 决定要不要检，
    # 而 source_type 刚在上面由服务端钉死，入参里已经没有这个字段了。
    _guard_manual_text(user, db_note)

    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    quota.credit_first_note(db_note, db, user)
    return db_note


@router.put("/{note_id}", response_model=NoteDetail)
def update_note(
    note_id: int,
    note: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.category import Category
    
    db_note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")
    
    update_data = note.model_dump(exclude_unset=True)
    
    # Validate category ownership if provided
    if "category_id" in update_data and update_data["category_id"] is not None:
        category = (
            db.query(Category)
            .filter(Category.id == update_data["category_id"], Category.user_id == str(user.id))
            .first()
        )
        if not category:
            raise HTTPException(status_code=400, detail="分类不存在或无权使用")

    for key, value in update_data.items():
        setattr(db_note, key, value)

    # 复检必须在赋值之后：要检的是"这次改完之后的样子"，不是改之前的旧正文。
    # 被拦下时显式 rollback，否则脏对象还挂在会话上。
    if set(update_data) & set(MANUAL_TEXT_FIELDS):
        try:
            _guard_manual_text(user, db_note)
        except HTTPException:
            db.rollback()
            raise

    # 改一条已经分享出去的笔记，改的就是公开页上的内容。同步和重检必须绑在一起：
    # 只同步不重检，抓取来源的笔记（上面那道 _guard_manual_text 对它直接放行）就能
    # 靠"改一下标题"把没过公开审查的文本推上去；只重检不同步，就是这次修的那个洞——
    # 用户把手机号从标题里删掉了，那张卡片扫开还是手机号。
    # 判据取 SNAPSHOT_COLUMNS：公开页只给那几列，改正文不影响它。
    if set(update_data) & set(SNAPSHOT_COLUMNS):
        if active_shares(db, db_note.id):
            try:
                enforce_text_safety(user.openid, *public_fields(db_note))
            except UserError as e:
                db.rollback()
                raise HTTPException(status_code=400, detail=str(e))
            sync_snapshot(db, db_note)

    db.commit()
    db.refresh(db_note)
    return db_note


@router.post("/{note_id}/pin", response_model=NoteBrief)
def pin_note(
    note_id: int,
    pin: bool = Query(True),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db_note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not db_note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")
    from datetime import datetime, timezone
    db_note.is_pinned = pin
    db_note.pinned_at = datetime.now(timezone.utc) if pin else None
    db.commit()
    db.refresh(db_note)
    return db_note


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.share import Share
    from app.models.job import Job
    
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")
    
    # Delete related shares and jobs first to avoid foreign key constraint errors
    db.query(Share).filter(Share.note_id == note_id).delete()
    db.query(Job).filter(Job.note_id == note_id).delete()
    
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}


class NoteFromShare(BaseModel):
    token: str


@router.post("/from-share", response_model=NoteDetail)
def import_from_share(
    req: NoteFromShare,
    db: Session = Depends(get_db),
    user: User = Depends(require_note_room),
):
    """把别人分享页上的这一条整份抄进自己的库。

    抄的是 `shares` 上那份**公开快照**，不是原笔记：正文、识别出的原文、分类、
    置顶都不在公开范围内，也不该跟着过来。来源钉在 `imported_from` 上，
    而它不在 NoteCreate / NoteUpdate 里，所以这一栏转存之后编辑不掉、只能整条删。

    这里不再送一次 msgSecCheck：这份内容在建分享时已经按公开口径检过一遍，
    而这一趟没有任何用户可写的自由文本进库（每个字段都是服务端从既有快照搬的）。
    再检一遍等于把别人写的内容算到转存者头上，顺带烧掉我们一天 100 次的额度。
    """
    from app.services.sharing import active_share_by_token

    share = active_share_by_token(db, req.token)
    if share is None:
        raise HTTPException(status_code=404, detail="这条分享不存在、已关闭或已删除")

    note = Note(
        user_id=str(user.id),
        title=share.title or "（未命名笔记）",
        summary=share.summary,
        tags=share.tags,
        key_points=share.key_points,
        key_links=share.key_links,
        source_type="share_import",
        source_url=share.source_url,
        imported_from={
            "share_token": share.token,
            "source_note_id": share.note_id,
            "author_user_id": share.user_id,
            "author_name": share.author_name,
            "title_at_import": share.title,
            "imported_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    # 转存也算"这个人真的开始用起来了"：他名下第一条如果是从别人那篇抄来的，
    # 那份 +10 就记在原笔记作者头上（同一篇只挣一次，判定在 quota 里）。
    # 和动笔那条一样，结不到账不能让转存本身失败。
    quota.credit_import(db, user, share.note_id)
    return note
