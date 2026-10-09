"""公开落地页 `/n/{token}`：把一份分享快照渲染成服务端 HTML。

为什么必须有这一层，而不是让扫码的人去调 `GET /api/shares/{token}` 拿 JSON：

1. 卡片上的码要能被**任何**相机扫开。小程序码只有微信解得开（那是 `getUnlimited` 出的
   一张带 `scene=token` 的图），而 iPhone 系统相机、安卓相机、微信"扫一扫"对外链的处理
   都只认普通 URL，所以码里编的必须是一个真网址。
2. 链接被发到 X / Facebook / LinkedIn 时，那些爬虫**不执行 JavaScript**，只读 HTML 里的
   `og:*`。纯前端拉 JSON 的页面对它们就是一根裸链接，没有标题也没有图，
   "发到海外平台"这条链路等于没做。
3. Universal Link 要求"链接的域名"与 App 里那条 Associated Domains 一致，
   所以这一页和 AASA 必须同域（`agentsbin.cn`），不能挂在 `api.agentsbin.cn` 上。

三条口径写死在这里，别在别处再判一次：

- **只画快照那六列 + 作者名**，正文、原图、`original_content`、任何管理凭证都不出现。
  快照字段集是 `services/sharing.py` 的 `SNAPSHOT_COLUMNS`，用例直接拿它当尺子——
  将来谁往公开页加一列，那列必须先进送检范围，否则这条用例会红。
- **不缓存**。`no-store` 同时挂在响应上，撤掉的码不许被 CDN／浏览器留在原地
  （PRD F09：撤销确认必须以缓存失效为前提，不能只改数据库状态）。
- **撤掉与不存在回同一句**。"这篇不存在"和"这篇被作者撤了"混在一起说，
  等于让任何人拿一串 token 探出"哪些曾经公开过"。
"""
from __future__ import annotations

import hashlib
import hmac
import html
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.models.share import Share
from app.models.share_report import ShareReport
from app.services.sharing import active_share_by_token

logger = logging.getLogger(__name__)

router = APIRouter()

# 这一页对外说自己是哪个站。域名与 App 的 Associated Domains 必须一致，改这里要同步改 AASA。
SITE_ORIGIN = "https://agentsbin.cn"
SITE_NAME = {"zh": "图麦笔记", "en": "Tumai Notes"}

# 两套界面语言共用一份键。文案刻意写"这页是什么"，不写"我们存了什么"——
# 后者是隐私政策的活，写在这只会长成一句没人看的废话。
TEXT = {
    "zh": {
        "by": "来自 {name} 的笔记",
        "by_anon": "一条分享的笔记",
        "tags": "标签",
        "points": "要点",
        "links": "相关链接",
        "source": "来源",
        "shared_on": "分享于 {date}",
        "snapshot": "这是作者当时生成的快照。他之后改的笔记不会同步到这一页，"
                    "他也可以随时撤掉——撤掉之后这个地址就打不开。",
        "no_app": "已经装了图麦笔记？用 iPhone 的系统相机扫那张卡片，会直接打开 App 的只读页。",
        "gone_title": "这篇看不了了",
        "gone_body": "链接无效，或者作者已经把它撤掉。",
        "switch": "English",
        "report": "举报这篇",
        "report_thanks": "已收到，我们会看。",
        # 刻意不写"会在核实前先把它撤下来"：一张举报并不具备隐藏能力（见
        # ShareReport.hidden 那条注释），这么写等于向举报人承诺一件我们不做的事。
        "back": "返回这篇笔记",
        "reason": "哪方面有问题",
        "detail": "补充说明（可以不填）",
        "submit": "提交",
    },
    "en": {
        "by": "A note shared by {name}",
        "by_anon": "A shared note",
        "tags": "Tags",
        "points": "Key points",
        "links": "Links",
        "source": "Source",
        "shared_on": "Shared on {date}",
        "snapshot": "This is the snapshot the author published at that moment. Later edits "
                    "to the note do not change this page, and the author can revoke it at any "
                    "time — once revoked, this address stops working.",
        "no_app": "Already have Tumai Notes? Scan the card with the iPhone camera and it opens "
                  "the app's read-only view directly.",
        "gone_title": "This note isn’t available",
        "gone_body": "The link is invalid, or the author has taken it down.",
        "switch": "中文",
        "report": "Report this note",
        "report_thanks": "Thanks — we’ve received it and will take a look.",
        "back": "Back to this note",
        "reason": "What’s wrong with it",
        "detail": "Anything else (optional)",
        "submit": "Submit",
    },
}

