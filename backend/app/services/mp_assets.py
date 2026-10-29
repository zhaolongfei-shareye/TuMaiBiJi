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
import re
import secrets
from io import BytesIO
from pathlib import Path

from PIL import Image
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import UserError
from app.core.timefmt import _as_utc_iso
from app.models.mp_asset import (
    KINDS, KIND_ABOUT_INTRO, KIND_EMPTY_TEXTS, KIND_LABELS, KIND_SITE_NAMES, KIND_TIPS,
    TABLE_KINDS, TEXT_KINDS, MpAsset, MpSetting,
)

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
#   · 单句 48 字——屏上那个盒子是 `.blk-tips-line { max-width: 9em }`（`验-统一录入条` 钉着这条），
#     中文一句 40 字在里面已经折成五排，所以**这个数卡不住英文**：包里那六句英文实测最长 43 字
#     （10-15 浏览器实测撞出来：填自己家的文案被自家闸门挡在门外）。10-15 站长拍甲抬到 48 ＝
#     现那六句全放得进来、留一点余量；再往上抬要先量那一格折行会不会把展开态顶高，不许顺手加。
#   · 最多 12 句——客户端每 8 秒轮一句，12 句一轮 96 秒，已经超过这一屏的平均停留，再多就是看不见。
MAX_TIPS_ITEMS = 12
MAX_TIP_CHARS = 48
# 两份语言都得齐。只给一份就是后台漏填，客户端切过去会读到空数组 ⇒ 那一行整条消失（`wx:if="{{tips.length}}"`）。
TIP_LANGS = ("zh", "en")
# 「关于那一段介绍」整段的上限（站长 10-21 夜「关于里面，图麦笔记的介绍，放在后台配置」）。
# ⚠ **这个数与 Tips 那两枚不是一套口径，别当"文案栏统一上限"读**：Tips 那一格屏上是
# `.blk-tips-line { max-width: 9em }` 那只小盒子，48 字是被**盒子**逼出来的；这一格整段落进
# 「关于」那张通栏卡里，卡跟着字长高，所以卡的是"别把那一屏撑坏"，不是"放不放得进盒子"。
# 包里那段现读是中文 85 字／英文 264 字符，600 是给两种语言都留一倍以上余量——**故意不给中文
# 单独收紧**：10-15 那次教训就是拿中文的数去卡英文，结果他填自家文案被自家闸门挡在门外。
MAX_INTRO_CHARS = 600
# 一栏一条：形状＋上限。`clean_text` 与后台那一页的话术、探针读的 `max_items`/`max_chars` 全从这张表读，
# 不许在网页里再写一遍数（10-15 那条"上限跟着回体走，两处同一个出处"的口径不变，只是从共用变成按栏给）。
TEXT_SPECS = {
    KIND_TIPS: {"shape": "lines", "max_items": MAX_TIPS_ITEMS, "max_chars": MAX_TIP_CHARS},
    KIND_ABOUT_INTRO: {"shape": "paragraph", "max_items": 1, "max_chars": MAX_INTRO_CHARS},
}


def text_spec(kind: str) -> dict:
    return TEXT_SPECS[kind]


def check_text_kind(kind: str) -> str:
    """与 `check_kind` 分开关门：这一道只认文案栏。

    两条不能合成一条：`upload`/`publish` 那一路假设进来的 kind 能收字节、能记账宽高，
    文案混进去就会出现"给一句话上传一张 JPEG"那种点得动、存进库、屏上永远读不到的格子。
    """
    if kind not in TEXT_KINDS:
        raise UserError("这一栏不是文案栏，请刷新后台页面")
    return kind


