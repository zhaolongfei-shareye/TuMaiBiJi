"""来源站名这一格**唯一**决定"这一篇该叫什么"的地方。

方案正本：`docs/方案-来源站点名.md`。四级兜底链（②已拍丙＝**只出站名，任何一级都不许拼「文章」「笔记」这类后缀**）：

1. 后台人工表（`/ops` 那一栏，站长 10-29 那句「后台提供后台配置…人工修改」）——他写什么就是什么，
   同时是**止血开关**：某族页面自报了个怪名字、或 AI 认错了，他进后台加一行就永久盖住。
2. 页面自己写的站名（`og:site_name`，其次结构化数据里的 `publisher.name`）——零成本，页面已经抓回来了。
   10-29 实测 24 族里拿到页面的 20 族**只有 12 族报了**，所以这一级只覆盖一半。
3. 内置词表（`BUILTIN`，随包发）——**这一刀的主力**：他点名的网易恰好是没报那 8 族之一。
4. AI 识别（①默认乙＝前三级全落空才发那一发）——只补长尾，且**通道没配就整级跳过**，
   不发一次注定失败的出网请求（与 `note_images.channel_ready` 同一条口径）。

三条硬约束：
· **站名不许进 `source_type` 那六档**（配额、后台来源分布、六档校验都判那一栏，见方案第二节结论一）。
  这一格是"抄自哪里"那份快照里的一个键，`notes` 表没有新列、没有迁移。
· **这一级失败绝不让整篇转存失败**。四级全空＝这一篇没有站名，屏上照旧念那六档通用文案。
· 词表里每一条都来自 `docs/枚举-URL转存全部情况.md` 表十那一趟实测（页面自报名或他给过的那句例子），
  **一条都不许多写**：认不准的族宁可留空走第 4 级，也不拿猜出来的名字上屏。
"""
import json
import logging
import re
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import llm, mp_assets

logger = logging.getLogger(__name__)

# 站名进的是屏上那一格（与「网页文章」同一只盒子），所以卡长度是**盒子**决定的，不是"随便给个数"。
# 上限与后台那张表共用一枚常量（`services/mp_assets.MAX_SITE_CHARS`）：两处各写一个数，
# 改的那一天必有一处忘。与文案栏同一口径：不合格整份退回，不在这里截断——
# 截出来的「高品质数字消费指」比不填更糟。
MAX_SITE_CHARS = mp_assets.MAX_SITE_CHARS

# ────────────── 第 3 级：内置词表 ──────────────
# (域名后缀, 中文站名, 英文站名)。域名后缀按"这一家自己的站"写：`163.com` 而不是 `c.m.163.com`，
# 因为同一家的文章页散在 www / c.m / tech 好几个子域上，逐子域列会漏。
# ⚠ 英文那一栏**不是 10-29 那趟实测读出来的**（那一趟只读中文 `og:site_name`），
#   取的是各家自己用的品牌写法；填错了他进后台改那一行就行，不必发版。
#   页面自报或 AI 认出来的那两级只有"一个名字"，两种语言共用它（见 `_pair`）。
BUILTIN: tuple[tuple[str, str, str], ...] = (
    # 10-29 表十「页面自报站名」那一列报了名的 12 族里，报的是脏值或带后缀的，这里给干净那份
    ("thepaper.cn", "澎湃新闻", "The Paper"),
    ("csdn.net", "CSDN", "CSDN"),                     # 页面报的是「CSDN博客」
    ("cnblogs.com", "博客园", "CNBlogs"),
    ("sspai.com", "少数派", "SSPAI"),                   # 页面报的是「少数派 - 高品质数字消费指南」
    ("ifeng.com", "凤凰网", "IFENG"),
    ("bilibili.com", "哔哩哔哩", "bilibili"),
    ("xiaohongshu.com", "小红书", "Xiaohongshu"),
    ("xhslink.com", "小红书", "Xiaohongshu"),          # 分享短链跳完才是上一行那一台
    ("xhslink.cn", "小红书", "Xiaohongshu"),
    ("github.com", "GitHub", "GitHub"),
    ("arxiv.org", "arXiv", "arXiv"),                   # 页面报的是「arXiv.org」
    ("sina.com.cn", "新浪", "Sina"),                   # 页面报的是「新浪网」
    ("mp.weixin.qq.com", "公众号", "WeChat"),
    # 页面**没报名**的那 8 族里，这一趟量到了内容、且站名没有歧义的（他点名的网易在第一条）
    ("163.com", "网易", "NetEase"),
    ("sohu.com", "搜狐", "Sohu"),
    ("news.cn", "新华网", "Xinhua"),
    ("douban.com", "豆瓣", "Douban"),
    ("zhihu.com", "知乎", "Zhihu"),
    ("weibo.com", "微博", "Weibo"),
    ("weibo.cn", "微博", "Weibo"),
    ("stackoverflow.com", "Stack Overflow", "Stack Overflow"),
)

# 第 2 级读回来的串要过这一道才敢上屏。判"脏"的两条都是 10-29 那趟实测的形状：
# 少数派报的是「少数派 - 高品质数字消费指南」（一句 slogan，不是站名），
# 而正常报名的那 11 族最长是「微信公众平台」六个字。
_META_MAX_CHARS = 12
_META_SEPARATORS = (" - ", " – ", " | ", " · ", "／", "/")


