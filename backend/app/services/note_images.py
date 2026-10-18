"""外链贴图随笔记存档：正文里的图 → 下载 → 压到客户端那把尺子 → 进云开发那个桶 → 回 fileID。

正本 `docs/方案-公众号贴图随笔记存档.md`（站长 10-18 夜拍的五句＋「加一条：支持来源」）。
四条形状不许下一个人改错：

1. **只存，不读内容。** 这些字节不进 OCR、不进摘要／要点／标签那一步（第 1 句「图片不需要提炼」），
   所以这一整段发生在笔记已经建好、提炼已经出来**之后**。
2. **通道与用户自己上传那一路完全同一个。** 对象进云开发那个桶、落在 `images/{userId}/{YYYYMMDD}/`
   那一层（与 `miniprogram/utils/cloudUpload.js` 同一条路径规则），账记进 `assets` 表，
   于是配额／私密闸／公开页露图／列表那排缩略图一行代码都不用为新功能重写。
3. **下载一律不带 Referer。** 两族防盗链的失败形状**相反**：`mmbiz.qpic.cn` 带错 Referer 回的是
   **200 ＋ 2,090 B 那张 140×140 的占位 jpeg**（状态码抓不到），`sns-webpic-qc.xhscdn.com` 带错 Referer
   回的是**硬 403**。10-19 02:1x 又各打三次复现过这两读数。所以既不能带任何一个 Referer，
   也不能只写"非 200 就跳过"。
4. **一张的失败不许变成整篇的失败。** 下不动／压不了／传不上去 ⇒ 那一张记进 `failed`，
   笔记照建、摘要照出，与现网"B 链任何一次失败都不该让笔记没存下来"同口径。
   但失败也不许静默：那一个数要交回任务回体，由界面上那句话说出来。
"""
import base64
import io
import logging
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from PIL import Image

from app.core.config import settings
from app.services import scraper
from app.services.llm import key_usable

logger = logging.getLogger(__name__)

# 长边与预算与客户端那把尺子**逐字同值**（`miniprogram/utils/imageCompress.js` 的
# `MAX_LONG_EDGE`／`BUDGET_BYTES`／`QUALITY_LADDER`）。服务端读不到 js 那一枚，所以这里第二份
# 是必要的，但**两处必须一起动**：钉它的是 tests/test_note_images.py 里那条"改一头必红"。
MAX_LONG_EDGE = 1920
BUDGET_BYTES = 500 * 1024
# 客户端那三个数是 0–1 的 canvas quality，Pillow 吃的是 1–95 的整数，所以下面按 `q * 100` 折算。
QUALITY_LADDER = (0.7, 0.5, 0.3)

# 单张下载上限：**读配图登记接口那一个常量**（`models/asset.MAX_FILE_BYTES`，20MB），
# 这里不再抄第二个数。两处各写一份迟早走样，走样的症状是"接口收得下、下载这一头先判超限丢掉"。
from app.models.asset import MAX_FILE_BYTES
# 网关那一趟是 JSON＋base64，字节到函数那边会比本地这份大 4/3。函数侧还有一道同样的检查，
# 两头都不许只靠"压缩之后应该不大"——真拿到一张超的，这一张算"没存上"，不能把整篇带崩。
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
DOWNLOAD_TIMEOUT = 20.0
MAX_REDIRECTS = 5

# 防盗链占位图那一格（200 ＋ 一小把字节 ＋ 实际解出来就一丁点大）：两个条件**同时**成立才判它是占位图。
# 只看字节会误杀真图（10-18 实测腾讯云社区那两张正文图 767 B／1,253 B），只看尺寸会放过大的壳图。
# 读数：微信那张占位＝2,090 B / JPEG / 140×140；同一条地址不带 Referer 是 683,938 B / PNG / 800×1000。
PLACEHOLDER_MAX_BYTES = 4 * 1024
PLACEHOLDER_MAX_EDGE = 200

# 只放行这些协议，与抓取那道闸同一个口径（`scraper.ALLOWED_SCHEMES`）。
IMAGE_HEADERS = {
    "User-Agent": scraper.HEADERS["User-Agent"],
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}


class SkipImage(Exception):
    """这一张存不下（下载失败／不是图／占位图／传不上桶）。**只进日志，不进用户那句话**。"""


@dataclass
class Prepared:
    file_id: str
    mime: str
    size: int
    width: int
    height: int
    over_budget: bool
    source_url: str


@dataclass
class Compressed:
    """压完待传的那一张：字节＋**实际解出来的**宽高＋它属于哪一种格式＋该落成的文件尾巴。"""
    data: bytes
    mime: str
    ext: str
    width: int
    height: int
    over_budget: bool


