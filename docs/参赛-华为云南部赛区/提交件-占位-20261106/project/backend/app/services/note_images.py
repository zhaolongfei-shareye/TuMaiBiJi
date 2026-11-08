"""外链贴图随笔记存档：正文里的图 → 下载 → 压到客户端那把尺子 → 进云开发那个桶 → 回 fileID。

正本 `docs/方案-公众号贴图随笔记存档.md`（站长 10-18 夜拍的五句＋「加一条：支持来源」）。
四条形状不许下一个人改错：

1. **只存，不提炼。** 这些字节不进摘要／要点／标签那一步（第 1 句「图片不需要提炼」），
   所以那一部分发生在笔记已经建好、提炼已经出来**之后**。
   ⚠ 10-21 起这一句**不再涵盖内容安全**：站长「任何图文都要」⇒ 每一张在进桶之前会被自家 OCR 读一遍字，
   读出来的字送 `msgSecCheck`，判违规的那一张**不进桶**（见 `_guard_image_text`）。读字只为拦图，
   认出来的字**一个都不入库、不进提炼**，所以"图片不需要提炼"那句承诺仍然原样成立。
   ⚠ 10-22 起这一张还过**第二道**：画面本身送 `imgSecCheck`（`_guard_image_pixels`）。
   加这一道的直接原因是站长那一句「我导入敏感照片，没有任何提示」——只有文字那道时，
   一张没有字的违规图连送检都送不到。两道都在进桶之前，都不改"不提炼"那一句。
2. **通道与用户自己上传那一路完全同一个。** 对象进云开发那个桶、落在 `images/{userId}/{YYYYMMDD}/`
   那一层（与 `miniprogram/utils/cloudUpload.js` 同一条路径规则），账记进 `assets` 表，
   于是配额／私密闸／公开页露图／列表那排缩略图一行代码都不用为新功能重写。
3. **默认不带 Referer，只有抓取那一层点名要的那一批才带。** 两族防盗链的失败形状**相反**：
   `mmbiz.qpic.cn` 带错 Referer 回的是 **200 ＋ 2,090 B 那张 140×140 的占位 jpeg**（状态码抓不到），
   `sns-webpic-qc.xhscdn.com` 带错 Referer 回的是**硬 403**。10-19 02:1x 又各打三次复现过这两读数。
   所以既不能带任何一个 Referer，也不能只写"非 200 就跳过"。
   ⚠ 10-31 加了一个**按批**的例外（不是全局开关）：微博那张图床 `wx*.sinaimg.cn` 卡的其实不是 Referer，
   是**任何 User-Agent**——现网出口逐档量过（生产那套头＝桌面 UA＋`Accept: image/*`）：
   只带 UA 不带 Referer → **403／238 B**；带 UA ＋ `Referer: https://m.weibo.cn/` 或 `https://weibo.com/`
   → **200**（`orj360` 22,521 B／`mw2000` 1,248,453 B／`large` 2,853,517 B，同一条地址三档全回 200）；
   带 UA ＋ 随便一枚外站 Referer（`https://example.com/`）→ 仍是 **403／304 B**。
   ⇒ 这一族的正确形状是"来路必须是微博"，而那枚来路只有**抓取那一层**知道自己落在哪一站，
   所以出口是 `archive(..., referer=…)` 这一个参数，由抓取回体里的 `image_referer` 传下来：
   微博那一批传 `https://m.weibo.cn/`，**其余各族一律传空串＝一个字的 Referer 都不加**，
   与这一条老读数逐字相同（判据在 `test_note_images.py` 里钉着"默认那一批不许带上 Referer"）。
   ⚠ 10-31 还有**第二枚按批点名的例外**：`archive(..., user_agent=…)`，现只有搜狐一族用。
   它那台图床 `q*.itc.cn` 顶的正是**我们这枚 Windows 桌面 UA**——现网出口把三篇文章的九张逐张打过：
   带生产那套头 **6 张 403／3 张 200**，把 UA 换成 `scraper._SOHU_IMAGE_UA`（Mac 桌面）或干脆一枚头都不带
   → **九张全 200**；而**带 Referer（本站、整篇地址）救不回来**，所以给这一族点名的不是来路、是 UA。
   同一枚纪律：空串＝那一项照 `IMAGE_HEADERS` 一字不改，**不许做成全局开关**
   （判据钉着"默认那一批不许换 UA"）。
4. **一张的失败不许变成整篇的失败。** 下不动／压不了／传不上去 ⇒ 那一张记进 `failed`，
   笔记照建、摘要照出，与现网"B 链任何一次失败都不该让笔记没存下来"同口径。
   但失败也不许静默：那一个数要交回任务回体，由界面上那句话说出来。
"""
import asyncio
import base64
import io
import logging
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from PIL import Image

