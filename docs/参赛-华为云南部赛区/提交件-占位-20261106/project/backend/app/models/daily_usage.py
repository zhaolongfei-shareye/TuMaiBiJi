"""每人每天的花费计数（10-25 第八轮审计 M33）。一行 = 一个人、一天、一类动作一共做了几次。

为什么要有这张表：这一条链上一天花多少钱，屏上此前**没有任何一个数**。
分钟闸（`10/minute`、`5/minute`）挡不住"一天里陆陆续续打满"，而每次提炼内部最多打四趟上游
（`services/llm.py` 的 `MAX_RETRIES`），分钟闸 × 重试 ⇒ 一个人一分钟最多 40 发花钱调用。
站长 10-25 拍的档位＝**提炼每人每天 50 条、内容检查每人每天 200 次**，档位本身在
`core/config.py` 那两栏，不在这里写死。

为什么计数落库而不是落进程内存：本服务是 **api＋worker 两只 unit、多进程**，进程内的 dict
在两只进程里各记一半，谁都不知道总数（10-20 报告 §5 那条待查就是这个形状，站长当时已说过
"别落进程内存"）。库里这一行是唯一真相，跨进程、跨重启都算得出。

`day` 存**东八区的日历日**而不是 UTC：限额要对齐的是微信侧那套"每日"口径与站长的直觉，
用 UTC 会让每天的口子在北京时间早上 8 点开，那是一个人正在用的时段。
时区与算法只有一个出处＝`services/daily_budget.py:DAILY_TZ`，这张表不重复解释一遍。

三栏都不写 `ForeignKey()`：SQLite 上后加列加不了外键，而这张表按 `(user_id, day, kind)`
唯一，删用户时清不清它都不影响正确性（人没了，那些计数只是历史）。
唯一索引写在 `__table_args__` 里而**不是** `Column(unique=True)`——后者 `compare_metadata`
反射不出来，会造出一条永远对不上的账（同一个坑见 `models/mp_asset.py:90-97`、`models/note.py:17`）。
"""
from sqlalchemy import Column, DateTime, Integer, String, Index, text
from sqlalchemy.sql import func

from app.db.database import Base


class DailyUsage(Base):
    __tablename__ = "daily_usage"

    __table_args__ = (
        Index("ux_daily_usage_user_day_kind", "user_id", "day", "kind", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    # 存 `users.id`（我们自己的主键），不存 openid：这一张表要把"哪个人今天用了几次"
    # 念到屏上，openid 一旦进来就等于把身份值往日志、往接口回体里递一遍。
    user_id = Column(String(100), nullable=False)
    # 东八区日历日，形如 `2026-10-25`。定长字符串、字典序＝时间序，跨天查询用 `==` 不用区间。
    day = Column(String(10), nullable=False)
    # `extract`＝一次结构化提炼；`sec_check`＝一次内容送检（文字或图片都算一次，两者都是平台侧按次计）。
    # 这两支名字的唯一个出处在 `services/daily_budget.py` 的 KINDS，别在别处手写字符串。
    kind = Column(String(24), nullable=False)
    count = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