@dataclass
class ArchiveResult:
    kept: list
    failed: list
    total: int

    def __post_init__(self):
        self.kept = list(self.kept or [])
        self.failed = list(self.failed or [])
        self.total = int(self.total or 0)

    @property
    def truncated(self) -> int:
        """被"最多 9 张"那条砍掉几章。屏上那句实话用的就是这个数。"""
        return max(0, self.total - len(self.kept) - len(self.failed))


def channel_ready() -> bool:
    """通道没配＝整条不做。代码可以先上现网，`.env` 里那两行加上才算开工。"""
    return bool((settings.IMAGE_STORE_CF_URL or "").strip()) and key_usable(settings.IMAGE_STORE_CF_KEY)


def _day() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _cloud_path(user_id, ext: str) -> str:
    """与客户端 `cloudUpload.js` 同一条路径规则：`images/{userId}/{YYYYMMDD}/{随机}.{ext}`。

    收在一处不是为了好看——桶的读写权限、以后按天前缀清理、以及"哪些对象属于我们这一篇"
    三件事都按这一层前缀成立。客户端那一份的日期用的是本机时区，这里用 UTC：
    差一天不影响任何判据（那一层只用来扫，不用来对账），但要在注释里说明白，
    别让下一个人以为两处必须逐字相同。
    """
    rand = "".join(random.choice("0123456789abcdefghijklmnopqrstuvwxyz") for _ in range(8))
    return f"images/{user_id}/{_day()}/{int(time.time() * 1000):x}{rand}.{ext}"


def _validate(url: str) -> str:
    """SSRF 闸门直接借抓取那一道，**不在这里写第二份网段清单**。

    这些地址来自外部 HTML 里的 `<img>`，不是他打进那一行的，但风险一模一样：
    正文里写一个 `//169.254.0.23/...` 就等于让这台机器替它去读云厂商元数据。
    """
    return scraper._validate_url(url)


async def _download(client: httpx.AsyncClient, url: str) -> bytes:
    current = _validate(url)
    for _ in range(MAX_REDIRECTS):
        # 每一跳都重新判一次：跳转目标也来自外部，只判第一次等于没判
        _validate(current)
        total = 0
        chunks: list[bytes] = []
        async with client.stream("GET", current) as resp:
            if resp.is_redirect:
                location = resp.headers.get("location", "")
                if not location:
                    raise SkipImage("跳转没有 Location")
                current = location if location.startswith("http") else str(httpx.URL(current).join(location))
                continue
            if resp.status_code >= 400:
                raise SkipImage(f"站点回 HTTP {resp.status_code}")
            ctype = (resp.headers.get("content-type") or "").lower()
            if not ctype.startswith("image/"):
                raise SkipImage(f"响应头不是图片（{ctype or '空'}）")
            async for chunk in resp.aiter_bytes(chunk_size=8192):
                total += len(chunk)
                if total > MAX_FILE_BYTES:
                    raise SkipImage(f"单张超过 {MAX_FILE_BYTES // 1024 // 1024}MB")
                chunks.append(chunk)
        return b"".join(chunks)
    raise SkipImage("跳转次数过多")


def _inspect(data: bytes):
    """解出真实尺寸与格式，并拦掉那种"200 ＋ 一小把字节"的占位图。

    ⚠ 宽高与格式**一律取自解出来的那张图**，不许照 URL 猜：实测一条尾巴写着
    `/640?wx_fmt=png` 的地址回的是 JPEG、1080 宽（方案第二节那条读数）。

    ⚠ 这一条**只管静图**：微信那张占位是静 JPEG（140×140／2,090 B），而动图不可能是占位图。
    10-19 本机端到端实测到误杀：真文章里一张 47×91、1,242 B 的 25 帧动图被这两个条件同时命中、
    当成占位图丢掉了。少存一张真图是看得见的丢失，多留一张小占位图只是几 KB。
    """
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as exc:
        raise SkipImage(f"解不出图片（{type(exc).__name__}）") from exc
    long_edge = max(im.width, im.height)
    if (not getattr(im, "is_animated", False)
            and len(data) <= PLACEHOLDER_MAX_BYTES and long_edge <= PLACEHOLDER_MAX_EDGE):
        raise SkipImage(f"看着是防盗链占位图：{len(data)} B／{im.width}x{im.height}")
    return im, long_edge


# 动图原样存时要落的格式名。判据用的是 `is_animated`（Pillow 解出来的），**不限 GIF**——
# 10-19 审查抓到原来那一判写的是 `fmt == "GIF"`，于是 APNG／动 WebP 会被压成静帧，
# 而注释说的是"动图原样存"（名字比实现大）。认不出的格式一律走静图那一支，不冒充动图。
_ANIMATED_KINDS = {
    "GIF": ("image/gif", "gif"),
    "PNG": ("image/apng", "png"),   # APNG 只有 Pillow 认得出它是动画时才落到这一档
    "WEBP": ("image/webp", "webp"),
}