def clean_text(kind: str, value) -> dict:
    """按那一栏自己的形状洗一遍；任何不合格整份退回，不部分收。

    整份退回而不是"收合格那几行"（卡片模板那条是收合格的）：文案是一轮播报的序列，
    丢一句就把顺序改了，界面上读出来的是"少一句且我不知道少了哪句"。宁可让后台红着。
    两份语言都要齐这一条对两种形状都成立（少一份＝那一门读到空，屏上那一块直接没了）。

    · `lines`（Tips）：`{"zh": [句子…], "en": [句子…]}`，1~max_items 句、每句 ≤max_chars 字。
    · `paragraph`（关于介绍）：`{"zh": "一整段", "en": "…"}`，一段 ≤max_chars 字。
      ⚠ 这一格**不接句子列表**：整段是"一次填完的一段话"，把它拆成数组会在客户端多一次 join，
      而两处 join 的换行口径迟早对不上——形状钉死成串，回体里也就是串。
    """
    spec = text_spec(check_text_kind(kind))
    if not isinstance(value, dict):
        raise UserError("文案要按语言给两份")
    out = {}
    for lang in TIP_LANGS:
        got = value.get(lang)
        if spec["shape"] == "paragraph":
            if not isinstance(got, str):
                raise UserError(f"{lang} 那份要一整段文字")
            text = got.strip()
            if not text:
                raise UserError(f"{lang} 那一段是空的")
            if len(text) > spec["max_chars"]:
                raise UserError(f"{lang} 那一段超过 {spec['max_chars']} 字：{text[:12]}…")
            out[lang] = text
            continue
        lines = got
        if not isinstance(lines, list):
            raise UserError(f"{lang} 那份要是句子列表")
        if not 1 <= len(lines) <= spec["max_items"]:
            raise UserError(f"{lang} 那份要 1~{spec['max_items']} 句")
        cleaned = []
        for s in lines:
            if not isinstance(s, str):
                raise UserError(f"{lang} 那份里有不是句子的")
            t = s.strip()
            if not t:
                raise UserError(f"{lang} 那份里有空句")
            if len(t) > spec["max_chars"]:
                raise UserError(f"{lang} 有一句超过 {spec['max_chars']} 字：{t[:12]}…")
            cleaned.append(t)
        out[lang] = cleaned
    return out


def _text_summary(payload: dict) -> str:
    """日志里那一句按这一栏自己的形状数：句子数还是字数。"""
    if isinstance(payload.get("zh"), str):
        return f"中文 {len(payload['zh'])} 字／英文 {len(payload.get('en') or '')} 字"
    return f"zh {len(payload['zh'])} 句／en {len(payload.get('en') or [])} 句"


def set_text(db: Session, kind: str, value) -> dict:
    check_text_kind(kind)
    payload = clean_text(kind, value)
    row = setting_row(db, kind, create=True)
    row.text_value = payload
    # 文案栏永远不指图片行。写死这一格，是为了让"两栏都填了一半"这种状态在库里无法存在——
    # 那种状态一旦允许，`config_payload` 就要替它编一个优先级，而优先级没人拍过。
    row.asset_id = None
    db.commit()
    db.refresh(row)
    logger.info("运营文案已生效 kind=%s（%s）", kind, _text_summary(payload))
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


# ────────────── 表栏（站长 10-29「后台提供后台配置…人工修改」那一栏：域名 → 站名） ──────────────
# 站名这一格的字数上限**只有这一个出处**：四级链里那四级的清洗都读它（`services/site_names.py`），
# 界面上那句"最多几字"也从这儿读。它卡的是屏上那只盒子，不是"随手给个数"。
MAX_SITE_CHARS = 24
# 这三枚上限是**我定的，站长没拍过**（他拍的是②那一格的形状＝只存站名，没管一张表能填几行）：
#   · 200 行——他今天要点名的是"这批主流站"（内置词表 20 家），留十倍余量；行多了读的一面是线性扫，
#     而这一趟扫发生在每次外链转存里，不建索引（一张两百行的表不值得）。
#   · 域名 60 字／站名 24 字／备注 100 字——域名那枚跟着 `MpAsset.kind` 那一栏的量级，
#     站名那枚与 `site_names.MAX_SITE_CHARS` **同一枚常量**（两处各写一个数＝改一处漏一处）。
TABLE_SPECS = {
    KIND_SITE_NAMES: {
        "max_rows": 200,
        "max_domain_chars": 60,
        "max_site_chars": MAX_SITE_CHARS,
        "max_note_chars": 100,
        "columns": ("domain", "zh", "en", "note"),
    },
}
# 域名的形状。只收"主机名"，不收协议、路径、端口、通配符：
# 四级链那一级是拿 `urlparse(url).hostname` 来比这一栏的（`services/site_names.py`），
# 存进去一个带 `https://` 或带 `/article` 的值不是"报错"，是**那一行永远命中不了**——
# 症状是他后台改了、屏上没变，而这种不一致在这一条链上没有任何一条其他读数会喊。
_DOMAIN = re.compile(r"^(?=.{1,60}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")