# 举报原因：固定四选一，界面上只给这四条。自由文本走 detail，且限长——
# 一个匿名可写的公开表单，字段不封顶就是一条灌库的路。
REPORT_REASONS = ("spam", "abuse", "infringement", "other")
REASON_LABEL = {
    "zh": {"spam": "垃圾广告", "abuse": "辱骂或有害内容", "infringement": "侵犯我的权利", "other": "其他"},
    "en": {"spam": "Spam", "abuse": "Abusive or harmful", "infringement": "Infringes my rights", "other": "Other"},
}
REASON_MAX = 32
DETAIL_MAX = 500


def _pick_lang(request: Request) -> str:
    """`?lang=` 优先，其次 Accept-Language 以 en 开头就走英文，其余一律中文。

    刻意不做"按语言排优先级"那套：这一页只有两种界面语言，猜错的成本是一句能看懂的话
    换成另一句能看懂的话，不值得为它引入解析库。
    """
    forced = (request.query_params.get("lang") or "").strip().lower()
    if forced in ("zh", "en"):
        return forced
    header = request.headers.get("accept-language", "")
    return "en" if header.lower().startswith("en") else "zh"


def _e(value) -> str:
    """所有进 HTML 的东西一律走这里。快照字段全是用户自己写的文本，漏一处就是存储型 XSS。"""
    return html.escape(str(value if value is not None else ""), quote=True)


def _list(value) -> list:
    """JSON 列可能是 None、也可能是被人塞了字符串进去的历史数据；公开页只认"字符串列表"。"""
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float)) and str(item).strip()]


def _date(share: Share, lang: str) -> str:
    created = share.created_at
    if created is None:
        return ""
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(timezone.utc).strftime("%Y-%m-%d" if lang == "zh" else "%b %d, %Y")


def _sections(share: Share, lang: str) -> str:
    t = TEXT[lang]
    out: list[str] = []

    summary = (share.summary or "").strip()
    if summary:
        out.append(f'<p class="summary">{_e(summary)}</p>')

    points = _list(share.key_points)
    if points:
        items = "".join(f"<li>{_e(p)}</li>" for p in points)
        out.append(f'<section><h2>{_e(t["points"])}</h2><ul>{items}</ul></section>')

    tags = _list(share.tags)
    if tags:
        chips = "".join(f'<span class="chip">{_e(tag)}</span>' for tag in tags)
        out.append(f'<section><h2>{_e(t["tags"])}</h2><p class="chips">{chips}</p></section>')

    # key_links 是客户端可写的自由列表：只把看起来是网址的那几条渲染成 <a>，
    # 其余一律当纯文本列出。不这么做，一条 javascript: 就能变成可点的东西。
    links = _list(share.key_links)
    safe = [u for u in links if u.lower().startswith(("https://", "http://"))]
    if safe:
        rows = "".join(f'<li><a href="{_e(u)}" rel="noopener noreferrer nofollow" '
                       f'target="_blank">{_e(u)}</a></li>' for u in safe)
        out.append(f'<section><h2>{_e(t["links"])}</h2><ul class="links">{rows}</ul></section>')

    if (share.source_url or "").lower().startswith(("https://", "http://")):
        out.append(f'<section><h2>{_e(t["source"])}</h2>'
                   f'<p><a href="{_e(share.source_url)}" rel="noopener noreferrer nofollow" '
                   f'target="_blank">{_e(share.source_url)}</a></p></section>')

    return "".join(out)