def _flatten(im):
    """带透明通道的那张先垫到白底上，再交 JPEG（JPEG 没有 alpha）。

    Pillow 的 `convert("RGB")` 是**直接丢掉 alpha、不做合成**：透明区显示成原图里存着的那层 RGB。
    本机实测同一张 600×400（透明处底层分别是黑／白），压完四角读回 `(1,1,1)` 与 `(241,241,241)`
    ——同一族图出来是黑块还是白块，全看原作者 PNG 里那层没人看的像素。
    配图落在白底卡上（`--bg-card`），所以垫白：技术博客那种透明 logo／公式图不会糊成一团黑。
    """
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        base = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base.convert("RGB")
    return im.convert("RGB")


def _encode(im, long_edge: int, fmt: str, original: bytes) -> Compressed:
    """压到客户端那把尺子：长边 ≤1920、预算 ≤500KB、三档质量梯度，都超就交最后一档。

    动图（`sz_mmbiz_gif` 那一系）**原样存、不压**——压掉就成静帧。
    ⚠ 这一条是我定的，站长没拍过（他只说「压缩图片」，没说要不要连动图一起压）。
    字节用的是下载那份原文：`load()` 之后 `im.fp` 已经被读过，从它再读一次是空的。
    """
    if getattr(im, "is_animated", False):
        kind = _ANIMATED_KINDS.get(fmt)
        if kind is not None:
            mime, ext = kind
            # `over_budget` 在客户端那把尺子里是**纯字节比较**（`bytes > BUDGET_BYTES`，不问格式），
            # 动图这一支也必须照同一个式子报：10-19 本机端到端实测，真文章里一张 1078×233 的动图
            # 原样存就是 1,018,668 B，硬写 False 等于让账上出现"两倍预算却记成没超"。
            return Compressed(original, mime, ext, im.width, im.height,
                              len(original) > BUDGET_BYTES)

    scale = min(1.0, MAX_LONG_EDGE / long_edge)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    # 先缩再垫白：带 alpha 那一趟按 RGBA 重采样才不吃边缘（先合成再缩等于把白底算进插值里两次）。
    rgb = im.resize(size, Image.LANCZOS) if scale < 1.0 else im
    rgb = _flatten(rgb)

    last = b""
    for q in QUALITY_LADDER:
        buf = io.BytesIO()
        rgb.save(buf, "JPEG", quality=int(q * 100), optimize=True)
        last = buf.getvalue()
        if len(last) <= BUDGET_BYTES:
            return Compressed(last, "image/jpeg", "jpg", size[0], size[1], False)
    # 三档都超预算：按客户端同一套语义**照样存**（`compressForBackup` 里那句"宁可大一点也不丢图"），
    # 只把 overBudget 记下来。静默丢一张才是看得见的丢失。
    return Compressed(last, "image/jpeg", "jpg", size[0], size[1], True)


async def _upload(client: httpx.AsyncClient, cloud_path: str, data: bytes) -> str:
    """字节穿一层云函数进桶，换回一个 `cloud://` fileID。

    为什么必须有这一层：`assets.object_key` 存的是云开发 fileID，而服务端**没有**直写云开发存储的
    凭据（服务器 `.env` 现读：键名只有 WECHAT_*/JWT_*/ADMIN_*/HUNYUAN_CF_*/DATABASE_URL/REDIS_URL/
    CORS_ORIGINS/SHARE_QR_ENV_VERSION，没有存储密钥；`HUNYUAN_CF_*` 那两枚的形状是"网关打一个云函数"）。
    函数跑在环境里，天然写得进同一个桶——所以图要进同一个桶就得穿这一层。
    """
    if len(data) > MAX_UPLOAD_BYTES:
        raise SkipImage(f"这一张 {len(data):,} B 过不了网关那一趟")
    payload = {
        "cloud_path": cloud_path,
        "data": base64.b64encode(data).decode("ascii"),
    }
    resp = await client.post(
        settings.IMAGE_STORE_CF_URL.strip(),
        json=payload,
        headers={"Authorization": f"Bearer {settings.IMAGE_STORE_CF_KEY.strip()}"},
        # 单独给这一趟的超时：连接池那个 20 秒是按"下载一张 CDN 图"定的，而这里是**往自家
        # 函数推 1MB 级字节**，两件事该分开调。`IMAGE_STORE_CF_TIMEOUT` 必须真被读一次——
        # 配了一行却没人读的开关比没有这行更坏（下次它会静默变成"说不通的那半"）。
        timeout=settings.IMAGE_STORE_CF_TIMEOUT,
    )
    if resp.status_code >= 400:
        raise SkipImage(f"存图函数回 HTTP {resp.status_code}：{resp.text[:120]!r}")
    try:
        body = resp.json()
    except (ValueError, TypeError) as exc:
        raise SkipImage(f"存图函数回的不是 JSON：{resp.text[:120]!r}") from exc
    if not isinstance(body, dict):
        raise SkipImage(f"存图函数回的是 {type(body).__name__}")
    if body.get("error"):
        raise SkipImage(f"存图函数报错：{str(body['error'])[:160]}")
    file_id = str(body.get("fileID") or "")
    if not file_id.startswith("cloud://") or len(file_id) <= len("cloud://"):
        raise SkipImage(f"没拿到像样的 fileID：{file_id[:80]!r}")
    return file_id


