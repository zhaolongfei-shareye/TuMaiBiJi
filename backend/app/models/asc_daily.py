"""Apple App Store Connect 每日读数（「iPhone 数据」那一栏的地基）。一行 = 一个报告日。

数据源只有 Apple 那两头（`services/asc_reports.py`），这张表只是**拉的账**：
- salesReports（SALES／SUMMARY／DAILY，TSV）：下载（产品类型 1）、更新（7）、重新下载（3）、
  分币种的分成——都在 rows 里逐行留底，`payload` 存聚合后的行。
- analyticsReportRequests（ONGOING 单的那 52 份报告）：下载、安装/删除、会话/活跃设备、
  收入——四份报告逐日 JSONL 聚成这几列。

为什么计数列全部 nullable：Apple 是**有数才有行**——某天没下载，salesReports 对那天回 404
"no sales for the date"，这与"那天有人用了但没下载"是两件事，也与我们没拉过那天的
`sales_at`/`analytics_at` 是 NULL 不同。**缺数不补 0**（补 0 会把"没报"念成"是零"，
同一句纪律在 `usage_board._balance_row` 里）—— series 上缺的那天念"—"。

`report_date` 是 Apple 的报告日（UTC 日历日），不是东八区：账要对齐的是 Apple 的口径，
两边混一个时区就会出现"同一天两个名字"。唯一索引照 `(date)` 一行一把，
idempotent upsert 的落点就是它（`Index(... unique=True)` 而**不是** `Column(unique=True)`，
反射的坑见 `models/daily_usage.py` 顶上那段）。

三张凭证永远不进这张表也不进任何回体：.p8 内容、JWT、raw 报文原串。`payload` 只存
聚合后的行（日期、产品类型码、数量、金额），那里面没有身份值。
"""
from sqlalchemy import Column, DateTime, Float, Integer, String, Index, Text
from sqlalchemy.sql import func

from app.db.database import Base


class AscDaily(Base):
    __tablename__ = "asc_daily"

    __table_args__ = (
        Index("ux_asc_daily_report_date", "report_date", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    # Apple 报告日，形如 `2026-11-16`。定长字符串、字典序＝时间序。
    report_date = Column(String(10), nullable=False)
    # salesReports（或 analytics App Downloads）来的下载/更新/重新下载。
    downloads = Column(Integer, nullable=True)
    updates = Column(Integer, nullable=True)
    redownloads = Column(Integer, nullable=True)
    # analytics（App Store Installation and Deletion Standard）来的安装与删除。
    installs = Column(Integer, nullable=True)
    deletes = Column(Integer, nullable=True)
    # analytics（App Sessions Standard）来的会话数与去重设备数（"用户量"能拿到的最近口径）。
    sessions = Column(Integer, nullable=True)
    unique_devices = Column(Integer, nullable=True)
    # 收入只收**单一币种**那一天：analytics 的 purchases 报告给 USD；sales TSV 每行各带
    # 自己的币种，两种币混在一起时**不许加总**（加出来的是没有意义的数），
    # 只留 payload 里的分币种明细，这两列保持 NULL。
    proceeds_usd = Column(Float, nullable=True)
    proceeds_currency = Column(String(8), nullable=True)
    # 原始聚合行留底（JSON），排错与"换个口径再看"都从这里出发。里面没有身份值。
    payload = Column(Text, nullable=True)
    # 两个来源各自"最后一次成功拉到这一天"的时刻；缺哪一边哪一边是 NULL。
    sales_at = Column(DateTime(timezone=True), nullable=True)
    analytics_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
