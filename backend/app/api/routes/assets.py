"""笔记配图：绑定、读回、全站配额。

这一组接口是 2.0 图片那条链路的后端半边（方案 docs/图片云备份-开发方案.md §3.2，
路线 docs/方案-2.0大版本.md §3 阶段 3）。**图片字节不经过这台服务器**——前端压完
直接传到微信云开发存储，拿到 fileID 再来这里登记一行；所以这里没有上传接口，只有账。

三条口径要先讲明白，它们都是"不写下来就会被下一个人改错"的那种：

1. **配额是全站合计，不是每人。** 云开发免费额度那 5GB 是整个环境一个池子，
   所以 `used_ratio` 按**全站** uploaded 求和算，不是按当前用户。方案文档 §3.2.3 原来
   写的是 `SELECT SUM(file_size) WHERE user_id = ?` 再除以 5GB——那个比值会让人以为
   "我才用了 0.4%"而实际全站已经 92%。这里两个数都回，比值只认全站那个。
2. **一篇最多 9 张，这条上限第一次落在服务端。** 前端 `create.js` 的 9 是"选图时最多
   选 9 张"，`ingest.py` 的 10 是"一批最多 10 张"（管的是一次 OCR 请求，不是归属）。
   图能留下来之后，"一篇笔记挂着多少行 assets"才是要钉的那个量。
3. **fileID 是别人能读的地址。** 存进库的这串 `cloud://...` 客户端拿去就能
   `getTempFileURL`，所以入口必须校格式与长度，读接口必须校归属——否则第 2 个人的
   笔记链接能换来第 1 个人的截图。
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.timefmt import UTCDatetime
from app.db.database import get_db
from app.models.asset import Asset, MAX_ASSETS_PER_NOTE, not_failed
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.user import User
from app.models.user_profile import UserProfile

router = APIRouter()  # 路径写全（跨 /api/notes 与 /api/user 两个前缀），见 main.py 那行注释
logger = logging.getLogger(__name__)

# 云开发单文件上限 20MB（docs/图片云备份-开发方案.md §二那张表）；压完正常在几百 KB，
# 这条是拦住客户端把别的什么东西塞进来记账。
MAX_FILE_BYTES = 20 * 1024 * 1024
# 一篇笔记的配图张数：常量在 models/asset.py 的 MAX_ASSETS_PER_NOTE，全仓只有那一个定义。
# **只有绑这一个口卡它**，两个读的口（列表、公开页）都不截——读的口再卡一遍就会造出
# "库里占着配额、界面上不存在"的幽灵行。守这条的是 docs/工具/验-张数只有一个出处.js。
# Asset.object_key 是 String(500)，但 SQLite 上那只是装饰（notes.py 顶上那条注释说的就是
# 这个坑）：长度只能在入口卡。fileID 实测一百多字符，500 是给云开发自己留的余量。
MAX_FILE_ID_LEN = 500


class AssetIn(BaseModel):
    file_id: str = Field(min_length=1, max_length=MAX_FILE_ID_LEN)
    # 尺寸与字节数都可选：拿不到不该拦人存图，但拿不到就等于这一张不计入配额，
    # 所以宁可让它可空也别在客户端任何一条取不到信息的分支上抛错。
    size: Optional[int] = Field(default=None, ge=0, le=MAX_FILE_BYTES)
    width: Optional[int] = Field(default=None, ge=0, le=20000)
    height: Optional[int] = Field(default=None, ge=0, le=20000)


class AssetBindIn(BaseModel):
    items: List[AssetIn] = Field(default_factory=list)


class AssetOut(BaseModel):
    id: int
    cloud_url: str
    size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    created_at: UTCDatetime = None

    class Config:
        from_attributes = True


class QuotaOut(BaseModel):
    user_bytes: int
    total_bytes: int
    cap_bytes: int
    used_ratio: float
    user_count: int
    total_count: int


def _owned_note_or_404(db: Session, user: User, note_id: int) -> Note:
    """归属校验：不是你的笔记和不存在，回同一个 404。

    与 notes.py 那几条同口径（`get_note` 也是 `.filter(Note.id==, Note.user_id==)` 查不到就
    404）——区分"不存在"与"不是你的"等于给外人一篇一篇试 id 的探测器。
    """
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.user_id == str(user.id))
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在或已删除")
    return note


def _clean_file_id(fid: str) -> str:
    """一条 fileID 的格式校法，**三张表共用**：`assets`（配图）、`note_cards`（卡片）、
    `user_profiles`（名片）。原来三处各写一遍（这边内联在 `_clean_items` 里、cards.py 叫
    `_check_file_id`、profiles.py 叫 `_clean_file_id`），结果 cards.py 那一份查空白、
    profiles.py 那一份查长度——**同一条脏数据在三个口有三种命运**（10-09 审计）。
    """
    s = (fid or "").strip()
    # 光看前缀不够：`cloud://` 自己也算"以 cloud:// 开头"，那是一条指向空的地址，
    # 存进去之后前端拿它换临时链接只会拿到一个看不懂的错。
    rest = s[len("cloud://"):] if s.startswith("cloud://") else ""
    if not rest or any(c.isspace() for c in rest):
        raise HTTPException(status_code=400, detail="图片地址格式不对")
    if len(s) > MAX_FILE_ID_LEN:
        raise HTTPException(status_code=400, detail="图片地址过长")
    return s


def _assert_ours(db: Session, uid: str, fid: str) -> None:
    """这个地址如果已经在**别人**的账上，直接拒。

    为什么必须有：fileID 是能被读到的地址，谁拿到都能往自己名下登记一行；而"删笔记／撤档／注销"
    的回体会把这些地址交回**调用方**去删。不校这一条，就是"把你的对象登记成我的，再替我删掉"。
    （10-09 审计第五条：卡片那个口当时只校形状，没校这一条。）

    没登记过的新地址走不到这里被拒——它是这条链的常态（客户端先传后登记，服务器无从预知）。
    """
    for model, col in ((Asset, Asset.object_key), (NoteCard, NoteCard.object_key)):
        hit = db.query(model).filter(col == fid).first()
        if hit and hit.user_id != uid:
            raise HTTPException(status_code=400, detail="图片地址不属于当前账号")
    # 名片那一行的四格存在一个 JSON 列里，没有可查的列，只能整列捞出来在内存里比。
    for (slots,) in db.query(UserProfile.slots).filter(UserProfile.user_id != uid).all():
        for s in (slots or []):
            if s and s.get("file_id") == fid:
                raise HTTPException(status_code=400, detail="图片地址不属于当前账号")


def _clean_items(items: List[AssetIn]) -> List[AssetIn]:
    """校格式 + 去重 + 卡张数。脏数据一律 400，不静默丢——静默丢会让"传上去 9 张、
    笔记里只剩 6 张"这种问题变成查不到的玄学。"""
    seen = set()
    out: List[AssetIn] = []
    for it in items:
        fid = _clean_file_id(it.file_id)
        if fid in seen:
            continue
        seen.add(fid)
        out.append(AssetIn(file_id=fid, size=it.size, width=it.width, height=it.height))
    return out