def _page(share: Share, lang: str) -> str:
    t = TEXT[lang]
    title = (share.title or "").strip() or t["by_anon"]
    author = (share.author_name or "").strip()
    by = t["by"].format(name=author) if author else t["by_anon"]
    desc = (share.summary or "").strip() or "; ".join(_list(share.key_points)[:2]) or title
    url = f"{SITE_ORIGIN}/n/{share.token}"
    other = "en" if lang == "zh" else "zh"
    when = _date(share, lang)
    # og:image 这一版**故意不给**：服务器上没有核过中文字体，现画的卡图很可能是一堆豆腐块，
    # 而一张错的图比没有图更糟（信息流里会一直挂着它）。补法见 ios 侧那两份账里的记录。
    return f"""<!doctype html>
<html lang="{'zh-CN' if lang == 'zh' else 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(title)}</title>
<meta name="description" content="{_e(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="{_e(title)}">
<meta property="og:description" content="{_e(desc)}">
<meta property="og:url" content="{_e(url)}">
<meta property="og:site_name" content="{_e(SITE_NAME[lang])}">
<meta property="og:locale" content="{'zh_CN' if lang == 'zh' else 'en_US'}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{_e(title)}">
<meta name="twitter:description" content="{_e(desc)}">
<link rel="canonical" href="{_e(url)}">
<style>
:root {{ color-scheme: light dark }}
body {{ margin: 0; padding: 28px 20px 56px; font: 16px/1.65 -apple-system, "PingFang SC",
       "Helvetica Neue", system-ui, sans-serif; max-width: 640px; }}
.by {{ margin: 0 0 4px; font-size: 13px; opacity: .62 }}
h1 {{ margin: 0 0 14px; font-size: 26px; line-height: 1.35 }}
.summary {{ margin: 0 0 22px; font-size: 16px }}
h2 {{ margin: 26px 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .04em; opacity: .6 }}
ul {{ margin: 0; padding-left: 20px }}
.links a {{ overflow-wrap: anywhere }}
.chips {{ margin: 0 }}
.chip {{ display: inline-block; margin: 0 6px 6px 0; padding: 3px 10px; font-size: 13px;
        border-radius: 999px; background: rgba(128,128,128,.16) }}
.note {{ margin-top: 30px; padding-top: 16px; border-top: 1px solid rgba(128,128,128,.28);
        font-size: 13px; line-height: 1.6; opacity: .66 }}
.foot {{ margin-top: 14px; font-size: 13px }}
.foot a {{ margin-right: 14px }}
</style>
</head>
<body>
<p class="by">{_e(by)} · {_e(t['shared_on'].format(date=when))}</p>
<h1>{_e(title)}</h1>
{_sections(share, lang)}
<p class="note">{_e(t['snapshot'])}</p>
<p class="note">{_e(t['no_app'])}</p>
<p class="foot"><a href="/n/{_e(share.token)}/report">{_e(t['report'])}</a>
<a href="/n/{_e(share.token)}?lang={other}">{_e(t['switch'])}</a></p>
</body>
</html>"""


def _gone(lang: str) -> str:
    t = TEXT[lang]
    other = "en" if lang == "zh" else "zh"
    return f"""<!doctype html>
<html lang="{'zh-CN' if lang == 'zh' else 'en'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{_e(t['gone_title'])}</title>
<style>body {{ margin: 0; padding: 64px 24px; font: 16px/1.7 -apple-system, "PingFang SC",
       system-ui, sans-serif; max-width: 520px }}
h1 {{ font-size: 21px; margin: 0 0 10px }} p {{ margin: 0; opacity: .72 }}
p + p {{ margin-top: 14px }}</style></head>
<body><h1>{_e(t['gone_title'])}</h1><p>{_e(t['gone_body'])}</p>
<p><a href="?lang={other}">{_e(t['switch'])}</a></p></body></html>"""


_NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


@router.get("/n/{token}", response_class=HTMLResponse)
def landing(token: str, request: Request, db: Session = Depends(get_db)):
    lang = _pick_lang(request)
    # 撤掉的、过期的、从来不存在——三种都由 active_share_by_token 归成同一个 None。
    # 判过期不许在这一页再写一遍：那个函数是"这张码此刻还开着吗"的唯一出处（见它自己的注释）。
    share = active_share_by_token(db, token)
    if share is None:
        return HTMLResponse(_gone(lang), status_code=404, headers=_NO_STORE)
    return HTMLResponse(_page(share, lang), headers=_NO_STORE)