from app.core.config import settings
from app.services import scraper
from app.services.llm import key_usable
from app.services.ocr import ocr_image
from app.services.wechat import check_image, check_text

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
from app.models.asset import (
    MAX_ASSETS_PER_NOTE,
    MAX_FILE_BYTES,
    not_failed,
    order_by_note,
)
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


class Blocked(SkipImage):
    """这一张被内容安全挡下（图上的字判成违规或待人工复核）。

    它是 `SkipImage` 的子类：站长定的第四条口径是「一张的失败不许变成整篇的失败」，
    被拦下的那一张走的正是同一条形状（进 `failed`、笔记照在、屏上那句实话的数照加一）。
    单独立一个名字只为一件事：日志里"下不动"与"被判违规"必须分得开，否则以后没法归因。
    """


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


def _checked(resp) -> tuple:
    """存图函数那一趟的回体判据：HTTP／JSON／`error`／像样的 fileID 四道一次过，回 `(fileID, 整个回体)`。

    抽成一处不是为了好看：现在有两个口打同一个函数（base64 直写、环境内复制），回体形状一模一样
    （`{fileID, bytes}` 或 `{error}`）。判据抄两份迟早走样，走样时最坏的一种是"其中一个口把函数
    报的那句 `{error}` 当成成功"——那会往账上写一行指向不存在对象的行，而那一行只能客户端删。
    """
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
    return file_id, body


async def _upload(client: httpx.AsyncClient, cloud_path: str, data: bytes) -> tuple:
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
    return _checked(resp)


async def _guard_image_pixels(data: bytes, url: str) -> None:
    """**画面本身**送 imgSecCheck，判违规就不进桶（站长 10-22「为什么图片审查没有生效」）。

    与 `_guard_image_text` 是两道，不是一道拆两半：那一条读的是图上的字（要 OCR、要 openid、
    认不出字就跳过），这一条看的是画面（不要 openid、没有"没字就放过"那一格）。涉黄图往往
    一个字都没有，所以只有文字那道时它一路绿灯——今天就是这么被问出来的。

    检的是**压完那一份字节**（与 `_guard_image_text` 同一条理由：进桶、会出现在公开页上的是这一份）。
    策略照旧：检不了＝放行＋一行日志，只有 `risky` 才拦。
    """
    if not settings.SEC_CHECK_ENABLED:
        return
    verdict = await asyncio.to_thread(check_image, data)
    if verdict == "risky":
        raise Blocked("画面被判为违规（risky）")
    if verdict == "unavailable":
        logger.error("贴图内容安全（画面）这一张没检成，照旧放行（这不是「图没问题」）：url=%s", url[:120])


async def _guard_image_text(openid, data: bytes, url: str) -> None:
    """图上的字 → msgSecCheck。判违规就抛 `Blocked`，这一张不进桶。

    四条形状都照着已有的文字闸走，不另立一套：

    · **检不了不等于图有问题**：开关关着、拿不到 openid、OCR 自己抛了、微信那边没检成——
      这四种一律放行，最多留一行日志。把微信侧的抖动变成「这张图存不下」是现网最坏的误伤。
    · **认不出字就不送检**：msgSecCheck 按次计配额，一张纯风景图没有可检的东西。
    · 送的是**压完那一份字节**（长边 ≤1920／预算 ≤500KB）：认字的对象正是真要进桶、
      真要出现在公开页上的那一张，而不是下载下来的原件（原件可能比它大一倍）。
    · `check_text` 里那趟是同步 HTTP，不许在 `async def archive` 的事件循环里直接跑，裹进 `to_thread`。
    """
    if not settings.SEC_CHECK_ENABLED:
        return
    if not openid:
        logger.warning("贴图这一张没有可用的 openid，按没检成放行：url=%s", url[:120])
        return
    try:
        text = await ocr_image(data)
    except Exception as exc:
        # OCR 挂了（libGL、内存、模型）是基础设施问题，不该让一张好图被判死
        logger.warning("贴图这一张 OCR 没跑成，按没检成放行：%s: %s url=%s",
                       type(exc).__name__, exc, url[:120])
        return
    if not text.strip():
        return
    verdict = await asyncio.to_thread(check_text, openid, text)
    if verdict in ("risky", "review"):
        raise Blocked(f"图上的字被判为{'违规' if verdict == 'risky' else '需人工复核'}（{verdict}）")
    if verdict == "unavailable":
        logger.error("贴图内容安全这一张没检成，照旧放行（这不是「图没问题」）：url=%s", url[:120])