@router.post("/api/notes/{note_id}/assets", response_model=List[AssetOut])
def bind_note_assets(
    note_id: int,
    payload: AssetBindIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """把一批 fileID 归到这篇笔记上。**幂等**：同一个 fileID 重复 bind 只更新那一行。

    幂等这条不是可选项：B 链的设计是"上传失败不阻断主流程 + 下次进详情页补绑"
    （§3.1.4 第 4 步），所以同一条 fileID 一定会被送来第二次。不幂等就是每次补绑
    多堆一行，配额求和跟着虚高，而用户看到的还是那 9 张图。
    """
    _owned_note_or_404(db, user, note_id)
    items = _clean_items(payload.items)
    # 卡的是**这篇笔记最终挂着的张数**，不是"这一次送来几条"：只卡后者，补绑一次加一条
    # 就能一路加到十几张，而屏上那排缩略图永远只画前 9 张——多出来的就成了看不见又占配额的幽灵。
    # 用集合并一下是为了让重复绑同一批（幂等那条）不计新增。
    current = {r[0] for r in db.query(Asset.object_key).filter(Asset.note_id == note_id).all()}
    if len(current | {it.file_id for it in items}) > MAX_ASSETS_PER_NOTE:
        raise HTTPException(status_code=400, detail=f"一篇笔记最多 {MAX_ASSETS_PER_NOTE} 张图")

    uid = str(user.id)
    bound: List[Asset] = []
    for it in items:
        row = db.query(Asset).filter(Asset.object_key == it.file_id).first()
        if row and row.user_id != uid:
            # 别人的 fileID 想塞进自己的笔记：要么是他抄的，要么是他猜的。都不给。
            raise HTTPException(status_code=400, detail="图片地址不属于当前账号")
        if row:
            # 已经绑到别篇笔记的行不抢过来——那意味着两篇笔记共用一张图，
            # 而今天的设计里没有任何一处支持"同一张图属于两篇"。
            if row.note_id and row.note_id != note_id:
                raise HTTPException(status_code=400, detail="图片已归到别的笔记")
            row.note_id = note_id
            row.user_id = uid
            row.file_size = it.size if it.size is not None else row.file_size
            row.width = it.width if it.width is not None else row.width
            row.height = it.height if it.height is not None else row.height
            row.backup_status = "uploaded"
        else:
            row = Asset(
                user_id=uid,
                note_id=note_id,
                object_key=it.file_id,
                file_type="image/jpeg",
                file_size=it.size,
                width=it.width,
                height=it.height,
                backup_status="uploaded",
            )
            db.add(row)
        bound.append(row)
    db.commit()
    for row in bound:
        db.refresh(row)
    return _views(bound)


@router.get("/api/notes/{note_id}/assets", response_model=List[AssetOut])
def list_note_assets(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _owned_note_or_404(db, user, note_id)
    rows = (
        db.query(Asset)
        .filter(
            Asset.note_id == note_id,
            Asset.user_id == str(user.id),
            # 与配额用的是同一个判断（not_failed）：两处写法一旦分叉，就会出现
            # "这一张算进配额却列不出来"的幽灵行——看得见的是钱，看不见的是图。
            not_failed(),
        )
        .order_by(Asset.id.asc())
        .all()
    )
    return _views(rows)


def _sum_bytes(db: Session, uid: Optional[str] = None) -> int:
    """**配图 + 卡片两张表**的真实字节。

    原来这里只 SUM `Asset`，而卡片对象住在同一个桶里（`cards/` 那一层）却一个字节都没进账——
    那枚"快满了"因此长期偏低，报的是一句"明明快满了界面还说有余量"的假话（10-09 审计）。
    站长 10-08 定 ≤200KB 上界入账时说得很清楚：那是**没量到实测之前的估算口径**，
    "量到实测再校"。S2 起每一条登记都带真实 `file_size`，实测数就在这一列里，所以口径换成真数，
    那个估算常量随之退休（`models/note_card.py`、`验-卡片留档S1.js`、方案 §四.4、PRD §8.149 同批改）。

    张数那一栏（`_count`）**不跟着加卡片**：界面上那一句说的是"你存了几张图"，
    把成品卡片混进去会变成"我明明只传了 3 张图，怎么显示 7 张"。
    """
    q1 = db.query(func.coalesce(func.sum(Asset.file_size), 0)).filter(not_failed())
    q2 = db.query(func.coalesce(func.sum(NoteCard.file_size), 0))
    if uid:
        q1 = q1.filter(Asset.user_id == uid)
        q2 = q2.filter(NoteCard.user_id == uid)
    return int(q1.scalar() or 0) + int(q2.scalar() or 0)


def _count(db: Session, uid: Optional[str] = None) -> int:
    q = db.query(func.count(Asset.id)).filter(not_failed())
    if uid:
        q = q.filter(Asset.user_id == uid)
    return int(q.scalar() or 0)


@router.get("/api/user/storage-quota", response_model=QuotaOut)
def storage_quota(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """前端那枚"快满了"的提示读这里。**used_ratio 是全站口径**（见文件头第 1 条）。"""
    uid = str(user.id)
    cap = 5 * 1024 * 1024 * 1024  # 云开发免费档 5GB；升档改这一处（别在客户端抄第二份）
    total_bytes = _sum_bytes(db)
    return QuotaOut(
        user_bytes=_sum_bytes(db, uid),
        total_bytes=total_bytes,
        cap_bytes=cap,
        used_ratio=round(total_bytes / cap, 4),
        user_count=_count(db, uid),
        total_count=_count(db),
    )


def _views(rows: List[Asset]) -> List[AssetOut]:
    return [
        AssetOut(
            id=r.id,
            cloud_url=r.object_key,
            size=r.file_size,
            width=r.width,
            height=r.height,
            created_at=r.created_at,
        )
        for r in rows
    ]
