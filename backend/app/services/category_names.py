"""分类名的两档显示值（中／英）。

站长 10-17：「分类要支持自动翻译，就是分类名称是中文，切换英文，自动翻译，分类是英文，
切换中文，也是自动翻译。如果翻译不了，就维持原文。」三条拍定：
  ① 通道走甲——**先查一张固定词表，表里没有才叫混元**；
  ② 默认四类在英文界面叫 Ideas／Life／Work／Study；
  ③ 译不出来维持原文。

三条规矩钉在这里，改代码别把它们改散：
* `name` 那一列仍是**身份**（重名判据、私密判据都看它），译文只进 `name_zh`／`name_en` 两列，
  两列都可以是 NULL。NULL 不是失败，是"这一档没有译名"，客户端拿它回落到 `name`。
* 建格与改名那两趟**绝不等模型**：词表命中就当场填上，没命中两列留空、由后台补。
  一次调用把这个用户**所有**还缺译名的格子一起带走（见 `fill_missing`），
  所以"一次输入三个新词"最多花一次 token，不是三次。
* 模型挂了／没配凭据／回的东西不像话——一律什么都不写，那一格继续显示原文。
  这一条不许改成"抛出去让创建失败"：名字已经建好了，缺的只是一档显示值。
"""

import logging
import re

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.category import Category

logger = logging.getLogger(__name__)

# 默认四类（站长 10-17 直接给的四个词，英文那档是他挑的乙）。
# 这四个词**不走词表也不走模型**：播种那趟照这两列直接写死，新用户零调用。
DEFAULT_CATEGORIES = [
    ("灵感", "Ideas"),
    ("生活", "Life"),
    ("工作", "Work"),
    ("学习", "Study"),
]