async def archive(images: list[str], user_id, limit: int, on_ready=None, openid=None,
                  referer: str = "", user_agent: str = "") -> ArchiveResult:
    """按文档顺序取前 `limit` 张，逐张下载→压→**读字送检**→进桶。任何一张失败都不抛。

    `referer`：**只有抓取那一层点名要的那一批才给**（现在只有微博——那张图床卡的是 UA，
    不带微博自己的来路就整批 403，读数写在文件头第 3 条）。空串＝一个字的 Referer 都不加，
    与其余各族今天的形状逐字相同。这不是全局开关，也不许变成全局开关。

    `user_agent`：同一套纪律的另一枚——**抓取那一层点名说"这一族要换 UA"才换**。
    现在只有搜狐：它那台图床顶的就是我们那枚 Windows 桌面 UA（现网出口九张里 6 张 403，
    换成点名那枚九张全 200，带来路救不回来）。空串＝照 `IMAGE_HEADERS` 那枚，一字不改。
    ⚠ 也不许变成全局开关，理由与 `referer` 同一批读数。

    `openid`：给内容安全用的那一个真人 openid（v2 的 `msgSecCheck` 必填，假串会被微信回 40003）。
    拿不到就整段按「没检成」放行——与文字那条同一个口径，但**必须留一行 WARNING**，
    否则"检了"与"根本没检"在日志里会长得一模一样。

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
    头 = dict(IMAGE_HEADERS)
    if referer:
        头["Referer"] = referer
    if user_agent:
        头["User-Agent"] = user_agent
    async with httpx.AsyncClient(
        timeout=DOWNLOAD_TIMEOUT, headers=头, follow_redirects=False
    ) as client:
        for url in want:
            prepared = None
            try:
                data = await _download(client, url)
                im, long_edge = _inspect(data)
                shot = _encode(im, long_edge, (im.format or "").upper(), data)
                await _guard_image_pixels(shot.data, url)
                await _guard_image_text(openid, shot.data, url)
                file_id, _body = await _upload(client, _cloud_path(user_id, shot.ext), shot.data)
                prepared = Prepared(
                    file_id=file_id, mime=shot.mime, size=len(shot.data),
                    width=shot.width, height=shot.height,
                    over_budget=shot.over_budget, source_url=url,
                )
                result.kept.append(prepared)
            except Blocked as exc:
                # 这一条必须在 `except SkipImage` **前面**：Blocked 是它的子类，反过来的话
                # 违规图会被记成「站点下不动」，日志里两种成因就再也分不开了。
                logger.warning("贴图这一张被内容安全挡下（笔记照在）：%s url=%s", exc, url[:120])
                result.failed.append(url)
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
    from app.models.asset import Asset, next_sort_order

    written = 0
    # 新登记的这几张一律追加在这一篇的**最后**（当前最大值 +1，一张一递增）。
    # 不赋这一列它会吃模型默认 0，而 0 是"从没手动排过"那一档——一篇已经排过序的笔记
    # 被外链转存补进来一张图，那张会冒到第一格把**头图换掉**，而他什么都没拖。
    # 这一路今天只给新建的笔记补图（撞不到），但"默认值刚好对"这种前提最脆，当场钉死。
    next_order = next_sort_order(db, note.id)
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
            sort_order=next_order,
        ))
        next_order += 1
        written += 1
    db.commit()
    if written:
        db.refresh(note)
    return written


# 复制那一路的文件尾巴：照**源那一张原本的格式**落，不重压、不改格式。
# 尾巴取自源那一行的 `object_key`（桶里那个对象真叫什么），拿不到才退回按 `file_type` 折算。
_SAFE_EXT = re.compile(r"^[a-z0-9]{1,8}$")
_MIME_EXT = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/apng": "png",
    "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp", "image/heic": "heic",
}


def _ext_of(row) -> str:
    """复制出来的那一张该落什么文件尾巴——**必须是安全的那一小撮字符**。

    这一条不只是格式问题：`cloud_path` 会进云函数那个 `badPath`（不许空白、不许 `..`、必须以
    `images/` 开头），而这里拼进去的尾巴来自**数据库里的一行**（客户端登记那张时，`file_type`
    是它报上来的）。不校验就等于把"路径里能写什么"交回给写那一行的人。
    收不进正则就退回 `jpg`：宁可尾巴不对，也不让它带着分隔符进桶的路径。
    """
    tail = str(row.object_key or "").rsplit(".", 1)[-1].lower()
    if _SAFE_EXT.match(tail):
        return tail
    return _MIME_EXT.get(str(row.file_type or "").lower(), "jpg")


def copy_for_import(db, note, from_note_id, limit: int = MAX_ASSETS_PER_NOTE) -> ArchiveResult:
    """把原篇那几张配图**逐张复制一份到转存者名下**（站长 10-24：「转存必须带图。乙，复制一份到自己名下」）。

    为什么不共用同一个 `object_key`（甲那条）：`routes/notes.py:delete_note` 删笔记时把这一列的
    `cloud://` 交回调用方去 `wx.cloud.deleteFile` —— 两个人挂同一个对象时，**谁先删笔记就把
    另一个人正在用的那张图一起删了**，而删的人屏上看不见自己干了什么。所以要各有一份。

    为什么复制必须在云函数里做完（而不是下载到服务端再传一次）：后端手里没有存储凭据，字节得穿
    网关两趟，而 base64 让每一趟都比真字节胖 4/3 —— 九张图就这么白走一趟公网。
    `copy_from` 那一型（`cloudfunctions/image_store/index.js`）在环境里 downloadFile＋uploadFile，
    一趟网关把事办完，只有新 fileID 回出来。

    两件**故意没做**的事：

    · **不重压、不改格式**：源那一张已经按客户端那把尺子压过（用户自己上传）或按本模块同一把尺子
      压过（外链转存），再压一次等于换一张图。
    · **不重新送内容安全**：这几张本来就在公开分享页上露着（`LIVE_PUBLIC_FIELDS` 那一路），
      复制不新增任何暴露；而 `imgSecCheck`／`msgSecCheck` 一天百来次的额度会被一次批量转存榨干。

    本模块头第 4 条在这一路同样成立：任何一张复制不动只进 `failed`，笔记照在、其余照落。
    落账紧跟写桶那一步（一张一次 `commit`），不许攒到九张之后一并写——对象已经占住真空间，
    账排在后面就等于崩在中途时前面那几张成了桶里没人认的孤儿（对象只能客户端删）。
    """
    from app.models.asset import Asset, next_sort_order

    src_rows = (db.query(Asset)
                .filter(Asset.note_id == from_note_id, not_failed())
                .order_by(*order_by_note())
                .all())
    if not src_rows:
        return ArchiveResult(kept=[], failed=[], total=0)
    if not channel_ready():
        # 计数全零、`failed` 也空：与 `archive()` 里"通道没配＝整条没开工"同一个记法，
        # 不许报成「源篇那几张全没跟过来」——那会把一个开关状态说成九次失败。
        logger.warning("转存配图这一趟没开工：存图通道没配（笔记已建，只是图没跟过来）")
        return ArchiveResult(kept=[], failed=[], total=0)

    want = src_rows[:limit]
    result = ArchiveResult(kept=[], failed=[], total=len(src_rows))

    next_order = next_sort_order(db, note.id)
    with httpx.Client(
        timeout=settings.IMAGE_STORE_CF_TIMEOUT,
        headers={"Authorization": f"Bearer {settings.IMAGE_STORE_CF_KEY.strip()}"},
    ) as client:
        for row in want:
            file_id = None
            body = None
            try:
                resp = client.post(
                    settings.IMAGE_STORE_CF_URL.strip(),
                    json={"copy_from": row.object_key,
                          "cloud_path": _cloud_path(note.user_id, _ext_of(row))},
                )
                file_id, body = _checked(resp)
            except SkipImage as exc:
                logger.info("转存配图这一张没跟过来（笔记照在）：%s src=%s", exc, row.object_key[:120])
                result.failed.append(row.object_key)
            except Exception as exc:
                logger.warning("转存配图这一张出了没预期的错：%s: %s src=%s",
                               type(exc).__name__, exc, row.object_key[:120])
                result.failed.append(row.object_key)
            if file_id is None:
                continue
            # 落账写在 try **外面**（与 `archive()` 同一个理由）：数据库那一趟炸了不许被上面那两个
            # except 吞成"这一张没跟过来"——对象已经进桶了，账没写就是孤儿，而且后面每一张都会同样炸。
            size = body.get("bytes")
            if not isinstance(size, int) or size <= 0:
                size = row.file_size
            elif row.file_size and size != int(row.file_size):
                # 函数报的字节与源那一行记的不一致：新那一行按**函数报的**落（配额加的是这一张真占的
                # 空间），差值留一行日志。今天唯一的成因是桶里那张被换过，值得留个响。
                logger.warning("转存配图这一张字节对不上（新行按函数报的落）：src=%s 行里=%s 函数=%s",
                               row.object_key[:120], row.file_size, size)
            db.add(Asset(
                user_id=str(note.user_id),
                note_id=note.id,
                object_key=file_id,
                file_type=row.file_type,
                file_size=size,
                width=row.width,
                height=row.height,
                backup_status="uploaded",
                sort_order=next_order,
            ))
            next_order += 1
            db.commit()
            result.kept.append(Prepared(
                file_id=file_id, mime=row.file_type, size=size,
                width=row.width, height=row.height,
                over_budget=bool(size) and size > BUDGET_BYTES,
                # 这一路没有"来源网址"这个东西：填**源那一张的 fileID**，让日志里能对回是哪一张。
                source_url=row.object_key,
            ))
    return result
