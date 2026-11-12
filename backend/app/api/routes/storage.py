"""浏览器那一路的"字节进桶"口：H5（安卓套壳）没有 `wx.cloud`，成品图与名片四格得穿这层进来。

先说清这一组接口**不做什么**：它不登记卡片、不写 `note_cards`、不碰 `user_profiles`。
账还是原来那两口写（`POST /api/notes/{id}/card`、`PUT /api/user/profile`），这里只把字节换成一个
`cloud://` 地址交回调用方——也就是把小程序客户端直传（`miniprogram/utils/cloudUpload.js`）那一趟
挪到服务端来做，两段的分工与那条链逐字对齐。为什么必须拆成两步：登记那两口的闸（私密篇不登记、
官方那一篇不登记、归属校验、幂等 upsert、待补队列）只有服务端那一份真相，新写一个"传完顺手记账"
的口就是长出第二套账，而两套账迟早对不上。

四条口径：

1. **路径只有服务端说了算**。`kind` 是一个闭集，每一档自己拼一条固定形状的路径，客户端给的
   文件名一个字都不读（原始文件名可能带路径分隔符，也可能是别人的名字——同 admin_ops 那条理由）。
2. **同一格覆盖写**。小程序那一侧的路径带随机段（`{kind}/{uid}/{day}/{随机}`），因为对象只有客户端
   删得动；这一路是浏览器，删不动（`image_store` 那个函数只有写型，没有删型）。所以这里按
   "一篇一张 / 一格一张"把路径定死：重出一张就是覆盖同一个对象、fileID 不变，
   既不会攒出没人认的孤儿对象，也就守住了《隐私保护指引》里那句"删掉时云端那一份一并删除"
   ——那一档的代价（H5 与小程序的对象落在不同前缀）在 `docs/` 那份审计里点名。
3. **前缀只能是 `images/`**。存图函数那一头写死了这一条（`cloudfunctions/image_store/index.js:44`），
   所以 H5 的卡片成品落在 `images/cards/…`，而小程序直传的在 `cards/…`。不是疏忽，是那一层闸门；
   要并成同一层得先给那个函数开一条 `cards/` 的口子（另一次改动）。
4. **闸与贴图同一条**：字节上限用 `note_images.MAX_UPLOAD_BYTES`（4MB，就是穿网关那一趟的上限），
   格式必须真解得开（Pillow verify），尺寸必须是正的。内容安全那道**不加**——小程序那一侧
   上传卡片成品时没有 imgSecCheck（卡片上的字来自已经过闸的笔记正文与昵称／一句话），
   这里单方面加一道会变成"H5 存不上而小程序存得上"，那比少一道更糟。
5. **读口只转本桶的地址**（下面 `fetch_image`）。浏览器画不出 `cloud://`，而小程序那侧换临时地址靠的是
   SDK 里的 `getTempFileURL`——那一枚在 HTTP 上不存在。11-12 实测：桶自己那个 `*.tcb.qcloud.la` 域名
   **公有读、不要签名**（现网两条真地址 curl 回 `200 / image/jpeg / 27888 B` 与 `200 / image/jpeg / 86806 B`，
   `images/` 与 `cards/` 两个前缀都在），但它**不回 `Access-Control-Allow-Origin`**：浏览器拿它直接画
   `<img>` 行，喂进 canvas 就把画布染脏，之后 `toDataURL`／`toBlob` 当场抛 SecurityError ⇒ 整张分享图存不下来。
   所以这一条由服务端取字节、经自己的 CORS 出口交回去，H5 那边换成一枚同源地址。
"""
import io
import logging
import re

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from PIL import Image
from sqlalchemy.orm import Session

from app.api.routes.assets import (
    MAX_FILE_ID_LEN,
    _assert_ours,
    _clean_file_id,
    _owned_note_or_404,
)
from app.core.auth import get_current_user
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.asset import MAX_ASSETS_PER_NOTE, Asset, next_sort_order
from app.services import note_images
from app.services.preset_note import PRESET_CARD_MSG, is_help_doc
from app.core.private_access import is_private_note, private_category_ids

router = APIRouter()
logger = logging.getLogger(__name__)

# 卡片成品那一档的字节上限：穿网关那一趟的上限就是它，两处同一个数（`note_images` 那份判据
# 在 `_upload` 里还会再量一次，这里先量是为了"读都读不进来"而不是"读进来再拒"）。
MAX_BYTES = note_images.MAX_UPLOAD_BYTES
# 名片四格那一档：客户端 `shrinkForBand` 压完是 1440 长边 JPEG q0.82，实测一枚约 220KB。
# 这一档故意**不**另立上限，与卡片同一个 4MB——拿"大概多大"当闸门，症状就是真用户的图传不上。
MAX_EDGE = 4000