# 词表：常见分类名 → 英文显示值。命中就填，没命中才轮到模型。
# 键一律小写比较（见 `_norm`），值才是给他看的写法。
GLOSSARY_ZH_EN = {
    **{zh: en for zh, en in DEFAULT_CATEGORIES},
    "旅行": "Travel",
    "旅游": "Travel",
    "读书": "Reading",
    "阅读": "Reading",
    "书签": "Bookmarks",
    "收藏": "Favorites",
    # 这四个词的中英是**拍定值**（站长 10-17 挑的乙），所以它们各自在反查表里必须唯一：
    # 谁再把别的中文词映射到 Ideas/Life/Work/Study 上，那四个词的"英文→中文"就查不回来了。
    "灵感": "Ideas",
    "生活": "Life",
    "工作": "Work",
    "学习": "Study",
    "想法": "Thoughts",
    "创意": "Creative",
    "设计": "Design",
    "摄影": "Photography",
    "照片": "Photos",
    "美食": "Food",
    "餐饮": "Food",
    "咖啡": "Coffee",
    "健身": "Fitness",
    "运动": "Sports",
    "健康": "Health",
    "医疗": "Health",
    "育儿": "Parenting",
    "家庭": "Family",
    "朋友": "Friends",
    "社交": "Social",
    "财务": "Finance",
    "理财": "Finance",
    "投资": "Investing",
    "股票": "Stocks",
    "基金": "Funds",
    "记账": "Expenses",
    "购物": "Shopping",
    "时尚": "Fashion",
    "美妆": "Beauty",
    "宠物": "Pets",
    "园艺": "Gardening",
    "手工": "Crafts",
    "音乐": "Music",
    "电影": "Movies",
    "剧集": "Series",
    "游戏": "Games",
    "动漫": "Anime",
    "绘画": "Drawing",
    "写作": "Writing",
    "笔记": "Notes",
    "日记": "Journal",
    "随想": "Musings",
    "摘抄": "Quotes",
    "语录": "Quotes",
    "历史": "History",
    "文化": "Culture",
    "艺术": "Art",
    "哲学": "Philosophy",
    "宗教": "Religion",
    "政治": "Politics",
    "社会": "Society",
    "经济": "Economy",
    "法律": "Law",
    "科学": "Science",
    "技术": "Technology",
    "科技": "Tech",
    "编程": "Coding",
    "代码": "Code",
    "前端": "Frontend",
    "后端": "Backend",
    "产品": "Product",
    "运营": "Operations",
    "市场": "Marketing",
    "销售": "Sales",
    "职场": "Career",
    "面试": "Interviews",
    "考试": "Exams",
    "课程": "Courses",
    "语言": "Languages",
    "英语": "English",
    "数学": "Math",
    "物理": "Physics",
    "化学": "Chemistry",
    "生物": "Biology",
    "地理": "Geography",
    "天气": "Weather",
    "汽车": "Cars",
    "交通": "Transport",
    "航空": "Aviation",
    "户外": "Outdoors",
    "徒步": "Hiking",
    "露营": "Camping",
    "跑步": "Running",
    "骑行": "Cycling",
    "钓鱼": "Fishing",
    "滑雪": "Skiing",
    "潜水": "Diving",
    "建筑": "Architecture",
    "室内": "Interiors",
    "城市": "Cities",
    "乡村": "Countryside",
    "自然": "Nature",
    "动物": "Animals",
    "植物": "Plants",
    "天文": "Astronomy",
    "军事": "Military",
    "体育": "Sports",
    "足球": "Football",
    "篮球": "Basketball",
    "新闻": "News",
    "时事": "Current Affairs",
    "娱乐": "Entertainment",
    "八卦": "Gossip",
    "段子": "Jokes",
    "幽默": "Humor",
    "心理": "Psychology",
    "情感": "Relationships",
    "婚恋": "Marriage",
    "教育": "Education",
    "亲子": "Parenting",
    "养老": "Elderly Care",
    "旅行攻略": "Travel Guides",
    "攻略": "Guides",
    "教程": "Tutorials",
    "工具": "Tools",
    "效率": "Productivity",
    "待办": "Todo",
    "计划": "Plans",
    "目标": "Goals",
    "复盘": "Reviews",
    "总结": "Summaries",
    "会议": "Meetings",
    "项目": "Projects",
    "客户": "Clients",
    "竞品": "Competitors",
    "行业": "Industry",
    "数据": "Data",
    "分析": "Analytics",
    "调研": "Research",
    "报告": "Reports",
    "素材": "Assets",
    "模板": "Templates",
    "链接": "Links",
    "视频": "Videos",
    "音频": "Audio",
    "播客": "Podcasts",
    "直播": "Livestream",
    "截图": "Screencaps",
    "发票": "Receipts",
    "合同": "Contracts",
    "证件": "Documents",
    "密码": "Passwords",
    "安全": "Security",
    "隐私": "Privacy",
    "未分类": "Uncategorized",
    "其他": "Other",
    "杂项": "Misc",
    "测试": "Test",
    "临时": "Temporary",
    "归档": "Archive",
    "重要": "Important",
    "稍后阅读": "Read Later",
    "想买的": "Wishlist",
    "想去": "Wishlist",
}

# 反查那一半：他直接打英文时用它补中文。只收"值唯一"的那些，
# 一个英文词被多个中文词共用的（Travel ← 旅行／旅游）不进反查表——
# 猜一个中文写法填进去，就是替他的分类编一个他没起过的名字。
_AMBIGUOUS: set[str] = set()
_seen_en: dict[str, str] = {}
for _zh, _en in GLOSSARY_ZH_EN.items():
    _seen_en.setdefault(_en, _zh)
for _zh, _en in GLOSSARY_ZH_EN.items():
    if _seen_en.get(_en) != _zh:
        _AMBIGUOUS.add(_en)
GLOSSARY_EN_ZH = {
    en: zh for zh, en in GLOSSARY_ZH_EN.items() if en not in _AMBIGUOUS
}
# 反查按小写比：他打 "work"、"WORK"、"Work" 是同一个分类名的三种写法，
# 而中文那一档只有一份。键一律小写，值仍是给他看的英文写法所在那一格。
GLOSSARY_EN_ZH_BY_LOWER = {k.lower(): v for k, v in GLOSSARY_EN_ZH.items()}

_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
# "算英文"的窄口径：拉丁字母、数字、空格与几个常见标点。带一个汉字就不算。
_LATIN = re.compile(r"^[A-Za-z0-9 &.,'()/+\-]+$")


def _norm(name: str) -> str:
    return " ".join((name or "").split()).strip()