def table_spec(kind: str) -> dict:
    return TABLE_SPECS[kind]


def check_table_kind(kind: str) -> str:
    """第三道闸门，与 `check_kind`（图片栏）、`check_text_kind`（文案栏）并列，互不收对方的 kind。

    分成三道而不是合成一道，是为了让"往错的那组里填"这件事在写口就红，而不是等到屏上读不到。
    """
    if kind not in TABLE_KINDS:
        raise UserError("这一栏不是表格栏，请刷新后台页面")
    return kind


def clean_table(kind: str, value) -> list:
    """整份退回（与 `clean_text` 同一条纪律）：不合格不收半张表。

    为什么不收合格那几行：这张表是**按域名查**的，收半张的症状是"他以为改好了、
    某一家还在念页面自报那个怪名字"，而后台上一行"已生效 N 家"照样绿——比整份红着难查得多。
    同一张表里域名不许重复：四级链取的是第一行命中，两行同一家＝第二行永远不生效，
    那种"填了没用"的格子比报错更气人。
    """
    spec = table_spec(check_table_kind(kind))
    if not isinstance(value, list):
        raise UserError("这一栏要一张表（行的列表）")
    if len(value) > spec["max_rows"]:
        raise UserError(f"这张表最多 {spec['max_rows']} 行，现在有 {len(value)} 行")
    rows: list = []
    seen: set = set()
    for idx, raw in enumerate(value, start=1):
        if not isinstance(raw, dict):
            raise UserError(f"第 {idx} 行不是一个格子")
        domain = str(raw.get("domain") or "").strip().lower()
        if not _DOMAIN.match(domain):
            raise UserError(
                f"第 {idx} 行的域名形状不对：{domain[:30] or '（空的）'}——只写主机名，不带 https:// 和路径"
            )
        if domain in seen:
            raise UserError(f"「{domain}」在这张表里出现了两次，请合并成一行")
        seen.add(domain)
        pair = []
        for lang in ("zh", "en"):
            text = re.sub(r"\s+", " ", str(raw.get(lang) or "")).strip()
            if len(text) > spec["max_site_chars"]:
                raise UserError(f"第 {idx} 行的{lang}站名超过 {spec['max_site_chars']} 字：{text[:12]}…")
            pair.append(text)
        if not pair[0] and not pair[1]:
            raise UserError(f"第 {idx} 行（{domain}）两个名字都没填")
        note = re.sub(r"\s+", " ", str(raw.get("note") or "")).strip()
        if len(note) > spec["max_note_chars"]:
            raise UserError(f"第 {idx} 行的备注超过 {spec['max_note_chars']} 字")
        rows.append({"domain": domain, "zh": pair[0], "en": pair[1], "note": note})
    return rows


def set_table(db: Session, kind: str, value) -> list:
    check_table_kind(kind)
    rows = clean_table(kind, value)
    row = setting_row(db, kind, create=True)
    row.text_value = rows
    row.asset_id = None
    db.commit()
    db.refresh(row)
    logger.info("来源站点名已生效 kind=%s（%d 家）", kind, len(rows))
    return rows


def clear_table(db: Session, kind: str) -> None:
    """停用＝写回 NULL，留行不留值（A1 那句「发布过、现在停用」要的就是这一格）。"""
    check_table_kind(kind)
    row = setting_row(db, kind, create=True)
    row.text_value = None
    db.commit()
    logger.info("来源站点名已停用 kind=%s（四级链退到后面那三级）", kind)


