"""运营图这条链唯一碰磁盘的地方：校验、存放、生效位读写。

为什么要单开一个服务而不是写在路由里：`/api/mp/config`（小程序读）、`/api/admin/*`（后台写）、
`/ops`（那一页 HTML）三处都要同一句"这一栏现在生效的是哪一张"。这条链的判据一旦有两份实现，
症状不是报错，是"后台显示已发布、小程序还在用包里那张"——那种不一致没人会发现（锚点 A1 的理由）。

字节的去向只有一处：`settings.MP_ASSETS_DIR`（默认 `backend/var/mp-assets/`，服务器上是
`/home/ubuntu/wtsj-backend/var/mp-assets/`）。**文件名由服务端按内容哈希生成，上传时那个
文件名一个字都不参与**——它带着用户的输入法、空格、`../../`，是这一层唯一可能的路径穿越入口。

格式只放 JPEG 与 PNG 两扇门。`routes/ingest.py:_image_format` 那边收 GIF/BMP/TIFF/WEBP，
因为那条链的下游是 OCR（解得动就行）；这一条的下游是微信小程序的 `<image>` 与
`canvas.createImage()`，包内既有的图全是 JPEG/PNG，掺进第三种就是拿现网赌没实测过的解码。
HEIC 也一样不收——那是 MVP 就定过的口径（PRD 决策台账"不支持 HEIC"）。
"""
import hashlib
import logging
import os
import secrets
from io import BytesIO
from pathlib import Path

from PIL import Image
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import UserError
from app.core.timefmt import _as_utc_iso
from app.models.mp_asset import KINDS, KIND_LABELS, TEXT_KINDS, MpAsset, MpSetting

logger = logging.getLogger(__name__)

# 上限写在这里而不是 settings：这是这条链的策略常量，和 `ingest.py` 那几条同型。
# 放进 .env 只会多出第二份真相（现网没人调它，调错了也没人知道）。
MAX_BYTES = 400 * 1024
# 10-12 现读：`miniprogram/assets/home-bg-portrait.jpg` = **1280×1280 方图、314,793 字节**。
# （方案 §二 里那句"1170×2532"是 10-11 R16 换方图之前的旧数，抄进代码时就错了——按实测改在这里。）
# 上界按"容得下现役那一张、再大就拒"定：长边 1920 是 1.5 倍余量，字节 400KB 是 27% 余量。
# 为什么必须卡：这张图每个用户冷启都要下一次，而客户端 `shrinkForBand` 是给用户自选图用的，
# 不该拿它兜运营图的体积（方案 §五.2 那条）。
MAX_EDGE = 1920
_TOKEN_BYTES = 24

# 允许的两种格式 → (扩展名, media_type)。扩展名只用于文件后缀可读，不参与任何判据。
_FORMATS = {
    b"\x89PNG\r\n\x1a\n": ("png", "image/png"),
    b"\xff\xd8\xff": ("jpg", "image/jpeg"),
}


def assets_dir() -> Path:
    d = Path(settings.MP_ASSETS_DIR)
    d.mkdir(parents=True, exist_ok=True)
    return d


def check_kind(kind: str) -> str:
    if kind not in KINDS:
        raise UserError("这一栏还不存在，请刷新后台页面")
    return kind


def over_bytes_hint() -> str:
    """"太大了"那句话说在这里，只有这一处。

    字节这道线有两处要判：路由读到 `MAX_BYTES + 1` 就得停（不然一张 500MB 的图会整份进内存），
    而服务拿到字节之后也要判（那是走另一条路进来的字节）。两处各写一句中文，
    改上限的那天就会有一处忘了改——所以两处都调这一句，数字也只有这一个出处。
    """
    return f"图片太大，超过上限 {MAX_BYTES // 1024}KB，请先压缩"


def _detect(data: bytes) -> tuple[str, str]:
    for magic, fmt in _FORMATS.items():
        if data.startswith(magic):
            return fmt
    raise UserError("只支持 JPG 或 PNG 的图片")