def is_cjk(name: str) -> bool:
    return bool(_CJK.search(name or ""))


def is_latin(name: str) -> bool:
    return bool(_LATIN.match(_norm(name)))


def pair_from_glossary(name: str) -> tuple[str | None, str | None]:
    """只查表，不出网。返回 (name_zh, name_en)，查不到就是 (None, None)。

    注意返回的是"另一档"那一列该填什么：**他自己打的那一档由调用方直接落进对应列**，
    这里不猜、不改写、也不把他的名字换大小写。
    """
    n = _norm(name)
    if not n:
        return None, None
    if is_cjk(n) and not is_latin(n):
        return None, GLOSSARY_ZH_EN.get(n)
    if is_latin(n):
        return GLOSSARY_EN_ZH_BY_LOWER.get(n.lower()), None
    return None, None


# ── 模型那一档 ──────────────────────────────────────────────────────────────

_SYS = """你是一个只做短词翻译的助手。用户给出若干个分类名称，每个名称占一行。
请把每一个名称同时给出简体中文与英文两种写法。

严格按以下 JSON 格式输出，不要输出其他内容：
{
  "items": [
    {"src": "原样照抄用户给的那个名称", "zh": "简体中文写法", "en": "英文写法"}
  ]
}

规矩：
1. "src" 必须与用户给的那一行**逐字相同**，不要改写、不要补空格、不要换大小写。
2. 用户给的是中文，就把 "en" 译成英文；"zh" 原样照抄那串中文。
3. 用户给的是英文，就把 "zh" 译成简体中文；"en" 原样照抄那个英文词。
4. 译不出来的（人名、品牌、乱码、他自己造的缩写），"zh" 与 "en" 都照抄原名称。
5. 只给两档写法，不要解释、不要近义词、不要加引号以外的任何符号。"""


async def call_model(names: list[str]) -> dict[str, tuple[str, str]]:
    """把一批名字交给云函数那头的混元，拿回 {原名: (zh, en)}。

    复用提炼那一条通道（同一个 URL、同一个凭据、同一份 `system_prompt` 入参），
    不新开第二个供应商、也不直连混元端点——免费额度只从这条来源抵扣。
    任何一步不对都回空表：这一档是"锦上添花"，不是"缺了就报错"。
    """
    cleaned = [_norm(n) for n in names if _norm(n)]
    if not cleaned:
        return {}
    url = (settings.HUNYUAN_CF_URL or "").strip()
    key = (settings.HUNYUAN_CF_KEY or "").strip()
    from app.services.llm import key_usable

    if not url or not key_usable(key):
        logger.info("分类译名跳过：云函数地址或凭据没配（%d 个名字留着原文）", len(cleaned))
        return {}

    payload = {"text": "\n".join(cleaned), "fallback_title": "", "system_prompt": _SYS}
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=settings.HUNYUAN_CF_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code >= 400:
            logger.info("分类译名没成（HTTP %s），留着原文", resp.status_code)
            return {}
        data = resp.json()
    except Exception as e:  # 网络／JSON／网关回 HTML，一律"这一档没有"，不许冒到创建那趟
        logger.info("分类译名没成（%s），留着原文", type(e).__name__)
        return {}

    if not isinstance(data, dict):
        return {}
    # 云函数把模型的 JSON 原样带回来；不同部署形态下可能再套一层 result／content，
    # 这里只认拿得到 items 的那一种，拿不到就当没译。
    items = data.get("items")
    if items is None and isinstance(data.get("result"), dict):
        items = data["result"].get("items")
    if not isinstance(items, list):
        logger.info("分类译名回的不是 items 列表（键：%s），留着原文", ",".join(sorted(data)[:6]))
        return {}

    want = {_norm(n): (n) for n in cleaned}
    out: dict[str, tuple[str, str]] = {}
    for row in items:
        if not isinstance(row, dict):
            continue
        src = _norm(str(row.get("src") or ""))
        if src not in want:
            continue
        zh = str(row.get("zh") or "").strip()[:100]
        en = str(row.get("en") or "").strip()[:100]
        if not zh or not en:
            continue
        out[want[src]] = (zh, en)
    return out