async def archive(images: list[str], user_id, limit: int, on_ready=None) -> ArchiveResult:
    """按文档顺序取前 `limit` 张，逐张下载→压→进桶。任何一张失败都不抛。

    `on_ready(Prepared)`：这一张**已经进了桶**就当场回调一次。存图那一趟是给 `_archive_images`
    拿来登记 `assets` 行的，回调而不是"整批回来再登记"是因为顺序：对象已经占住真空间，
    台账却排在九张之后一次性写 ⇒ 崩在第五张时前四张成了**桶里没人认的孤儿**（不进配额、
    也没人删——对象只能客户端删）。落账紧跟写桶那一步，孤儿窗口就缩到"这一张传成、那一行没写"。
    """
    want = [u for u in (images or []) if u][:limit]
    result = ArchiveResult(kept=[], failed=[], total=len([u for u in (images or []) if u]))
    if not want or not channel_ready():
        return result
    # 一次抓取共用一个连接池：九张图各开一条 TLS 连接没必要，但**不许跨任务复用**（超时与关闭
    # 归这一段管，`async with` 出去就断干净）。
    async with httpx.AsyncClient(
        timeout=DOWNLOAD_TIMEOUT, headers=IMAGE_HEADERS, follow_redirects=False
    ) as client:
        for url in want:
            prepared = None
            try:
                data = await _download(client, url)
                im, long_edge = _inspect(data)
                shot = _encode(im, long_edge, (im.format or "").upper(), data)
                file_id = await _upload(client, _cloud_path(user_id, shot.ext), shot.data)
                prepared = Prepared(
                    file_id=file_id, mime=shot.mime, size=len(shot.data),
                    width=shot.width, height=shot.height,
                    over_budget=shot.over_budget, source_url=url,
                )
                result.kept.append(prepared)
            except SkipImage as exc:
                logger.info("贴图这一张没存上（不影响笔记）：%s url=%s", exc, url[:120])
                result.failed.append(url)
            except Exception as exc:
                logger.warning("贴图这一张出了没预期的错：%s: %s url=%s",
                               type(exc).__name__, exc, url[:120])
                result.failed.append(url)
            # 落账写在 try **外面**：登记那一趟要是炸了（数据库、会话、约束都行），不许被上面那两个
            # except 吞成"这一张没存上"——对象已经在桶里了，账没写就是孤儿，而且后面每一张都会同样炸，
            # 继续传只会把孤儿堆到九张。往外抛，由 `_archive_images` 那层记一条并停在这一篇。
            if prepared is not None and on_ready is not None:
                on_ready(prepared)
    return result


def register(db, note, kept: list) -> int:
    """把已经进了桶的那几张落成 `assets` 行（当场带 `note_id`，不必再走客户端那个 bind 口）。

    为什么不复用 `routes/assets.py` 的 `_clean_file_id`／`_assert_ours`：那两条防的是
    **客户端送上来的地址**（格式脏、或把别人的对象登记成自己的再来删）。这里的地址是自家云函数
    这一刻写进桶才存在的那一个，`cloud://` 那一关在 `_upload` 里已经过了（过不去这张直接算没存上），
    而笔记也是这一刻新建的，不存在"这行已经在别人账上"的存量。
    """
    from app.models.asset import Asset

    written = 0
    for shot in kept:
        if db.query(Asset).filter(Asset.object_key == shot.file_id).first():
            # 幂等：同一个 job 被 RQ 重跑一次不该多堆一行（多出来的行看不见，却占全站配额）。
            continue
        db.add(Asset(
            user_id=str(note.user_id),
            note_id=note.id,
            object_key=shot.file_id,
            file_type=shot.mime,
            file_size=shot.size,
            width=shot.width,
            height=shot.height,
            backup_status="uploaded",
        ))
        written += 1
    db.commit()
    if written:
        db.refresh(note)
    return written