def inspect(data: bytes) -> tuple[str, str, int, int]:
    """按文件头定格式 → 让 Pillow 真解一次头 → 查两条上限。返回 (ext, media_type, w, h)。

    三道都要：文件头对但内容坏（截断、0 字节、改名改出来的假 JPEG）过不了 Pillow；
    Pillow 过了但字节超限，就是让每个用户冷启多下一轮；尺寸超限则说明传的是原始大图，
    该在后台拒掉、让他压一次，而不是拿客户端那套 `shrinkForBand` 当兜底（那是给用户自选图用的）。
    """
    if not data:
        raise UserError("图片是空的")
    ext, media_type = _detect(data)
    if len(data) > MAX_BYTES:
        raise UserError(over_bytes_hint())
    try:
        with Image.open(BytesIO(data)) as img:
            img.verify()
        with Image.open(BytesIO(data)) as img:
            w, h = img.size
    except Exception as e:
        # Pillow 的异常文本可能带临时路径或它自己的内部术语，不外泄；类型+长度进日志够排查。
        logger.warning("运营图解码失败 type=%s bytes=%d: %s", type(e).__name__, len(data), e)
        raise UserError("这张图解不开，请另存一份标准的 JPG 或 PNG")
    if w <= 0 or h <= 0:
        raise UserError("图片尺寸不对")
    if max(w, h) > MAX_EDGE:
        raise UserError(f"图片边长 {max(w, h)} 超过上限 {MAX_EDGE}，请先压缩")
    return ext, media_type, w, h


def content_hash_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def store(data: bytes, ext: str) -> str:
    """落盘，返回相对 `MP_ASSETS_DIR` 的文件名。内容寻址 = 同样的字节只有一份文件。

    先写 `.part` 再 `os.replace`：直接写目标名的话，读到一半的并发请求会拿到半张图，
    而那张图会被浏览器与小程序按 immutable 缓存一年（`routes/mp_config.py` 那个响应头）。
    """
    name = f"{content_hash_of(data)}.{ext}"
    d = assets_dir()
    target = d / name
    if target.exists():
        return name
    tmp = d / f"{name}.{os.getpid()}.{secrets.token_hex(4)}.part"
    try:
        tmp.write_bytes(data)
        os.replace(tmp, target)
    finally:
        tmp.unlink(missing_ok=True)
    return name


def read_bytes(asset: MpAsset) -> bytes:
    """按账本取字节。`object_path` 只可能是我们服务端生成的那一种形状。

    这一层校验不是防自己：库里那一栏可能被手工 UPDATE 过，而拿着一个能读文件的路径去拼
    `assets_dir() / path` 就是路径穿越。判据用 `Path.name`，不写正则名单。
    """
    name = Path(asset.object_path)
    if str(name) != asset.object_path or name.name in ("", ".", "..") or name.suffix not in (".jpg", ".png"):
        logger.error("运营图账本里的路径形状不对 id=%s path=%s", asset.id, asset.object_path)
        raise UserError("这张图在服务器上找不到了")
    path = assets_dir() / name
    if not path.is_file():
        logger.error("运营图文件缺失 id=%s path=%s", asset.id, asset.object_path)
        raise UserError("这张图在服务器上找不到了")
    return path.read_bytes()


def by_token(db: Session, token: str) -> MpAsset | None:
    return db.query(MpAsset).filter(MpAsset.token == token).first()


def setting_row(db: Session, kind: str, create: bool = False) -> MpSetting | None:
    """取那一栏的生效位。`create=True` 用来把"没这一行"补成"有这一行、当前空着"。

    两种状态在界面上是两句话（见 `models/mp_asset.py` 文件头），所以这里不替调用方糊掉：
    读的时候原样返回 None，写的时候才补行。
    """
    row = db.get(MpSetting, kind)
    if row is None and create:
        row = MpSetting(kind=kind, asset_id=None)
        db.add(row)
        db.commit()
    return row


