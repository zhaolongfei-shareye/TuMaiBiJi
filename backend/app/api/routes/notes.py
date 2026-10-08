from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
from pydantic import BaseModel, Field, model_validator
from datetime import datetime, timezone
import logging
from sqlalchemy import and_, or_
from app.db.database import get_db
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.core.auth import get_current_user
from app.core.private_access import (
    LOCKED_DROP_DETAIL,
    LOCKED_DROP_LIST,
    NOTE_BRIEF_FIELDS,
    NOTE_DETAIL_FIELDS,
    is_private_note,
    locked_view,
    private_category_ids,
    unlocked,
)
from app.core.timefmt import UTCDatetime, UTCDatetimeOrNone
from app.core.errors import UserError
from app.services.wechat import enforce_text_safety
from app.services.sharing import (
    SNAPSHOT_COLUMNS,
    active_shares,
    close_shares,
    public_fields,
    sync_snapshot,
)
from app.services import quota

router = APIRouter()
logger = logging.getLogger(__name__)

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
    imported_from: dict | None = None
    is_private: bool = False


class NoteListItem(NoteBrief):
    """列表那一行比详情多出来的两样：这一篇此刻有没有开着的分享码、以及该显示谁的昵称。

    只挂 GET /api/notes 这一条路由。详情页另走 getShareStatus，如果两处都发一份
    同样的事实，早晚会出现"列表说已分享、详情说没有"这种对不上的样子——所以
    NoteDetail 故意不继承这个类。
    """

    has_active_share: bool = False
    share_author_name: str | None = None


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


def _attach_share_marks(db: Session, notes: list) -> None:
    """给这一页的每条笔记挂上「此刻有没有开着的码」和「那一格该显示谁的昵称」。

    一次 IN 查完，不逐篇查：一页 20 篇各自查一次，首页拉一次就是 20 个来回。
    shares 上有"一篇只留一张开着的码"那个部分唯一索引（models/share.py），所以一个
    note_id 至多命中一行，做成字典不会互相覆盖。
    昵称那一格说的是"这篇打哪儿来"，所以两头都有来源，而**转存那份优先**：
    从别人那儿转存来、之后自己又分享出去的那一篇，两张名字同时可得，取的是原分享者那份
    （码上快照的 author_name 是他自己，画在自己纸片上不说明任何事）。
    两头都没有就留空——界面上那一格不画名字，不拿"图麦"这类假名去填。
    """
    ids = [n.id for n in notes]
    shared: dict = {}
    if ids:
        shared = {
            row[0]: row[1]
            for row in db.query(Share.note_id, Share.author_name)
            .filter(Share.note_id.in_(ids), Share.is_active == True)  # noqa: E712
            .all()
        }
    for n in notes:
        n.has_active_share = n.id in shared
        imported = n.imported_from if isinstance(n.imported_from, dict) else {}
        n.share_author_name = imported.get("author_name") or shared.get(n.id)