def site_table(db: Session) -> list:
    """四级链第 1 级读的那张表。形状不对（手工 SQL 写进去的东西）一律当"没有这张表"。

    这一句必须永远不抛：它在 worker 转存那一趟的最前面，一张脏表把整篇转存带崩是错的比例。
    """
    row = setting_row(db, KIND_SITE_NAMES)
    value = row.text_value if row is not None else None
    if not isinstance(value, list):
        return []
    return [r for r in value if isinstance(r, dict)]


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
            # 空着那一句按栏给（见 `models/mp_asset.KIND_EMPTY_TEXTS`）。None＝这一栏沿用
            # 网页上原来那句"小程序用包里那一张"。
            "empty_text": KIND_EMPTY_TEXTS.get(kind),
            "registered": row is not None,
            "frozen": settings.MP_ASSETS_FREEZE,
            "current": describe(asset) if asset is not None else None,
            "history": [describe(a) for a in history],
        })
    # 文案栏单列一组，不混进上面那个 `kinds`：后台那一页的 `cardFor()` 整段假设一栏是一张图
    # （有文件框、有预览、有历史色块），文案要的是两栏 textarea。混在一起只会画出一个没用的图框。
    # 上限跟着回体走，是为了让网页上那句"最多几句、每句几字"与服务层那张表是同一个出处；
    # ⚠ 10-21 起这份上限**按栏给**（`TEXT_SPECS`）：Tips 那一格是被 9em 那只小盒子卡的，
    #   关于那一段是整段落进通栏卡，两个数不一样，共用一句"1~12 句、每句 48 字"就会把
    #   他填自家那段介绍挡在门外（10-15 撞过的同一型：拿中文的数卡英文）。
    texts = []
    for kind in TEXT_KINDS:
        row = setting_row(db, kind)
        spec = text_spec(kind)
        value = row.text_value if row is not None else None
        texts.append({
            "kind": kind,
            "label": KIND_LABELS.get(kind, kind),
            "registered": row is not None,
            "frozen": settings.MP_ASSETS_FREEZE,
            "current": value,
            "shape": spec["shape"],
            "max_items": spec["max_items"],
            "max_chars": spec["max_chars"],
            "langs": list(TIP_LANGS),
            # 停用／没登记过那两句的后半截（"屏上现在是什么样"）。不写死在网页里：网页那份
            # 是从 Tips 一栏长出来的话，第二格文案栏照抄就对站长念半句假话（"那六句"）。
            "empty_text": KIND_EMPTY_TEXTS.get(kind),
        })
    return {"kinds": kinds, "texts": texts, "tables": _admin_tables(db), "frozen": settings.MP_ASSETS_FREEZE}


def _admin_tables(db: Session) -> list:
    """表栏那一组（今天只有「来源站点名」一栏）。单列一组，理由与上面 `texts` 那段一样：
    `cardFor()` 整段假设一栏是一张图、`textCardFor()` 假设两份语言各一串，表格要的是"行"。

    ⚠ ③拍的是甲（先不给每族命中读数）：所以这一组里**没有**"这一家今天命中几次"那一栏。
    今天带来源链接的存量只有 28 篇、只落在 3 个站，读数没有内容可看；等有量了再加，
    加了就多一栏要维护的统计（方案第七节③那行的代价栏）。
    """
    out = []
    for kind in TABLE_KINDS:
        row = setting_row(db, kind)
        spec = table_spec(kind)
        value = row.text_value if row is not None else None
        out.append({
            "kind": kind,
            "label": KIND_LABELS.get(kind, kind),
            "registered": row is not None,
            "frozen": settings.MP_ASSETS_FREEZE,
            "current": value if isinstance(value, list) else [],
            "max_rows": spec["max_rows"],
            "max_domain_chars": spec["max_domain_chars"],
            "max_site_chars": spec["max_site_chars"],
            "max_note_chars": spec["max_note_chars"],
            "columns": list(spec["columns"]),
            "empty_text": KIND_EMPTY_TEXTS.get(kind),
        })
    return out
