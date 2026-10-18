"""后台那一页背后的十二个口：登录、看状态、上传、改图片生效位、改文案生效位、读默认笔记那一篇、
改默认笔记那一篇、验票、看数、列卡片模板、改卡片模板（元数据与上下架，**改不了配方**）、
吐预览引擎（把客户端那份绘制代码当数据交给那一页的浏览器，**这里一笔都不画**）。

路径都写在这一份文件里（`/api/admin/*`），所以 `app/main.py` 挂载时不给 prefix——
与 `assets`/`cards`/`profiles`/`landing` 同一族做法。理由在这条链上更硬一层：
`/ops` 那一页在另一个模块里，两个模块合起来才是"后台"这一个东西，
路径写在一起（而不是靠 prefix 拼）才看得出全貌。

鉴权一律走 `app/core/admin_access.py` 那把独立的钥匙，**除了 `/api/admin/login` 本身，
还有 `/api/admin/verify-token`——它不吃管理 session，吃另一把只给同机兄弟服务用的换票暗号
（`X-Exchange`，见站长 10-15 拍的那句「以我们登录为主」：门在这边，票也从这边签）。**
口令没配的时候其余各口全回 503（不是 401）：401 会让人以为"口令打错了"，
而真实情况是"这台服务器还没开这一页"，两句话得靠不同状态码分开。

这一段上现网之后**线上那个包的行为一行都不变**：它读到多出来的 `tips` 键会跳过（那条闸门是
`utils/mpAssets.js` 里 `if (!entry || !entry.content_hash) continue` 那一句，10-15 拿 `02ef33b`
那份真代码喂新回体跑过 ⇒ 见 `验-Tips后台下发.js` 第 ⑦ 节；注意这**不是**"那个包不打这个口"——
nginx 日志里有 32 条真微信客户端在打，别拿前者当后者的证据）。
⚠ 10-15 补一句取证时弄反的事：**背景图那一栏不是惰性的**，现网那个包已经在读它
（同一份日志里非 devtools 的 `/api/mp/a/…` 下载 12 条），那一栏点「发布」当天就改真实用户的首页。
文案这一栏不一样：现网那个包里还没有 `serverTips` 这一段，所以它要到下一个出包（2.2.0 那批）
才真的影响屏上那行字。判它到底生没生效，看的是模拟器/真机读到的是下发那份还是包里那六句
（`验-Tips现网收到-真跑.js`），不是看后台点没点过"发布"。
"""
import logging

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.admin_access import (
    check_exchange,
    check_login,
    create_session_token,
    enabled,
    exchange_enabled,
    get_admin,
    verify_ticket,
)
from app.core.config import settings
from app.core.errors import UserError
from app.core.rate_limit import get_ip_key, limiter
from app.db.database import get_db
from app.services import admin_stats, admin_templates, mp_assets, poster_engine, preset_note

logger = logging.getLogger(__name__)

router = APIRouter()

# 上传口挂在管理凭证后面，所以这里的限流防的是"登录态被拿着之后手滑"，不是防爆破。
# 真正要限的是 login：那是这一条链上唯一一个匿名可反复试的判据。
# ⚠ 这句原来写的是"5/分钟按 IP 分桶"——那是半句假话：全局那把 `key_func` 是 `get_user_key`，
# 请求只要带着一把签名有效的票（`verify_exp=False`，过期的也算）就换成按 `user:<sub>` 计。
# 现在这一枚口上显式挂 `get_ip_key`，"按 IP"才真成立（uvicorn 带 --proxy-headers、
# nginx 传 X-Forwarded-For 已实测，见 shares.py 里那段）。


class LoginIn(BaseModel):
    # 长度上限只是个防"把整个文件粘进来"的护栏，不是安全判据——口令对不对由 compare_digest 说。
    token: str = Field(min_length=1, max_length=200)


class PublishIn(BaseModel):
    """`asset_id` 给数字是"发这一张"，给 null 是"停用，回到包里那张"。

    一个口两种写法（而不是 `/publish` + `/deactivate` 两个口）的理由在锚点 A1：
    这两句在数据层本来就是同一栏的两种取值，分成两个口就会有两个"怎么写这一栏"的实现。
    """
    asset_id: int | None = None


