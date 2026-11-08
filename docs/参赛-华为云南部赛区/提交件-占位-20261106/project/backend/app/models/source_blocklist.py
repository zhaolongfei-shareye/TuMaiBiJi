"""来源黑名单：读不到的站点按主机名记一笔账，够三次就自动拦下来。

规格正本 `docs/规格-来源黑名单.md`（站长 10-18「只要提取失败 3 次以上，自动落入黑名单，
管理员可以查看到域名，可以手工增删。后端提取时，先读取是否在黑名单，如果在就返回给客户端」）。

为什么必须新建一张表，两句话（规格 §二）：失败今天**完全不落库**（任务态只在 Redis，
`services/queue.py` 的 `TASK_TTL = 3600` 一小时就没了），而看着最合适的 `jobs` 表全仓零写入。
"累计 3 次"这件事没有一个字可以借。

一张表同时装两样东西（计数与名单），**名单那一半不写一栏布尔**：
「在不在黑名单里」由 `source` 与 `fail_count` 现算（规则只有一份，在
`services/source_blocklist.row_is_blocked`）。写成一栏就是两个真相——
阈值哪天改一次，或者谁手工把计数改了一格，那一栏就会和判据对不上，而且对不上的时候
**屏上没有任何地方会说**。代价是查一次要读回整行再判，而这一条一天跑不了几次。

`fail_count` 进了名单之后会停住：命中就不出网（规格 §四），没有新的失败可记。
那是这一条链正确的形状——它数的是"我们试过几次"，不是"这个站坏多久"。
"""
from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy.sql import func

from app.db.database import Base

# 「3 次以上」那一枚阈值。规格 §三③：全局累计，不分用户、不清零。
# 故意不挂到 `.env`：他点的是这个数，配成环境变量就变成"谁都能改而没人知道改过"。
AUTO_THRESHOLD = 3
SOURCE_AUTO = "auto"
SOURCE_MANUAL = "manual"
SOURCES = (SOURCE_AUTO, SOURCE_MANUAL)
# 主机名上限按 DNS 单标 63 × 段数那一条公认上限取 253；真正拦得住拼串的是服务层那道形状校验。
MAX_HOST_LEN = 253


class SourceBlocklist(Base):
    """一行＝一个主机名。唯一索引在 `host` 上，不在 `id` 上（`id` 只是自增主键）。

    计数维度是**主机名原样**（规格 §三②）：`www.zhihu.com`／`zhuanlan.zhihu.com`／`m.zhihu.com`
    各算一条。合并不做——那等于拿一个子域的实测证据去判整族，属于"证据不够就下结论"。
    """

    __tablename__ = "source_blocklist"

    __table_args__ = (
        # `Index(unique=True)` 而不是 `Column(unique=True)`：后者在 SQLite 上是表内约束，
        # `compare_metadata` 照 `PRAGMA table_info` 反射不出来，"迁移与模型一字不差"那条用例
        # 对它永远是假绿（同 `models/mp_asset.py:79-82` 那段）。
        Index("ux_source_blocklist_host", "host", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String(MAX_HOST_LEN), nullable=False)
    fail_count = Column(Integer, nullable=False, default=0, server_default="0")
    # 最后一次失败的 HTTP 状态码。管理员靠它一眼分得开两种形状（规格 §三①）：
    # **403**（知乎那种反爬页）与 **200**（微博那种访客壳页，正文读出 0 字）。
    # 可以空：手工加进来又还没失败过的行没有这个数，而"没数"不等于"数丢了"。
    last_status = Column(Integer, nullable=True)
    last_failed_at = Column(DateTime(timezone=True), nullable=True)
    # 'auto'＝失败攒出来的，'manual'＝管理员自己敲的。**这一栏是"手工增删"能收拾自动那一份的前提**
    # （规格 §五）：没有它，管理员分不清哪几行是自己加的。
    # 只给 Python 侧 `default`、不给 `server_default`：这一栏的每一次写入都在服务层，值总是显式给的，
    # 而 SQLite 反射出来的字符串 DEFAULT 与元数据里那份引号写法对不对得上是另一回事——
    # 仓里没有任何一栏字符串用 server_default（`grep` 得出来的零处），不在这里开第一处。
    source = Column(String(8), nullable=False, default=SOURCE_AUTO)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