@router.get("/n/{token}/report", response_class=HTMLResponse)
def report_form(token: str, request: Request, db: Session = Depends(get_db)):
    """举报页。先 GET 一发确认 token 还活着，免得给一个已经不存在的快照挂一张能提交的表单。"""
    lang = _pick_lang(request)
    t = TEXT[lang]
    share = active_share_by_token(db, token)
    if share is None:
        return HTMLResponse(_gone(lang), status_code=404, headers=_NO_STORE)
    labels = REASON_LABEL[lang]
    options = "".join(f'<option value="{r}">{_e(labels[r])}</option>' for r in REPORT_REASONS)
    other = "en" if lang == "zh" else "zh"
    return HTMLResponse(f"""<!doctype html>
<html lang="{'zh-CN' if lang == 'zh' else 'en'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{_e(t['report'])}</title>
<style>body {{ margin: 0; padding: 40px 22px; font: 16px/1.7 -apple-system, "PingFang SC",
       system-ui, sans-serif; max-width: 520px }}
h1 {{ font-size: 20px; margin: 0 0 18px }} label {{ display: block; margin: 14px 0 0 }}
select, textarea {{ width: 100%; font: inherit; margin-top: 4px }}
button {{ margin-top: 22px; font: inherit; padding: 10px 18px; border-radius: 10px }}
p.hint {{ font-size: 13px; opacity: .66 }}</style></head>
<body>
<h1>{_e(t['report'])}</h1>
<p class="hint">{_e((share.title or '').strip() or t['by_anon'])}</p>
<form method="post" action="/n/{_e(share.token)}/report">
<label>{_e(t['reason'])}
<select name="reason">{options}</select></label>
<label>{_e(t['detail'])}
<textarea name="detail" maxlength="{DETAIL_MAX}" rows="4"></textarea></label>
<button type="submit">{_e(t['submit'])}</button>
</form>
<p><a href="/n/{_e(share.token)}/report?lang={other}">{_e(t['switch'])}</a>
<a href="/n/{_e(share.token)}">{_e(t['back'])}</a></p>
</body></html>""", headers=_NO_STORE)


def _bucket(request: Request) -> str:
    """举报人的"同一个人"指纹：按天轮换的加盐哈希，不存 IP 明文。

    为什么要有这一列：一张匿名表单没有它就无法回答"这五份举报是不是同一个人刷的"，
    而这条恰恰决定要不要把它当回事。为什么不留 IP：这是一张谁都能提交的公开表单，
    收访客地址换一点方便，是拿用户的隐私换我们的省事。
    """
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    key = hmac.new(settings.JWT_SECRET_KEY.encode(), day.encode(), hashlib.sha256).hexdigest()
    ip = get_remote_address(request) or ""
    return hmac.new(key.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


@router.post("/n/{token}/report", response_class=HTMLResponse)
@limiter.limit("6/hour")
def submit_report(
    request: Request,
    token: str,
    reason: str = Form(""),
    detail: str = Form(""),
    db: Session = Depends(get_db),
):
    """收下一条举报。**不**因为一条举报就把页撤下来——那是把审核权发给了全体访客。

    限流 6/小时：正常人手滑顶多两次。次数按真实客户端 IP 分桶（uvicorn --proxy-headers
    与 nginx 传 X-Forwarded-For 这两件在小程序码那条上已经实测确认过）。

    这里**不放 CSRF token**，是想清楚过的：这张表单唯一的副作用是往 `share_reports` 插一行
    给我们自己看的记录——它不动举报人的任何数据，也不把被举报页藏起来。跨站伪造能造成的
    最大伤害是灌我们的表，而那条已经被上面那 6/小时按来访者 IP 卡住了（伪造的表单同样
    带着访客的 IP 进来）。真正要补的是这张表的读取侧（按 bucket 去重），不是这张表单。
    """
    lang = _pick_lang(request)
    t = TEXT[lang]
    share = active_share_by_token(db, token)
    if share is None:
        return HTMLResponse(_gone(lang), status_code=404, headers=_NO_STORE)

    picked = reason if reason in REPORT_REASONS else "other"
    note = ShareReport(
        token=share.token,
        reason=picked,
        detail=(detail or "").strip()[:DETAIL_MAX] or None,
        reporter_bucket=_bucket(request),
    )
    db.add(note)
    db.commit()
    # 只进日志：这就是"实际处理流程"里我们这一侧的告警通道，没有它这张表会一直安静地涨。
    logger.info("收到举报 token=%s reason=%s bucket=%s", share.token, picked, note.reporter_bucket)

    body = (f"<!doctype html><html lang=\"{'zh-CN' if lang == 'zh' else 'en'}\"><head>"
            f"<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<meta name=\"robots\" content=\"noindex\"><title>{_e(t['report'])}</title>"
            f"<style>body{{margin:0;padding:56px 24px;font:16px/1.7 -apple-system,\"PingFang SC\",system-ui,sans-serif;"
            f"max-width:520px}}h1{{font-size:20px;margin:0 0 10px}}p{{margin:0;opacity:.72}}</style></head>"
            f"<body><h1>{_e(t['report_thanks'])}</h1>"
            f"<p><a href=\"/n/{_e(share.token)}\">{_e(t['back'])}</a></p></body></html>")
    return HTMLResponse(body, headers=_NO_STORE)
