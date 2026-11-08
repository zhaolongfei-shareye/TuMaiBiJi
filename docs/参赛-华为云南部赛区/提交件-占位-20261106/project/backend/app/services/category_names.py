"""分类名的两档显示值（中／英）。

站长 10-17：「分类要支持自动翻译，就是分类名称是中文，切换英文，自动翻译，分类是英文，
切换中文，也是自动翻译。如果翻译不了，就维持原文。」当时通道拍的是甲——**先查一张固定词表，
表里没有才叫混元**。10-19 他把后半句撤了，这一条**只做词表**：表里有就填，表里没有就留空、
屏上显示他打的那几个字，**这一条链上没有任何一次出网**。
撤的理由是现网实测（台账 §8.344「第四十七次部署」那一条，commit `0f6c956`）：这里复用的是**提炼**那一只云函数（`cloudfunctions/extract/index.js`），
它把模型输出统一交给 `normalize(parsed, fallbackTitle)`，**回体固定成笔记那四栏**——
`items` 不在它的契约里，会被丢掉。独立打一次 `call_model(["马拉松","家常菜"])` 回空表，
同一份 payload 直接打函数回的是 `{"title":"未命名笔记",…}`：问也白问，每次还多烧一次调用与一次冷启动。
要真做长尾，得先改那只函数的返回契约（另一条链，他没点）。

四条规矩钉在这里，改代码别把它们改散：
* `name` 那一列仍是**身份**（重名判据、私密判据都看它），译文只进 `name_zh`／`name_en` 两列，
  两列都可以是 NULL。NULL 不是失败，是"这一档没有译名"，客户端拿它回落到 `name`。
* 填这两列的只有**写**的那两趟（建格、改名），读路径不查表也不算数——读一次慢一次不值得。
* 想补进来的词**往这张表里加**，一行一条，零出网、零延迟；不许在这里重新接一只模型或 HTTP 客户端。
* 默认四类那两档是**写死的常量**，播种那一步不出网也不查表。
"""

import re

from sqlalchemy.orm import Session

from app.models.category import Category

# 默认四类（站长 10-17 直接给的四个词，英文那档是他挑的乙）。
# 这四个词**连词表都不查**：播种那趟照这两列直接写死。
DEFAULT_CATEGORIES = [
    ("灵感", "Ideas"),
    ("生活", "Life"),
    ("工作", "Work"),
    ("学习", "Study"),
]

# 词表：常见分类名 → 英文显示值。命中就填，没命中两列留空、屏上显示他打的那几个字。
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


def seed_default_categories(db: Session, user_id: str) -> int:
    """新用户那四格：灵感／生活／工作／学习。返回建了几格（不 commit，跟着调用方那次一起）。

    站长 10-17「每个新用户默认提供四个分类，用户可以自行删除」——四格都是普通分类，
    删得掉，与「私密」那一格（那道锁的把手，不许删）是两回事。

    两档显示值**直接写死在常量里**，连词表都不查：新建账号那一下不该为四句常量话绕一圈。
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


__all__ = [
    "DEFAULT_CATEGORIES",
    "GLOSSARY_EN_ZH",
    "GLOSSARY_EN_ZH_BY_LOWER",
    "GLOSSARY_ZH_EN",
    "is_cjk",
    "is_latin",
    "pair_from_glossary",
    "seed_default_categories",
]