def _host(url: str) -> str:
    return (urlparse(url or "").hostname or "").lower().strip(".")


def _clean(raw) -> str:
    """两种语言共用同一个动作：去首尾空白、压掉中间的空行，长度超上限就当作不认。

    超上限为什么不截断：这一格落在屏上那一枚标里，一个被腰斩的名字比"这一篇没名字"更难解释。
    """
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text if len(text) <= MAX_SITE_CHARS else ""


def _pair(zh: str, en: str = "") -> dict:
    """一个名字 → 屏上那两门共用的那份。

    ⚠ 为什么允许 `en` 空：第 2 级（`og:site_name`）与第 4 级（AI）本来就只回一个名字，
    站名是专有名词，英文门里念「微信公众平台」与念「WeChat」都还是那一家；
    只有第 1 级那张表是**两栏**，因为他要统一口径时两种语言都得改（方案第四节那一行）。
    """
    zh = _clean(zh)
    if not zh:
        return {}
    return {"zh": zh, "en": _clean(en) or zh, "via": ""}


def builtin_site(url: str) -> dict:
    """第 3 级：内置词表。按域名后缀匹配，命中即止（表里同一家的多个子域各占一行，互不覆盖）。"""
    host = _host(url)
    if not host:
        return {}
    for suffix, zh, en in BUILTIN:
        if host == suffix or host.endswith("." + suffix):
            out = _pair(zh, en)
            out["via"] = "builtin"
            return out
    return {}


def meta_site(raw) -> dict:
    """第 2 级：页面自己报的站名。脏值（带 slogan、超长的）在这里判掉，不送去上屏。"""
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not text or len(text) > _META_MAX_CHARS:
        return {}
    if any(sep in text for sep in _META_SEPARATORS):
        return {}
    out = _pair(text)
    out["via"] = "meta" if out else ""
    return out


def table_site(db: Session, url: str) -> dict:
    """第 1 级：后台那张表。命中优先＝省掉后面每一趟（含第 4 级那一发模型调用）。"""
    host = _host(url)
    if not host:
        return {}
    for row in mp_assets.site_table(db):
        domain = str(row.get("domain") or "").lower().strip(".")
        if not domain:
            continue
        if host == domain or host.endswith("." + domain):
            out = _pair(row.get("zh"), row.get("en"))
            if out:
                out["via"] = "table"
                return out
    return {}


async def ai_site(url: str, title: str, content: str) -> dict:
    """第 4 级：只问模型"这是哪家"。①默认乙＝前三级全落空才走到这里。

    三道闸任一没开就**整级跳过**，一次出网都不发：
    `EXTRACT_PROVIDER=none`（提审期关能力）、`SITE_NAME_CF_URL` 没配（这一条函数还没部署）、
    以及混元只能从云函数里调那件事（同 `llm.py` 顶上那段注释）。
    失败一律退成"没有名字"，不许把整篇转存判成失败、也不许重试到把 worker 拖住。
    """
    if not llm.site_channel_ready():
        return {}
    try:
        guess = await llm.guess_site_name(
            host=_host(url),
            title=(title or "")[:120],
            snippet=re.sub(r"\s+", " ", (content or ""))[:400],
        )
    except Exception as exc:
        # 站名是这一格里最便宜的一枚：模型没回、回得不像话，都只是"这一篇没有站名"。
        logger.info("站名识别没走成（不影响这一篇存不存）：%s: %s", type(exc).__name__, exc)
        return {}
    out = _pair(guess)
    if out:
        out["via"] = "ai"
        logger.info("站名由模型认出 host=%s → %s", _host(url), out["zh"])
    else:
        logger.info("站名模型回的形状不认（host=%s）", _host(url))
    return out


async def resolve(db: Session, url: str, meta_site_raw: str = "",
                  title: str = "", content: str = "") -> dict:
    """四级链走一遍，回 `{zh, en, via}`；全落空回 `{}`。

    次序就是方案第三节那张表，**不许重排**：人工表在最前（他要的是"我说了算"），
    词表在页面自报之后（页面报得干净就用它，省得词表永远维护不完），AI 在最后（要花钱）。
    """
    for one in (
        table_site(db, url),
        meta_site(meta_site_raw),
        builtin_site(url),
    ):
        if one:
            return one
    return await ai_site(url, title, content)


def snapshot_fields(site: dict) -> dict:
    """链的结果怎么写进"抄自哪里"那份快照——**键名就这两个，别在这里拼任何后缀**。

    ②拍的是丙：屏上念什么，全由表里／词表里／页面里／模型里那一个名字决定。
    这一句写在离写入最近的地方，是因为"顺手补上『文章』二字"看起来像把需求做完整，
    实际是把站长那一句「只存网易」推回去。
    """
    if not site or not site.get("zh"):
        return {}
    return {"site_name": site["zh"], "site_name_en": site.get("en") or site["zh"]}


# 给后台那一页说"这一栏今天有哪几家、上限多少"那张表在 `services/mp_assets.TABLE_SPECS`——
# 校验与上限只有一个出处，这一份不抄第二遍（抄了就是改上限那天必有一处忘）。