def _dims(data: bytes) -> tuple:
    """字节 → `(ext, width, height)`。解不开／不是 JPG/PNG／尺寸不像话都当场 400，
    不许把一句话的错留给桶去发现（原始文件名的一个字都不读，扩展名由这里说了算）。"""
    if not data:
        raise HTTPException(status_code=400, detail="图片是空的")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"图片超过 {MAX_BYTES // 1048576}MB 限制")
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").upper()
            w, h = img.size
    except Exception as e:
        # 不外泄 Pillow 的原文（可能带临时路径），类型进日志够排查。
        logger.warning("上传的字节解不开 type=%s bytes=%d", type(e).__name__, len(data))
        raise HTTPException(status_code=400, detail="这张图解不开，请换一张常见的照片再试")
    if fmt not in ("PNG", "JPEG"):
        raise HTTPException(status_code=400, detail="这种格式存不了，请换一张常见的照片")
    if w <= 0 or h <= 0 or max(w, h) > MAX_EDGE:
        raise HTTPException(status_code=400, detail=f"图片尺寸不对（长边上限 {MAX_EDGE}）")
    return ("png" if fmt == "PNG" else "jpg"), w, h


@router.post("/api/storage/card")
@limiter.limit("30/minute")
async def upload_card(
    request: Request,
    note_id: int = Form(..., ge=1),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """这篇笔记当前那一张卡片成品进桶，回一个 `cloud://` 地址给调用方去登记。

    两道闸与登记那一口同一份判据（私密篇／官方那一篇）：不卡这两道的话，这一条就成了一条
    "把私密正文印成一张图存进公开可读的桶"的旁路——`POST /api/notes/{id}/card` 拒了也没用，
    字节已经在桶里了。
    """
    note = _owned_note_or_404(db, user, note_id)
    if is_private_note(note, private_category_ids(db, user.id)):
        raise HTTPException(status_code=400, detail="私密笔记不能生成卡片")
    if is_help_doc(note):
        raise HTTPException(status_code=400, detail=PRESET_CARD_MSG)
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"图片超过 {MAX_BYTES // 1048576}MB 限制")
    ext, w, h = _dims(data)
    # 一篇一张：路径里没有日期也没有随机段，重出就是覆盖。
    cloud_path = f"images/cards/{user.id}/{note_id}.{ext}"
    try:
        file_id, body = await note_images.upload_bytes(data, cloud_path)
    except note_images.SkipImage as e:
        logger.warning("卡片成品进桶没成 uid=%s note=%s：%s", user.id, note_id, e)
        raise HTTPException(status_code=502, detail="云端存储这会儿传不进去，稍后再试")
    size = body.get("bytes") if isinstance(body, dict) else None
    logger.info("卡片成品已进桶 uid=%s note=%s %dx%d %dB → %s", user.id, note_id, w, h, len(data), file_id[:60])
    return {"file_id": file_id, "size": int(size) if size else len(data), "width": w, "height": h}


@router.post("/api/storage/profile-slot")
@limiter.limit("30/minute")
async def upload_profile_slot(
    request: Request,
    slot: int = Form(..., ge=0, le=3),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """名片四格里某一格那张图进桶，回地址给 `PUT /api/user/profile` 那一口记账。

    一格一个地址（`slot0..3`），换一张就是覆盖同一格那个对象——与小程序那一侧"一格一个
    `poster-avatar-N` 文件、旧的连着删"是同一件事，只是删这一步在浏览器里只能靠覆盖代做。
    """
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"图片超过 {MAX_BYTES // 1048576}MB 限制")
    ext, w, h = _dims(data)
    cloud_path = f"images/profile/{user.id}/slot{slot}.{ext}"
    try:
        file_id, body = await note_images.upload_bytes(data, cloud_path)
    except note_images.SkipImage as e:
        logger.warning("名片四格进桶没成 uid=%s slot=%s：%s", user.id, slot, e)
        raise HTTPException(status_code=502, detail="云端存储这会儿传不进去，稍后再试")
    size = body.get("bytes") if isinstance(body, dict) else None
    logger.info("名片图已进桶 uid=%s slot=%s %dx%d %dB", user.id, slot, w, h, len(data))
    return {"file_id": file_id, "size": int(size) if size else len(data), "width": w, "height": h}