def current(db: Session, kind: str) -> MpAsset | None:
    """这一栏当前生效的那一张；空值、指向一个不存在的行 → 都是 None（= 用包里那张）。"""
    row = setting_row(db, kind)
    if row is None or row.asset_id is None:
        return None
    return db.get(MpAsset, row.asset_id)


def url_of(asset: MpAsset) -> str:
    """相对路径。**故意不拼成绝对地址**：域名与前缀（`https://api.agentsbin.cn/wtsj`）
    的唯一出处是客户端 `utils/api.js:3`，后端再存一份就是第二份真相，
    而 nginx 那个 `location /wtsj/` 一旦改名，两份会分开错。"""
    return f"/api/mp/a/{asset.token}"


def describe(asset: MpAsset) -> dict:
    return {
        "id": asset.id,
        "kind": asset.kind,
        "token": asset.token,
        "url": url_of(asset),
        "content_hash": asset.content_hash,
        "media_type": asset.media_type,
        "file_size": asset.file_size,
        "width": asset.width,
        "height": asset.height,
        "note": asset.note,
        "created_at": _as_utc_iso(asset.created_at),
    }


def upload(db: Session, kind: str, data: bytes, note: str | None = None) -> MpAsset:
    """校验 + 落盘 + 记一行账。**不改生效位**——传上来和发出去是两件事，
    中间那一格是操作者看一眼预览的地方（方案 §五.3 那条风险提示要的就是这个停顿）。"""
    check_kind(kind)
    ext, media_type, w, h = inspect(data)
    path = store(data, ext)
    asset = MpAsset(
        kind=kind,
        token=secrets.token_urlsafe(_TOKEN_BYTES),
        content_hash=content_hash_of(data),
        object_path=path,
        media_type=media_type,
        file_size=len(data),
        width=w,
        height=h,
        note=(note or "").strip()[:200] or None,
    )
    db.add(asset)
    try:
        db.commit()
    except IntegrityError:
        # 两个人（或同一个人双击）同时传同一份字节：`ux_mp_assets_kind_hash` 咬下第二条。
        # 回滚之后把已有那行还回去——文件本来就是内容寻址的，那一趟失败的提交没留下垃圾，
        # 这正是把文件名按哈希起而不是按 token 起的回报。
        db.rollback()
        existed = (
            db.query(MpAsset)
            .filter(MpAsset.kind == kind, MpAsset.content_hash == asset.content_hash)
            .first()
        )
        if existed is None:
            raise
        logger.info("运营图重复上传 kind=%s hash=%s → 复用 #%s", kind, existed.content_hash[:12], existed.id)
        return existed
    db.refresh(asset)
    logger.info("运营图已存 kind=%s id=%s %dx%d %dB hash=%s", kind, asset.id, w, h, len(data), asset.content_hash[:12])
    return asset


def publish(db: Session, kind: str, asset_id: int) -> MpAsset:
    """把这一栏指向账上已有的一张（发布与回滚是同一个动作，都是指过去）。"""
    check_kind(kind)
    asset = db.get(MpAsset, asset_id)
    if asset is None:
        raise UserError("这一张不在账上，请刷新后台页面")
    if asset.kind != kind:
        # 跨栏引用：把背景图那条指到模板那一栏的资产上。今天只有一栏拦不到什么，
        # 但 P1 加栏之后这一句就是"发布出去的是不是这一栏该显示的东西"的唯一防线。
        raise UserError("这一张不属于该栏目")
    row = setting_row(db, kind, create=True)
    row.asset_id = asset.id
    db.commit()
    db.refresh(asset)
    logger.info("运营图已发布 kind=%s asset=%s hash=%s", kind, asset.id, asset.content_hash[:12])
    return asset