@router.get("/", response_model=List[NoteListItem])
def list_notes(
    request: Request,
    skip: int = 0,
    limit: int = Query(20, ge=1, le=100),
    category_id: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    private_ids = private_category_ids(db, user.id)
    # 这一条路由上"解没解锁"只判一次，下面裁字段和搜索条件共用同一个答案。
    # 分开判会漏：搜索那支要是自己按"未解锁"判，裁字段却按另一个答案走，
    # 就等于留了一条"用搜索探正文"的旁路。
    locked = bool(private_ids) and not unlocked(request, user)
    q = db.query(Note).filter(Note.user_id == str(user.id))
    if category_id is not None:
        q = q.filter(Note.category_id == category_id)
    if search:
        escaped = search.replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        title_like = Note.title.ilike(pattern, escape="\\")
        body_like = or_(
            Note.summary.ilike(pattern, escape="\\"),
            Note.content.ilike(pattern, escape="\\"),
            Note.original_content.ilike(pattern, escape="\\"),
        )
        if locked:
            # 锁着的时候私密笔记只有标题参与搜索——"这篇里有没有某个词"这个问题，
            # 原来的搜索会老老实实用命中与否来回答，那本身就是正文的旁漏。
            # 未分类的 category_id 是 NULL，而 `NULL NOT IN (...)` 判的是 NULL 不是真，
            # 所以要把 NULL 显式并进来，否则普通笔记会从搜索结果里凭空消失。
            q = q.filter(
                or_(
                    title_like,
                    and_(
                        body_like,
                        or_(Note.category_id.is_(None), Note.category_id.notin_(private_ids)),
                    ),
                )
            )
        else:
            q = q.filter(or_(title_like, body_like))
    # 站长 10-04 真机报：「排序没有按照日期倒序，要改」。根因就是原来这里前两档
    # （`is_pinned DESC, pinned_at DESC`）——置顶这个能力在客户端 10-03 已经整条撤净
    # （列表、详情窗、独立详情页三处入口都没了），而他库里那两篇还是钉着的
    # （实测 notes.id=7、id=8 `is_pinned=1`），于是 09/23 那篇压在 10/04 那篇上面。
    # 只清数据不改这条，以后任何一篇被别的路径钉上就又会跳顶，所以撤的是规则本身。
    # `pin_note` 那个接口与 is_pinned/pinned_at 两列暂时留着（动路由和删列要另一次部署，另拍）。
    notes = (
        q.order_by(Note.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    # 挂在这一步而不是最后一步：下面 locked 那支只裁私密那几行，普通笔记仍是原对象，
    # 两支出门都得带着这两样。
    _attach_share_marks(db, notes)
    if not locked:
        return notes
    # 概要跟着正文一起裁：界面上它只在验过密码、展开那一行时才画，所以裁掉不影响
    # 正常流程；不裁才是原来的样子——列表响应里直接躺着私密笔记的概要。
    out = []
    for n in notes:
        if not is_private_note(n, private_ids):
            out.append(n)
            continue
        row = {f: getattr(n, f) for f in NOTE_BRIEF_FIELDS}
        for f in LOCKED_DROP_LIST:
            row[f] = None
        out.append(row)
    return out


@router.get("/{note_id}", response_model=NoteDetail)
def get_note(
    request: Request,
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
    note.is_private = is_private_note(note, private_category_ids(db, user.id))
    if note.is_private and not unlocked(request, user):
        # 回 200 + 裁过的正文，而不是 403：详情页要先拿到这条笔记的形状才知道
        # "这是一篇私密的、该弹密码框"。is_private 仍然如实带着，客户端拿它决定弹哪一层。
        return locked_view(note, NOTE_DETAIL_FIELDS, LOCKED_DROP_DETAIL)
    return note


@router.post("/", response_model=NoteDetail)
def create_note(
    note: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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

    # 改成私密 = 用户说过这篇不给人看。已经发出去的码当场关掉：不关的话公开落地页会
    # 继续供正文，而界面上「撤掉分享」那一枚对私密笔记整个不渲染——他再没有别的入口
    # 能收回它。close_shares 不自己 commit，跟着下面那次一起提交。
    now_private = is_private_note(db_note, private_category_ids(db, user.id))
    if now_private:
        closed = close_shares(db, db_note.id)
        if closed:
            logger.info("笔记 %s 归入私密，顺手关掉 %s 条在跑的分享", db_note.id, closed)

    # 改一条已经分享出去的笔记，改的就是公开页上的内容。同步和重检必须绑在一起：
    # 只同步不重检，抓取来源的笔记（上面那道 _guard_manual_text 对它直接放行）就能
    # 靠"改一下标题"把没过公开审查的文本推上去；只重检不同步，就是这次修的那个洞——
    # 用户把手机号从标题里删掉了，那张卡片扫开还是手机号。
    # 判据取 SNAPSHOT_COLUMNS：公开页只给那几列，改正文不影响它。
    if set(update_data) & set(SNAPSHOT_COLUMNS):
        if not now_private and active_shares(db, db_note.id):
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


class NoteDeleteOut(BaseModel):
    """删一篇的回体。写成模型而不是裸 dict，是为了让它进 `scripts/api_contract.py` 那份快照：
    客户端要拿 `file_ids` 去清云上的对象，这一列要是哪天被人改名或删掉，光看代码看不出来，
    症状却是云上堆一堆没人认领的对象占全站配额。裸 dict 的回体不进快照，等于没人守。"""
    message: str
    file_ids: List[str] = []


@router.delete("/{note_id}", response_model=NoteDeleteOut)
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

    # 配图：行在这里删，**对象删不掉**——云开发存储只有客户端（`wx.cloud.deleteFile`）
    # 或云函数那两侧能删，这台自建后端没有那个凭据。所以把 fileID 一起回给调用方，
    # 谁删的笔记谁去把对象清掉。残留是已知缺口（离线时删的笔记、注销账号那条路径都清不到），
    # 记在 docs/方案-2.0大版本.md §3 阶段 3 的出口条件里，不当已解决。
    from app.models.asset import Asset

    file_ids = [
        r.object_key
        for r in db.query(Asset).filter(Asset.note_id == note_id).all()
    ]
    db.query(Asset).filter(Asset.note_id == note_id).delete()

    # 卡片对象并进**同一个** `file_ids`，不另起一个 `card_file_ids` 键：客户端
    # `cloudUpload.dropFromDeleteRes` 只读那一个键，加新键等于两端各改一遍、各漏一遍。
    # 历史行（is_current=0）一起带出去——那些对象在云上还在，留着不删就是白占全站那 5GB。
    from app.models.note_card import NoteCard

    file_ids += [
        r.object_key
        for r in db.query(NoteCard).filter(NoteCard.note_id == note_id).all()
    ]
    db.query(NoteCard).filter(NoteCard.note_id == note_id).delete()

    db.delete(note)
    db.commit()
    # 去重保序：配图与卡片两张表**可以指向同一个 fileID**（同一篇的历史行与当前行也会），
    # 而重复的 id 递到 wx.cloud.deleteFile 里第二次不算成功，客户端就会把它当成"没删成的那条"
    # 落进待删队列，从此每次回前台都替一个已经不存在的对象重打一遍删除。
    return {"message": "Note deleted", "file_ids": list(dict.fromkeys(file_ids))}


class NoteFromShare(BaseModel):
    token: str


@router.post("/from-share", response_model=NoteDetail)
def import_from_share(
    req: NoteFromShare,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
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