class TextIn(BaseModel):
    """`value` 给 `{"zh": […], "en": […]}` 是"发这一份"，给 null 是"停用，回到包里那六句"。

    这里**不声明句子形状**（不收 `list[str]`、不定 min_length）：形状与上限的唯一出处是
    `services/mp_assets.clean_text`，路由再写一道就成了第二份真相，改上限那天必然有一处忘。
    """
    value: dict | None = None


@router.post("/api/admin/login")
@limiter.limit("5/minute", key_func=get_ip_key)
def admin_login(request: Request, body: LoginIn):
    """换成一把短命管理 session。成功只回 token，失败回一句不含任何线索的话。

    日志里绝不出现提交的值：打错口令的人通常是正在试的那个人，而这一行日志
    会进 journald——那是没有按用户隔离、也不会随任何东西删掉的地方（同 `main.py` 里
    校验失败只记定位不记 input 那条）。
    """
    if not enabled():
        raise HTTPException(status_code=503, detail="后台未开放：服务器还没配置管理口令")
    if not check_login(body.token):
        logger.warning("管理口令不对 remote=%s", request.client.host if request.client else "?")
        raise HTTPException(status_code=401, detail="管理口令不对")
    logger.info("后台登录 remote=%s", request.client.host if request.client else "?")
    return {
        "session": create_session_token(),
        "expires_in": settings.ADMIN_SESSION_MINUTES * 60,
    }


@router.get("/api/admin/mp/state")
@limiter.limit("60/minute")
def admin_mp_state(request: Request, db: Session = Depends(get_db), _admin: str = Depends(get_admin)):
    """那一页要显示的全部事实：每一栏的生效位、是否被冻结、历史（含一键回滚要挑的那几张）。

    `note` 那一格是 10-18 加的（默认笔记归后台管）。它不在 `mp_assets.admin_state` 里是故意的：
    `services/mp_assets.py` 与 `services/preset_note.py` 目前是单向依赖（后者用前者的 `setting_row`），
    要前者回头读后者就成一个 import 环。合流放在这一道口上，一处一次。
    """
    state = mp_assets.admin_state(db)
    state["note"] = preset_note.admin_seed_state(db)
    return state