def unpublish(db: Session, kind: str) -> None:
    """停用 = 把生效位写成空，**不删资产行、不删文件**。

    写成空而不是删掉那一行，就是 A1 那格：界面上要能说出"发布过、现在停用"这句话。
    历史行留着也是同一句理由——已经拿到过那张图的老设备要一直读得懂那个地址。
    """
    check_kind(kind)
    row = setting_row(db, kind, create=True)
    row.asset_id = None
    db.commit()
    logger.info("运营图已停用 kind=%s（回到包内那张）", kind)


# ────────────── 文案栏（站长 10-15「Tips 改为后台配置」） ──────────────
# 这两个上限是**我定的，站长没拍过**，改它们只需要改这两行、全链路跟着走：
#   · 单句 40 字——屏上那个盒子是 `.blk-tips-line { max-width: 9em }`（`验-统一录入条` 钉着这条），
#     一句 40 字在里面折成五排，会把展开态那一格往上顶；
#   · 最多 12 句——客户端每 8 秒轮一句，12 句一轮 96 秒，已经超过这一屏的平均停留，再多就是看不见。
MAX_TIPS_ITEMS = 12
MAX_TIP_CHARS = 40
# 两份语言都得齐。只给一份就是后台漏填，客户端切过去会读到空数组 ⇒ 那一行整条消失（`wx:if="{{tips.length}}"`）。
TIP_LANGS = ("zh", "en")


def check_text_kind(kind: str) -> str:
    """与 `check_kind` 分开关门：这一道只认文案栏。

    两条不能合成一条：`upload`/`publish` 那一路假设进来的 kind 能收字节、能记账宽高，
    文案混进去就会出现"给一句话上传一张 JPEG"那种点得动、存进库、屏上永远读不到的格子。
    """
    if kind not in TEXT_KINDS:
        raise UserError("这一栏不是文案栏，请刷新后台页面")
    return kind


def clean_text(value) -> dict:
    """把送来的那份文案洗成唯一形状 `{"zh": […], "en": […]}`；任何不合格整份退回，不部分收。

    整份退回而不是"收合格那几行"（卡片模板那条是收合格的）：文案是一轮播报的序列，
    丢一句就把顺序改了，界面上读出来的是"少一句且我不知道少了哪句"。宁可让后台红着。
    """
    if not isinstance(value, dict):
        raise UserError("文案要按语言给两份")
    out = {}
    for lang in TIP_LANGS:
        lines = value.get(lang)
        if not isinstance(lines, list):
            raise UserError(f"{lang} 那份要是句子列表")
        if not 1 <= len(lines) <= MAX_TIPS_ITEMS:
            raise UserError(f"{lang} 那份要 1~{MAX_TIPS_ITEMS} 句")
        cleaned = []
        for s in lines:
            if not isinstance(s, str):
                raise UserError(f"{lang} 那份里有不是句子的")
            t = s.strip()
            if not t:
                raise UserError(f"{lang} 那份里有空句")
            if len(t) > MAX_TIP_CHARS:
                raise UserError(f"{lang} 有一句超过 {MAX_TIP_CHARS} 字：{t[:12]}…")
            cleaned.append(t)
        out[lang] = cleaned
    return out


def set_text(db: Session, kind: str, value) -> dict:
    check_text_kind(kind)
    payload = clean_text(value)
    row = setting_row(db, kind, create=True)
    row.text_value = payload
    # 文案栏永远不指图片行。写死这一格，是为了让"两栏都填了一半"这种状态在库里无法存在——
    # 那种状态一旦允许，`config_payload` 就要替它编一个优先级，而优先级没人拍过。
    row.asset_id = None
    db.commit()
    db.refresh(row)
    logger.info("运营文案已生效 kind=%s（zh %d 句／en %d 句）", kind, len(payload["zh"]), len(payload["en"]))
    return payload


def clear_text(db: Session, kind: str) -> None:
    """停用＝写回 NULL，客户端落回包内那六句。与 `unpublish` 同一条 A1 口径：留行不留值。"""
    check_text_kind(kind)
    row = setting_row(db, kind, create=True)
    row.text_value = None
    db.commit()
    logger.info("运营文案已停用 kind=%s（回到包里那份）", kind)