def fill_from_glossary(db: Session, user_id: str) -> int:
    """把该用户所有"还缺译名"的格子先按词表补一遍，回改了多少行。零出网。"""
    rows = (
        db.query(Category)
        .filter(
            Category.user_id == user_id,
            ((Category.name_zh.is_(None)) | (Category.name_en.is_(None))),
        )
        .all()
    )
    changed = 0
    for row in rows:
        zh, en = pair_from_glossary(row.name)
        own_zh = row.name if is_cjk(row.name) else zh
        own_en = row.name if is_latin(row.name) and not is_cjk(row.name) else en
        hit = False
        if row.name_zh is None and own_zh:
            row.name_zh = own_zh[:100]
            hit = True
        if row.name_en is None and own_en:
            row.name_en = own_en[:100]
            hit = True
        if hit:
            changed += 1
    if changed:
        db.commit()
    return changed


async def fill_missing(db: Session, user_id: str) -> int:
    """一个用户所有还缺译名的格子：先词表、剩下的才交模型，一次调用全带走。

    返回模型那一趟真补上了几行。整趟失败也不抛——创建那趟已经成了，这里只是补显示值。
    """
    try:
        fill_from_glossary(db, user_id)
    except Exception:
        db.rollback()
        logger.exception("分类译名：词表那一趟就出岔子（不影响已建好的格子）")

    rows = (
        db.query(Category)
        .filter(
            Category.user_id == user_id,
            ((Category.name_zh.is_(None)) | (Category.name_en.is_(None))),
        )
        .all()
    )
    if not rows:
        return 0
    names = [r.name for r in rows]
    try:
        got = await call_model(names)
    except Exception:
        logger.exception("分类译名：模型那一趟崩了（格子继续显示原文）")
        return 0
    if not got:
        return 0
    changed = 0
    for row in rows:
        hit = got.get(row.name)
        if not hit:
            continue
        zh, en = hit
        if row.name_zh is None and zh:
            row.name_zh = zh[:100]
        if row.name_en is None and en:
            row.name_en = en[:100]
        changed += 1
    if changed:
        db.commit()
    return changed


def seed_default_categories(db: Session, user_id: str) -> int:
    """新用户那四格：灵感／生活／工作／学习。返回建了几格（不 commit，跟着调用方那次一起）。

    站长 10-17「每个新用户默认提供四个分类，用户可以自行删除」——四格都是普通分类，
    删得掉，与「私密」那一格（那道锁的把手，不许删）是两回事。

    两档显示值**直接写死**，不走词表也不走模型：新建账号那一下不该为四句常量话出网。
    幂等按"名下已有那个名字"判，与 `_ensure_private_category` 同一路子（这一列没唯一约束）。
    只给新用户：存量账号一律回填＝往别人已经归好类的库里塞四格，那是他的库不是我的。
    """
    have = {
        r[0]
        for r in db.query(Category.name).filter(Category.user_id == user_id).all()
    }
    order = db.query(Category).filter(Category.user_id == user_id).count()
    made = 0
    for zh, en in DEFAULT_CATEGORIES:
        if zh in have:
            continue
        db.add(Category(user_id=user_id, name=zh, name_zh=zh, name_en=en, sort_order=order))
        order += 1
        made += 1
    if made:
        db.flush()  # 把四行落到这条 session 里，commit 由调用方统一做（与预置笔记那趟同一个尾巴）
    return made


def display_names(db: Session, user_id: str) -> dict[int, dict[str, str | None]]:
    """给读接口用：{id: {zh, en}}。两列没值就是没值，客户端自己回落。"""
    rows = db.query(Category.id, Category.name_zh, Category.name_en).filter(
        Category.user_id == user_id
    ).all()
    return {r[0]: {"zh": r[1], "en": r[2]} for r in rows}


__all__ = [
    "DEFAULT_CATEGORIES",
    "GLOSSARY_EN_ZH",
    "GLOSSARY_EN_ZH_BY_LOWER",
    "GLOSSARY_ZH_EN",
    "call_model",
    "display_names",
    "fill_from_glossary",
    "fill_missing",
    "is_cjk",
    "is_latin",
    "pair_from_glossary",
    "seed_default_categories",
]
