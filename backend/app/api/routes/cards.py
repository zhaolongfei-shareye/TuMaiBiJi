"""卡片留档：一张笔记当前那一张卡片的登记、读回、与删除连带（2.0.1 P0 · S1）。

这一组接口只做一件事——**把"这篇有没有卡片"从"这台手机上那个文件在不在"里救出来**。
成因与实测量：`docs/方案-卡片留档上服务端.md` §一、PRD §8.148。图片字节不经过这台服务器
（前端画完直接传云开发，拿到 fileID 再来这里登记一行），所以这里没有上传口，只有账——
与 `routes/assets.py` 那条同型。

四条口径先讲明白，它们都是"不写下来下一个人一定改错"的那种：

1. **一篇只留一张**：写口是幂等的 upsert——新的进来，旧的 `is_current` 置 0 留档不删。
   库上还压了一道部分唯一索引（`ux_note_cards_one_current_per_note`），两个请求同时写也只有一行当前。
   历史行留着不是为了"翻旧卡片"（界面没有这个入口），是为了撤回/回滚时那句"旧值必须一直读得懂"。
2. **`tpl` 不许在服务端卡白名单**。卡片模板走的是"不走发版"那条线（`docs/方案-卡片模板不走发版.md`），
   下发多一套 id，界面上就多一格；服务端要是抄一份名单，就得跟着每次新模板发一次后端，
   那条承诺当场作废。所以这里只校形状（长度、不许带空白），语义交给客户端那份闭集解释器。
3. **`origin` 是给用户看的那句话的数据来源**，四个取值各有各的话术（见 models/note_card.py）。
   写错一档等于悄悄把一张他没见过的图当成"你原来的那张"——这条是整张表里最容易伤到用户的一栏。
4. **fileID 是别人能读的地址**：入口校格式与长度，读口校归属，与 assets 那条一字不差同口径。
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.assets import _owned_note_or_404
from app.core.auth import get_current_user
from app.core.timefmt import UTCDatetime
from app.db.database import get_db
from app.models.note import Note
from app.models.note_card import CARD_ORIGINS, NoteCard, current
from app.models.share import Share
from app.models.user import User

router = APIRouter()  # 路径写全（跨 /api/notes 与 /api/user 两个前缀），同 assets.py 那条
logger = logging.getLogger(__name__)

# NoteCard.object_key 是 String(500)，但 SQLite 上那只是装饰——长度只能在入口卡（assets.py 同条）。
MAX_FILE_ID_LEN = 500
MAX_TPL_LEN = 50
# 写口的 size 拦的是"这不像一张卡片"，不是配额：上界取**云开发单文件上限 20MB**（与
# assets 那条同值同理由）。⚠ 故意**不拿 200KB 当拒收线**——一张卡片到底多少字节今天还没量到
# （站长 10-08 让探针停在三趟，"别为它停 S1"），拿一个没量过的数当闸门，症状会是真用户的
# 卡片存不上。200KB 是**配额入账口径**（models/note_card.py 的 CARD_ACCOUNT_BYTES），
# 量到实测再校，两件事不许混成一个数。
MAX_CARD_UPLOAD_BYTES = 20 * 1024 * 1024


class CardIn(BaseModel):
    file_id: str = Field(min_length=1, max_length=MAX_FILE_ID_LEN)
    tpl: str = Field(min_length=1, max_length=MAX_TPL_LEN)
    no_qr: bool = False
    size: Optional[int] = Field(default=None, ge=0, le=MAX_CARD_UPLOAD_BYTES)
    width: Optional[int] = Field(default=None, ge=0, le=20000)
    height: Optional[int] = Field(default=None, ge=0, le=20000)
    # 默认 live（用户当场生成的那一趟）。补传/重渲那几档由 S3 的修复趟显式带过来，
    # 不许它们靠默认值混成"用户刚生成的"——那会在界面上说出假话。
    origin: str = Field(default="live", min_length=1, max_length=24)


class CardOut(BaseModel):
    id: int
    note_id: int
    cloud_url: str
    tpl: str
    no_qr: bool
    size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    origin: str
    created_at: UTCDatetime = None

    class Config:
        from_attributes = True


class CardReadOut(BaseModel):
    """读一篇。`had_share` 是给"待确认档"用的：这篇公开过、但服务器没有它的卡片行。

    这一栏必须在**同一个口**里回：分两个请求就会出现"界面先画了空白格、再去问有没有公开过"
    那种中间态，而那正好是我们要消灭的症状长出来的地方。
    """
    card: Optional[CardOut] = None
    had_share: bool = False


class CardsListOut(BaseModel):
    cards: List[CardOut] = Field(default_factory=list)
    need_confirm: List[int] = Field(default_factory=list)


class CardDropOut(BaseModel):
    """撤掉那一格的回体。键名钉死是 `file_ids`——与 `delete_note`、`deactivate` 同一个键，
    客户端 `cloudUpload.dropFromDeleteRes` 只读这一个（多一个键就是那一份永远没人删）。"""
    file_ids: List[str] = Field(default_factory=list)


def _check_file_id(fid: str) -> str:
    s = (fid or "").strip()
    # 光看前缀不够：`cloud://` 自己也算"以 cloud:// 开头"，那是一条指向空的地址。
    rest = s[len("cloud://"):] if s.startswith("cloud://") else ""
    if not rest or any(c.isspace() for c in rest):
        raise HTTPException(status_code=400, detail="图片地址格式不对")
    return s


def _views(rows) -> List[dict]:
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "note_id": r.note_id,
            # 字段名与 AssetOut 那边保持一致（客户端读的是 cloud_url，别在这儿换成 object_key）
            "cloud_url": r.object_key,
            "tpl": r.tpl,
            "no_qr": bool(r.no_qr),
            "size": r.file_size,
            "width": r.width,
            "height": r.height,
            "origin": r.origin,
            "created_at": r.created_at,
        })
    return out


@router.post("/api/notes/{note_id}/card", response_model=CardOut)
def put_note_card(
    note_id: int,
    payload: CardIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """登记这篇笔记当前那张卡片。**幂等 upsert**：旧的转历史，新的成为当前。"""
    _owned_note_or_404(db, user, note_id)
    if payload.origin not in CARD_ORIGINS:
        raise HTTPException(status_code=400, detail="卡片来源不认得")
    if any(c.isspace() for c in payload.tpl.strip()) or not payload.tpl.strip():
        raise HTTPException(status_code=400, detail="模板名不对")
    fid = _check_file_id(payload.file_id)
    uid = str(user.id)

    # 先查是不是"同一张卡片再登记一次"（重传、补传重跑都算）：那就不该留一条历史，
    # 否则补传跑两遍就攒出两行同址的记录，读回来靠顺序决胜——那是不确定行为。
    same = (
        db.query(NoteCard)
        .filter(NoteCard.note_id == note_id, NoteCard.user_id == uid, current())
        .all()
    )
    if len(same) == 1 and same[0].object_key == fid:
        row = same[0]
        row.tpl = payload.tpl.strip()
        row.no_qr = payload.no_qr
        row.file_size = payload.size if payload.size is not None else row.file_size
        row.width = payload.width if payload.width is not None else row.width
        row.height = payload.height if payload.height is not None else row.height
        row.origin = payload.origin
        db.commit()
        db.refresh(row)
        return _views([row])[0]

    for old in same:
        old.is_current = False
    row = NoteCard(
        user_id=uid,
        note_id=note_id,
        object_key=fid,
        tpl=payload.tpl.strip(),
        no_qr=payload.no_qr,
        file_size=payload.size,
        width=payload.width,
        height=payload.height,
        origin=payload.origin,
        is_current=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _views([row])[0]


@router.get("/api/notes/{note_id}/card", response_model=CardReadOut)
def read_note_card(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _owned_note_or_404(db, user, note_id)
    # 多条当前行在今天不可能存在（索引挡着），但读的时候按最新的取，别用 .one()：
    # 一处 .one() 崩掉的症状是整篇详情页 500，而那正好是用户最不该看到的东西。
    row = (
        db.query(NoteCard)
        .filter(NoteCard.note_id == note_id, NoteCard.user_id == str(user.id), current())
        .order_by(NoteCard.id.desc())
        .first()
    )
    had_share = (
        db.query(Share.id)
        .filter(Share.note_id == note_id, Share.user_id == str(user.id))
        .first()
        is not None
    )
    return {"card": _views([row])[0] if row else None, "had_share": had_share}


@router.delete("/api/notes/{note_id}/card", response_model=CardDropOut)
def drop_note_card(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """撤掉这篇的卡片留档：行删掉，对象回给客户端删（后端没有云开发凭据）。

    为什么必须有这一个口：界面上「删除」那一枚（首页成品弹窗底排）说的本来就是"这篇不该再有
    卡片"。S2 把"有没有卡片"的权威从本机文件挪到服务器这一行之后，只删本机那个 jpg 不删这一行，
    症状就是**那一格删不掉**——本机账清了，下次进详情页又从云上读回来画上去。

    历史行（`is_current=0`）一起删：那些对象在这一趟一并从云上清掉，留一行指向已经不存在的
    地址就是 `assets` 那条说过的"幽灵行"——算进配额却什么都读不出来。
    """
    _owned_note_or_404(db, user, note_id)
    rows = (
        db.query(NoteCard)
        .filter(NoteCard.note_id == note_id, NoteCard.user_id == str(user.id))
        .all()
    )
    # 去重但保序：同一篇的历史行与当前行**可以指向同一个 fileID**（登记 A → 换 B → 又换回 A，
    # 库里就是 A 历史 / B 历史 / A 当前三行）。递 `fileList: [A, A]` 给 wx.cloud.deleteFile，
    # 第二次的 status 不是 0，`cloudUpload.deleteFiles` 就把 A 记成"没删成的那条"落进待删队列，
    # 从此每次回前台都替一个已经不存在的对象重打一遍删除。
    ids = list(dict.fromkeys(r.object_key for r in rows))
    for r in rows:
        db.delete(r)
    db.commit()
    return {"file_ids": ids}


@router.get("/api/user/cards", response_model=CardsListOut)
def list_cards(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """列表页一次拿全（判据在服务器，不在这台手机的文件目录）。

    `need_confirm` 是"待确认档"的候选：这篇有分享记录、但服务器没有它的当前卡片行。
    **服务端只能给到"该有一张"，给不到当年用的是哪套模板**——那一栏只在用户自己手机的
    `cardLog` 里，而那个台账不能当准（S0 现读到里面混着尺子写的假条目）。
    所以这里回 id 名单，具体是"补传"还是"重渲"还是"请你重出"由客户端那趟分档判（S3）。
    """
    uid = str(user.id)
    rows = (
        db.query(NoteCard)
        .filter(NoteCard.user_id == uid, current())
        .order_by(NoteCard.id.asc())
        .all()
    )
    have = {r.note_id for r in rows}
    shared = [
        r[0]
        for r in db.query(Share.note_id).filter(Share.user_id == uid).distinct().all()
    ]
    # 只报还真实存在的笔记：撤过分享、笔记已删的那些不该在界面上冒出一句"待确认"。
    alive = set()
    if shared:
        alive = {
            n.id
            for n in db.query(Note).filter(Note.user_id == uid, Note.id.in_(shared)).all()
        }
    need = sorted({nid for nid in alive if nid not in have})
    return {"cards": _views(rows), "need_confirm": need}