@router.post("/api/storage/note-image")
@limiter.limit("20/minute")
async def upload_note_image(
    request: Request,
    note_id: int = Form(..., ge=1),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """浏览器那一路的**笔记原图**进桶，并当场记一行 `assets`。

    为什么必须有这一口（11-12 站长报「提炼了图片，但原图没有被保存」）：小程序那张原件是客户端
    直传云开发（`miniprogram/utils/cloudUpload.js`），传完再打 `POST /api/notes/{id}/assets` 绑上；
    worker 里 `process_screenshots_task` 从头到尾只管字——它自己顶上就写着「图不在这条链上：
    它由客户端并行传完再 bind」。浏览器没有 `wx.cloud`，于是 H5 提交完那批字节就死在内存里，
    现网库里那篇 `source_type=screenshot` 的笔记配图 0 行（note 255 现读），详情窗那一排整块不画。
    这一口补的就是"客户端直传"在浏览器里做不到的那半条，账仍然只有 `assets` 一张表。

    四条闸与绑图那一口同一份判据，不在这里长出第二套：归属（`_owned_note_or_404`）、
    字节与格式（`_dims`，与贴图同一个 4MB／Pillow 真解得开）、张数（一篇 9 张，数的是这篇最终挂着的）、
    位置（`next_sort_order`，新图追加在最后，不许抢头图）。
    """
    _owned_note_or_404(db, user, note_id)
    held = db.query(Asset).filter(Asset.note_id == note_id).count()
    if held >= MAX_ASSETS_PER_NOTE:
        raise HTTPException(status_code=400, detail=f"一篇笔记最多 {MAX_ASSETS_PER_NOTE} 张图")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"图片超过 {MAX_BYTES // 1048576}MB 限制")
    ext, w, h = _dims(data)
    # 路径里那一段序号＝这篇现有几张 +1，所以"同一张重传一次"落回同一个对象（覆盖写），
    # 不会攒出没人认的孤儿——浏览器删不动桶，这一条与卡片／名片那两档同一个做法。
    cloud_path = f"images/notes/{user.id}/{note_id}/{held + 1}.{ext}"
    try:
        file_id, body = await note_images.upload_bytes(data, cloud_path)
    except note_images.SkipImage as e:
        logger.warning("笔记原图进桶没成 uid=%s note=%s：%s", user.id, note_id, e)
        raise HTTPException(status_code=502, detail="云端存储这会儿传不进去，稍后再试")
    size = body.get("bytes") if isinstance(body, dict) else None
    size = int(size) if size else len(data)
    row = Asset(
        user_id=str(user.id),
        note_id=note_id,
        object_key=file_id,
        file_type="image/png" if ext == "png" else "image/jpeg",
        file_size=size,
        width=w,
        height=h,
        backup_status="uploaded",
        sort_order=next_sort_order(db, note_id),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("笔记原图已进桶 uid=%s note=%s 第%d张 %dx%d %dB → %s",
                user.id, note_id, held + 1, w, h, size, file_id[:60])
    return {"id": row.id, "file_id": file_id, "size": size, "width": w, "height": h}


# ---------- 读的那一口（浏览器画不出 `cloud://`，见文件头第 5 条） ----------

# `cloud://<env>.<bucket>/<path>`。桶名与路径都只许字母数字与 `._-/`：这一条把拼出来的主机名
# 形状钉死在 `<bucket>.tcb.qcloud.la`，同时也挡掉 `?`／`#`（那两枚会把这条地址变成带查询串的
# 另一条请求）。调用方给的是一枚 fileID 而不是 URL，所以这里根本不接受 URL。
_CLOUD_ID = re.compile(r"^cloud://(?:[A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{1,128})/([A-Za-z0-9._/-]{1,300})$")
CDN_SUFFIX = ".tcb.qcloud.la"


def _public_url(fid: str) -> str:
    s = _clean_file_id(fid)
    m = _CLOUD_ID.match(s)
    if not m:
        raise HTTPException(status_code=400, detail="图片地址不是云开发存储里的图")
    path = m.group(2)
    if path.startswith("/") or ".." in path:
        raise HTTPException(status_code=400, detail="图片地址格式不对")
    return "https://" + m.group(1) + CDN_SUFFIX + "/" + path


def _mime(data: bytes) -> str:
    """回给浏览器的 `content-type` 由**字节自己**说了算，不照抄上游响应头。

    理由与贴图那条同一条：那一条把 `content-type` 当判据（不是 `image/*` 就不进桶），
    这一条要是拿上游给的头直接转发，就等于把"这条地址是张图"交给桶去承认。
    认不出格式的那几种（HEIC 之类）如实回一句，不硬塞 `image/jpeg`——浏览器会画成破图，
    而破图在屏上比一句实话难查得多。
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "").upper()
    except Exception as e:
        logger.warning("读口解不开字节 type=%s bytes=%d", type(e).__name__, len(data))
        raise HTTPException(status_code=415, detail="这张图的格式浏览器读不了")
    hit = {"PNG": "image/png", "JPEG": "image/jpeg", "GIF": "image/gif", "WEBP": "image/webp"}.get(fmt)
    if not hit:
        raise HTTPException(status_code=415, detail="这张图的格式浏览器读不了")
    return hit


@router.get("/api/storage/image")
@limiter.limit("120/minute")
async def fetch_image(
    request: Request,
    file_id: str = Query(..., min_length=1, max_length=MAX_FILE_ID_LEN),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """把桶里那一张原样交回浏览器（同源、带自己的 CORS 头，画布吃了不会染脏）。

    归属校验与写口那三条同一条判据（`_assert_ours`）：地址是能被读到的地址，
    不校就是"拿别人的 fileID 让这台机器替自己读图"。没登记过的新地址不会被这一条拒——
    那是这条链的常态。
    """
    fid = _clean_file_id(file_id)
    _assert_ours(db, str(user.id), fid)
    url = _public_url(fid)
    try:
        data = await note_images.fetch_public(url)
    except note_images.SkipImage as e:
        logger.warning("云上那张没读回来 uid=%s：%s", user.id, e)
        raise HTTPException(status_code=404, detail="那张图这会儿读不出来，稍后再试")
    return Response(
        content=data,
        media_type=_mime(data),
        headers={"Cache-Control": "private, max-age=300"},
    )
