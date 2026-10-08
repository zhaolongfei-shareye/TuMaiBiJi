"""名片（四格形象图 + 名称 + 一句话）与背景亮度档的读写口（2.1 第一条）。

一句话：**换手机／重置手机之后，名片那四格图和两档外观不该是空的。**
成因在 `app/models/user_profile.py` 顶上那段，实测量与决定在 `docs/方案-2.1大版本.md` §三。

图片字节不经过这台服务器——客户端先直传云开发拿到 `cloud://` fileID，再来这里登记，
与 `routes/assets.py`、`routes/cards.py` 同型。所以这里没有上传口，只有账。

五条口径先讲明白：

1. **写口是补丁，不是整份覆盖。** 只带 `bg_dim` 的那一趟不该把名称抹掉（`exclude_unset`）。
   客户端 `poster.js` 的 `writeProfile(patch)` 本来就是打补丁的语义，服务端换成语义不一致的
   整份覆盖，就会出现"改一档亮度，名片没了"。
2. **`slots` 存的时候永远补齐四格**（空位是 `null`，不是少一项）。少一项会把第三格挪到第二格
   的位置上，而界面上那四个位置是按序号摆的。
3. **一格图只能是 `cloud://`、且必须是当前这个人的。** fileID 是别人拿到就能读的地址，
   入口校格式、读口校归属（`routes/assets.py:106` 那条同口径：光看前缀不够，
   `cloud://` 自己也算"以 cloud:// 开头"）。
4. **`card` / `bg` 各自单选**，界面上就是这条规矩（勾一张别的灭）。服务端不校就会出现
   两格都当"卡片头像"，而画布只会拿第一张——那是画面上说不出原因的错。
5. **换下来／撤掉的那格，旧地址在回体的 `file_ids` 里给回去**，键名与 `delete_note`、
   `deactivate`、`撤卡片` 完全一样：对象只有客户端 `wx.cloud.deleteFile` 删得动，
   服务端删不掉，而除了这一次响应没有第二个地方能把它交回去。
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.timefmt import UTCDatetime
from app.db.database import get_db
from app.models.asset import Asset
from app.models.note_card import NoteCard
from app.models.user import User
from app.models.user_profile import (
    BG_DIM_RANGE,
    MAX_TPL_LEN,
    MAX_NAME_LEN,
    MAX_SLOGAN_LEN,
    SLOT_COUNT,
    UserProfile,
)

router = APIRouter()  # 路径写全（/api/user/profile），与 cards.py 同一做法
logger = logging.getLogger(__name__)

MAX_FILE_ID_LEN = 500  # 与 Asset.object_key / NoteCard.object_key 同宽
# 名片图的上界拦的是"这不像一张形象图"，不是配额（配额那条见 models/user_profile.py 第 3 条）。
# 与 assets/cards 同值：云开发单文件上限 20MB。
MAX_PROFILE_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_SIDE = 20000


class SlotIn(BaseModel):
    file_id: str = Field(min_length=1, max_length=MAX_FILE_ID_LEN)
    card: bool = False
    bg: bool = False
    width: Optional[int] = Field(default=None, ge=0, le=MAX_SIDE)
    height: Optional[int] = Field(default=None, ge=0, le=MAX_SIDE)
    size: Optional[int] = Field(default=None, ge=0, le=MAX_PROFILE_UPLOAD_BYTES)


class ProfileIn(BaseModel):
    # 模板只校形状（长度），**不抄一份 id 白名单**：卡片模板走的是
    # 「不走发版」那条线，服务端跟着名单就得每次新模板发一次后端，那条承诺当场作废（同 routes/cards.py 第 2 条）。
    tpl: Optional[str] = Field(default=None, max_length=MAX_TPL_LEN)
    name: Optional[str] = Field(default=None, max_length=MAX_NAME_LEN)
    slogan: Optional[str] = Field(default=None, max_length=MAX_SLOGAN_LEN)
    # 允许传短于四格的数组（末尾按空位补），但**不许长**：第五格在界面上不存在。
    slots: Optional[List[Optional[SlotIn]]] = Field(default=None, max_length=SLOT_COUNT)
    bg_dim: Optional[int] = Field(default=None, ge=BG_DIM_RANGE[0], le=BG_DIM_RANGE[1])


class ProfileOut(BaseModel):
    """读口。`slots` 故意是裸 `list`：它是 JSON 列，形状只在写口校。

    现网那次把 `key_links` 钉成 `List[str]`，用例喂自己编的字符串数组照样全绿，线上第一条读取
    就 500（2026-10-08，探针抓到的）。同一份数据不许有两个说法。
    """
    tpl: Optional[str] = None
    name: Optional[str] = None
    slogan: Optional[str] = None
    slots: Optional[list] = None
    bg_dim: Optional[int] = None
    updated_at: UTCDatetime = None


class ProfileSaveOut(BaseModel):
    profile: ProfileOut
    file_ids: List[str] = Field(default_factory=list)


def _clean_file_id(fid: str) -> str:
    """与 `routes/assets.py:_clean_items` 同一条格式校法（那边是内联的，这里抽出来复用）。"""
    s = (fid or "").strip()
    rest = s[len("cloud://"):] if s.startswith("cloud://") else ""
    if not rest:
        raise HTTPException(status_code=400, detail="图片地址格式不对")
    if len(s) > MAX_FILE_ID_LEN:
        raise HTTPException(status_code=400, detail="图片地址过长")
    return s


def _assert_ours(db: Session, uid: str, fid: str) -> None:
    """这个地址如果已经在别人的账上，直接拒。

    三张表都要问：`assets`（配图）、`note_cards`（卡片）、`user_profiles`（别人的名片）。
    没登记过的新地址走不到这里被拒——它是这条链的常态（客户端先传后登记，服务器无从预知）。
    """
    for model in (Asset, NoteCard, UserProfile):
        if model is UserProfile:
            rows = db.query(model.slots).filter(model.user_id != uid).all()
            for (slots,) in rows:
                for s in (slots or []):
                    if s and s.get("file_id") == fid:
                        raise HTTPException(status_code=400, detail="图片地址不属于当前账号")
            continue
        col = Asset.object_key if model is Asset else NoteCard.object_key
        hit = db.query(model).filter(col == fid).first()
        if hit and hit.user_id != uid:
            raise HTTPException(status_code=400, detail="图片地址不属于当前账号")


def _clean_slots(db: Session, uid: str, slots: List[Optional[SlotIn]]) -> List[Optional[dict]]:
    out: List[Optional[dict]] = []
    for s in slots:
        if s is None:
            out.append(None)
            continue
        fid = _clean_file_id(s.file_id)
        _assert_ours(db, uid, fid)
        out.append({
            "file_id": fid,
            "card": bool(s.card),
            "bg": bool(s.bg),
            "width": s.width,
            "height": s.height,
            "size": s.size,
        })
    while len(out) < SLOT_COUNT:
        out.append(None)
    live = [x for x in out if x]
    # 单选：界面上勾一张别的灭，服务端不校就会出现两张都当头像（画布只拿第一张，
    # 于是症状是"我明明勾了另一张"）。
    if sum(1 for x in live if x["card"]) > 1 or sum(1 for x in live if x["bg"]) > 1:
        raise HTTPException(status_code=400, detail="卡片与背景各只能选一张")
    return out


def _row_or_none(db: Session, uid: str) -> Optional[UserProfile]:
    return db.query(UserProfile).filter(UserProfile.user_id == uid).first()


def _out(row: Optional[UserProfile]) -> ProfileOut:
    if row is None:
        return ProfileOut()
    return ProfileOut(
        tpl=row.tpl,
        name=row.name,
        slogan=row.slogan,
        slots=row.slots,
        bg_dim=row.bg_dim,
        updated_at=row.updated_at,
    )


def _text(val: Optional[str], max_len: int, label: str) -> Optional[str]:
    """空串＝清空（存 NULL），前后空白一律剥掉。

    不许把 `"  "` 存成一条有值的名称：界面上那格会显示成"看起来填了、其实是空的"，
    而海报上的名片位拿它当"用户填过"，兜底的"麦"字就不画了。
    """
    if val is None:
        return None
    s = val.strip()
    if len(s) > max_len:
        raise HTTPException(status_code=400, detail=f"{label} 太长")
    return s or None


@router.get("/api/user/profile", response_model=ProfileOut)
def read_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """没有这一行不是错误，回一份全空（客户端落回本机那份缓存/默认值）。"""
    return _out(_row_or_none(db, str(user.id)))


@router.put("/api/user/profile", response_model=ProfileSaveOut)
def write_profile(
    body: ProfileIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """补丁式写：只改请求体里出现的那几栏。回体带被换下／撤掉的旧地址清单。"""
    uid = str(user.id)
    row = _row_or_none(db, uid)
    if row is None:
        row = UserProfile(user_id=uid)
        db.add(row)

    dropped: List[str] = []
    data = body.model_dump(exclude_unset=True)

    if "tpl" in data:
        t = (data["tpl"] or "").strip()
        row.tpl = t or None
    if "name" in data:
        row.name = _text(data["name"], MAX_NAME_LEN, "名称")
    if "slogan" in data:
        row.slogan = _text(data["slogan"], MAX_SLOGAN_LEN, "一句话")
    if "bg_dim" in data:
        row.bg_dim = data["bg_dim"]
    if "slots" in data:
        old = [s for s in (row.slots or []) if s]
        # 吃 `body.slots` 而不是 `data["slots"]`：后者被 model_dump 打成了 dict，
        # 而 _clean_slots 要的是 SlotIn（`s.file_id`）。用 dump 出来的那份会当场 AttributeError，
        # 症状是"名片一存就 500"（第一版就是这么红的，用例抓的）。
        new = _clean_slots(db, uid, body.slots or [])
        keep = {s["file_id"] for s in new if s}
        # 顺序：先算清单再落库。反过来（先写库再比对）在新旧同一张图时算不出差集，
        # 而那正是"换回原来那张"这条真会走到的路。
        dropped = [s["file_id"] for s in old if s.get("file_id") and s["file_id"] not in keep]
        row.slots = new

    db.commit()
    db.refresh(row)
    logger.info("名片登记：user=%s 换下 %d 个对象", uid, len(dropped))
    return ProfileSaveOut(profile=_out(row), file_ids=list(dict.fromkeys(dropped)))
