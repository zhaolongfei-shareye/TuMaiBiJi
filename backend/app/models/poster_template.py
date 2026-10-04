"""卡片模板配方表（方案 docs/方案-卡片模板不走发版.md §四）。

这一张表存在的唯一理由：以后加一套同族模板不用发版。所以它存的**只有数据**——
一份 JSON 配方（步型与算子都在闭集名单里，见 app/services/poster_recipe.py），
客户端那份手工写的解释器负责把它翻译成图层。可执行代码一行都不许进这张表，
那是微信《关于禁止小程序 JavaScript 解释器使用规范》那条硬线（方案 §二）。

`status` / `min_app_version` 是灰度与回滚的两个把手：
- `draft` 不进接口，改配方的人在本地拿真机验；
- `live` 才下发；
- `archived` 不再下发，但**记录不删**——已经拿到过那份配方的老版本客户端要一直收得得住，
  删行等于把历史抹掉（壁纸那批的教训反过来用）。
`min_app_version` 比的是小程序版本号（客户端 `utils/appInfo.js` 那个常量），由客户端自己筛：
"谁的包够新"只有客户端自己知道，服务器按一个 query 参数筛反而多一处会不同步的真相。
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Index, text
from sqlalchemy.sql import func
from app.db.database import Base

STATUS_DRAFT = "draft"
STATUS_LIVE = "live"
STATUS_ARCHIVED = "archived"
STATUSES = (STATUS_DRAFT, STATUS_LIVE, STATUS_ARCHIVED)
# 界面上那两个分组名的出处是 miniprogram/utils/poster.js 的 TEMPLATE_GROUPS，
# 这里只是把同一套词收进列约束，别让一条脏 group 把「卡片模板」那页的分栏撑坏。
GROUP_KEYS = ("classic", "bold")


class PosterTemplate(Base):
    __tablename__ = "poster_templates"

    __table_args__ = (
        # 「同时只有一套 live 的同名模板」——不加这条，两条 live 会让客户端按 id 合并时
        # 拿到不确定的一条（哪条赢取决于查询顺序）。archived 的历史行不受约束，
        # 因为一个模板会攒下好几版。
        Index(
            "ux_poster_templates_one_live_per_template",
            "template_id",
            unique=True,
            sqlite_where=text("status = 'live'"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    # 与客户端 TEMPLATES 里那个 id 同名（'card'/'quote'/…）：合并就是按它覆盖。
    template_id = Column(String(40), nullable=False, index=True)
    label = Column(String(40), nullable=False)
    label_en = Column(String(60), nullable=False)
    group_key = Column(String(20), nullable=False, default="bold")
    sort_order = Column(Integer, nullable=False, default=100)
    # L3 那份声明式配方：{id, min_version, steps:[...]}。
    recipe = Column(JSON, nullable=False)
    status = Column(String(16), nullable=False, default=STATUS_DRAFT)
    # 要哪个小程序版本以上才拿得到，形如 "1.9.26"。
    # 为什么不叫 min_version（方案 §四 原本这么写）：配方 JSON 里已经有一个 `min_version`，
    # 那个是**解释器的版本号**（现在是 1），这两个数不同源、不同单位、也不同筛法。
    # 同名不同义迟早会算错，所以这里一律带 app_ 前缀。
    min_app_version = Column(String(20), nullable=False, default="1.0.0")
    # 配方序列化后的 sha256。客户端拿它当缓存的键：号没变就不用重新解析一遍。
    content_hash = Column(String(64), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