def current_text(db: Session, kind: str) -> dict | None:
    row = setting_row(db, kind)
    if row is None or not row.text_value:
        return None
    return row.text_value


def config_payload(db: Session) -> dict:
    """给小程序的那一份。每一已知 kind（图片栏与文案栏都算）都在，值要么是当前那份要么是 null。

    三种情况在这里塌成同一个 null 是**故意的**：冻结（审核期）、停用、从未登记过——
    对客户端都是"用包里那份"，让它们共用一条分支才有 A5 那句"全程不抛、不出声"。
    区分那三种是后台的事，读 `admin_state`。

    ⚠ 回体里多一个 `tips` 键对**现网老包是安全的**：`utils/mpAssets.js:62-65` 遍历回体的键，
      但第一条就是 `if (!entry || !entry.content_hash) continue`，文案那份没有 content_hash ⇒ 跳过。
      这条兼容不靠猜，由 `验-Tips后台下发.js` 拿真回体形状钉着。
    """
    if settings.MP_ASSETS_FREEZE:
        return {kind: None for kind in (*KINDS, *TEXT_KINDS)}
    out = {}
    for kind in KINDS:
        asset = current(db, kind)
        out[kind] = (
            {
                "url": url_of(asset),
                "content_hash": asset.content_hash,
                "updated_at": _as_utc_iso(asset.updated_at or asset.created_at),
            }
            if asset is not None
            else None
        )
    for kind in TEXT_KINDS:
        row = setting_row(db, kind)
        value = current_text(db, kind)
        out[kind] = (
            {
                **value,
                # 客户端拿它当"本机那份要不要换"的判据，与图片那条用 content_hash 同一作用；
                # 文案没有字节可哈希，时间戳就是唯一那份"改过没有"的证据。
                "updated_at": _as_utc_iso(row.updated_at) if row is not None else None,
            }
            if value is not None
            else None
        )
    return out


def admin_state(db: Session) -> dict:
    """给后台那一页的：每一栏的生效位 + 冻结闸状态 + 这一栏的历史。

    `registered` 与 `current` 分开给，是为了把 A1 那两句话在界面上说清楚：
    「发布过，现在停用」和「这台后台还没登记过这一栏」不能都显示成空白一格。
    """
    kinds = []
    for kind in KINDS:
        row = setting_row(db, kind)
        asset = current(db, kind)
        history = (
            db.query(MpAsset)
            .filter(MpAsset.kind == kind)
            .order_by(MpAsset.id.desc())
            .limit(50)
            .all()
        )
        kinds.append({
            "kind": kind,
            "label": KIND_LABELS.get(kind, kind),
            "registered": row is not None,
            "frozen": settings.MP_ASSETS_FREEZE,
            "current": describe(asset) if asset is not None else None,
            "history": [describe(a) for a in history],
        })
    # 文案栏单列一组，不混进上面那个 `kinds`：后台那一页的 `cardFor()` 整段假设一栏是一张图
    # （有文件框、有预览、有历史色块），文案要的是两栏 textarea。混在一起只会画出一个没用的图框。
    # 上限跟着回体走，是为了让网页上那句"最多几句、每句几字"与服务层那两枚常量是同一个出处。
    texts = []
    for kind in TEXT_KINDS:
        row = setting_row(db, kind)
        texts.append({
            "kind": kind,
            "label": KIND_LABELS.get(kind, kind),
            "registered": row is not None,
            "frozen": settings.MP_ASSETS_FREEZE,
            "current": row.text_value if row is not None else None,
            "max_items": MAX_TIPS_ITEMS,
            "max_chars": MAX_TIP_CHARS,
            "langs": list(TIP_LANGS),
        })
    return {"kinds": kinds, "texts": texts, "frozen": settings.MP_ASSETS_FREEZE}