@router.post("/api/admin/mp/assets")
@limiter.limit("20/minute")
async def admin_mp_upload(
    request: Request,
    kind: str = Form(...),
    file: UploadFile = File(...),
    note: str | None = Form(None),
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """存一张到盘上并记一行账。**不动生效位**——上传和发布是两步，
    中间那一格留给操作者看预览（方案 §五.3 那条"换图会把头部几行字的对比度带偏"要的就是这个停顿）。
    """
    # 读到这里就停：不然一张 500MB 的图会整份进内存（Starlette 会把超出 1MB 的部分先落到临时文件，
    # 但 `read()` 不带界就是全读进来）。判上限的句子只有一份，在 `services/mp_assets.over_bytes_hint`。
    data = await file.read(mp_assets.MAX_BYTES + 1)
    if len(data) > mp_assets.MAX_BYTES:
        # 原始文件名一个字都不提：它可能带路径分隔符，也可能是别人的文件名。
        raise HTTPException(status_code=400, detail=mp_assets.over_bytes_hint())
    try:
        asset = mp_assets.upload(db, kind, data, note)
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return mp_assets.describe(asset)


@router.put("/api/admin/mp/settings/{kind}")
@limiter.limit("30/minute")
def admin_mp_setting(
    kind: str,
    body: PublishIn,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    try:
        if body.asset_id is None:
            mp_assets.unpublish(db, kind)
            return {"kind": kind, "current": None}
        asset = mp_assets.publish(db, kind, body.asset_id)
        return {"kind": kind, "current": mp_assets.describe(asset)}
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/api/admin/mp/texts/{kind}")
@limiter.limit("30/minute")
def admin_mp_text(
    kind: str,
    body: TextIn,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """文案那一栏的生效位，与上面那个图片口**同一路子**：一个口两种写法。

    `value` 给对象是"发这一份"，给 null 是"停用，回到包里那六句"。
    校验全在 `services/mp_assets.clean_text`（句子形状、两份语言、上限），这里只做整份退回：
    不合格就 400，**不收半份**——文案是一轮播报的序列，收半份界面上读出的是"少一句且不知道少哪句"。
    """
    try:
        if body.value is None:
            mp_assets.clear_text(db, kind)
            return {"kind": kind, "current": None}
        value = mp_assets.set_text(db, kind, body.value)
        return {"kind": kind, "current": value}
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


class PresetNoteIn(BaseModel):
    """`value` 给那五个字段是"发这一份"，给 null 是"停用，回到包里那份 JSON"。

    与上面 `TextIn` 同一条纪律：形状与上限的唯一出处是 `services/preset_note.clean_seed`，
    路由再写一道就成了第二份真相，改上限那天必然有一处忘。
    """
    value: dict | None = None


@router.get("/api/admin/preset-note")
@limiter.limit("60/minute")
def admin_preset_note_read(
    request: Request, db: Session = Depends(get_db), _admin: str = Depends(get_admin)
):
    """当前生效的那一份，加三样后台要说清的事实：来源（库里／包里）、包里那份、三把尺。"""
    return preset_note.admin_seed_state(db)


@router.put("/api/admin/preset-note")
@limiter.limit("20/minute")
def admin_preset_note_write(
    body: PresetNoteIn,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """改「帮助文档」那一篇长什么样。站长 10-18 两句：「日后更新不需要发版」＋「后台更新后，要新旧用户全量刷新」。

    **发布即刷存量**（10-18 那一改把 10-15 立的"只往前不回头"推翻了一半）：写完生效值之后，
    `preset_note.resync_all` 会把库里所有 `source_type='preset'` 的行按新那份重写一遍（五栏全覆盖，
    他选的那条），并顺手关掉这一类名下还开着的分享码。回体里 `resync` 那两枚数就是这次刷了几篇、关了几张。
    **刷新绑在写入上（`save_seed`／`clear_seed` 各调一次），不绑在这个路由上**——多开一个写入口也不会漏刷。
    唯一不动的是"名下已经没有这一篇的人"：他这一句选的是「删了就没了」，所以只改还留着的那几行，
    补种那一路只归建号那一刻管。

    这一条链从来在服务器上，所以"要不要发版"分两档说：小程序**本来就不发版**（包里没这份文案），
    改文件那一档要一次后端部署，改后台这一档连部署也不用。
    """
    try:
        resync = (preset_note.clear_seed(db) if body.value is None
                  else preset_note.save_seed(db, body.value))
        state = preset_note.admin_seed_state(db)
        state["resync"] = resync
        return state
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


class VerifyIn(BaseModel):
    token: str = Field(min_length=1, max_length=4096)


@router.post("/api/admin/verify-token")
@limiter.limit("30/minute")
def admin_verify_token(
    request: Request,
    body: VerifyIn,
    x_exchange: str | None = Header(default=None, alias="X-Exchange"),
):
    """给同机的兄弟服务验一枚管理票真伪（融合后台那条换票链的锚）。

    **它不吃管理 session，吃另一把暗号**：调它的必须是知道 `ADMIN_EXCHANGE_SECRET` 的服务，
    不是浏览器。为什么不在这里挂 `get_admin`——挂了就变成"要开这先得有这"，
    换票口自己把自己锁在外面；为什么不共享 `JWT_SECRET_KEY` 给对方——两把签名钥匙合并之后，
    任何一边泄了就是两边同时开门，而这一口只回答"这枚票真不真"，对方拿不到签名权。

    暗号没配 → 503（同 `ADMIN_TOKEN` 那条纪律：没配是"这个功能不可用"，不是"门槛消失"）。
    暗号不对 → 401，**不回"差在哪"**，也不记票值：这一行的对端是本机另一个进程，
    它出错时该看到的是"我这把暗号没配对"，而不是别人那枚票的片段。
    """
    if not exchange_enabled():
        raise HTTPException(status_code=503, detail="换票未开放：服务器还没配置换票暗号")
    if not check_exchange(x_exchange or ""):
        logger.warning("换票暗号不对 remote=%s", request.client.host if request.client else "?")
        raise HTTPException(status_code=401, detail="换票暗号不对")
    return verify_ticket(body.token)


@router.get("/api/admin/stats/overview")
@limiter.limit("60/minute")
def admin_stats_overview(
    request: Request,
    days: int = 14,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """「数据」那一栏的全部数，只读、零新列、零迁移（算法与口径都在 `services/admin_stats.py`）。

    回体里那三个字段是给页面上那句话用的：`tz`（日期按 UTC 分桶）、`window_days`（统计窗口）、
    `totals.preset_notes_excluded`（有多少篇是预置那篇、已从"新增"里扣掉）。
    **少了这三个，屏上每个数都会变成"不知道在说哪一段时间、哪个时区、扣没扣预置"**——
    那正是这一栏最容易被当成读数卖的地方。
    """
    return admin_stats.overview(db, days=days)


class TemplateIn(BaseModel):
    """卡片模板那一栏的写体。**没有 `recipe`、没有 `group_key`**——
    字段不在这里声明，Pydantic 就在门口把它丢了，所以"改配方"这件事在这一栏里没有落点。
    """
    label: str | None = None
    label_en: str | None = None
    sort_order: int | None = None
    min_app_version: str | None = None
    status: str | None = None


@router.get("/api/admin/poster/templates")
@limiter.limit("60/minute")
def admin_template_list(request: Request, db: Session = Depends(get_db), _admin: str = Depends(get_admin)):
    """十套（以及往后的 draft／archived）一次列全，含"这套在被用还是只被试过"那两个数。"""
    rows = admin_templates.list_rows(db)
    return {"rows": rows, "counts": admin_templates.status_counts(rows)}


@router.put("/api/admin/poster/templates/{row_id}")
@limiter.limit("30/minute")
def admin_template_update(
    row_id: int,
    body: TemplateIn,
    request: Request,
    db: Session = Depends(get_db),
    _admin: str = Depends(get_admin),
):
    """改元数据或上下架。给 `null` 的字段＝这次不改它；**任何一项不合格，一条都不写**。

    上架撞车（同一个 `template_id` 已经有一版在线上）回 400 并说明先把哪一版下架，
    **不自动归档那一版**：归档等于替他决定"旧的那版不再下发了"。
    """
    try:
        row = admin_templates.update(db, row_id, **body.model_dump())
        return admin_templates.describe(db, row)
    except UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/admin/poster/engine")
@limiter.limit("60/minute")
def admin_poster_engine(
    request: Request,
    if_none_match: str | None = Header(default=None),
    _admin: str = Depends(get_admin),
):
    """「卡片模板」那一栏的预览引擎：小程序那份绘制代码的只读副本，一口吐一整包。

    画不在这里画。这一口只把 `miniprogram/utils/poster.js` 那一族的**源码当数据**交给后台
    那一页的浏览器（回体是 JSON，不是可执行脚本——省掉页面里一次 `eval`），
    由它自己的 canvas 现画。所以"服务端没有 canvas"那条前提一个字没改。

    · 预览与配方同源，**不会过期**——不像"上传一张缩略图"那样，改了配方图还是旧的；
    · 名单与 md5 由 `services/poster_engine.py` 现校验，对不上就 503。宁可屏上说
      "预览引擎没加载成"，也不许出现一张看着像的假图；
    · 要管理票才给：这几只文件本来就在小程序包里，不算秘密，但也没有理由对全网吐源码；
    · ETag 用整包 md5：内容没变回 304，一次进这一栏只占一个读口额度（九只文件合成一口）。
    """
    if not poster_engine.ready():
        raise HTTPException(status_code=503, detail="预览引擎没随包部署，这一栏的预览画不出来")
    try:
        body, etag = poster_engine.bundle()
    except ValueError as e:
        # 这一支是我们自己写的那句话（哪一只文件与名单对不上），给操作者看正合适，不含路径。
        raise HTTPException(status_code=503, detail=f"预览引擎校验没过：{e}")
    except OSError as e:
        # `open()` 打不开时异常原文带**绝对路径**（`[Errno 13] … '/home/ubuntu/wtsj-backend/…'`），
        # 而这一口的回体会被那一页原样显示出来。路径留在日志里给人查，屏上只说读不出来。
        logger.warning("预览引擎读不出来 err=%s", e)
        raise HTTPException(status_code=503, detail="预览引擎读不出来，这一栏的预览画不出来")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304, headers={"ETag": f'"{etag}"'})
    return Response(
        content=body,
        media_type="application/json",
        headers={"ETag": f'"{etag}"', "Cache-Control": "private, must-revalidate"},
    )

