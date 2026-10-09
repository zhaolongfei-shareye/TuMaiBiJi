from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class ShareReport(Base):
    """落地页上那条「举报这篇」落库的地方。Apple 1.2 要求公开分发 UGC 的 App 必须有
    举报入口，而"有入口"的证据是一张能被查询、能计数的表——不是页面上一个 `mailto:`。

    只挂 token 不挂外键：撤掉的码也要收得到举报（"我已经撤了还有人举报"是真实场景，
    而且撤掉之后才收到的举报恰恰说明撤晚了）。
    """

    __tablename__ = "share_reports"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(100), nullable=False, index=True)
    # 固定四选一（spam / abuse / infringement / other），自由文本另开一列——
    # 混在一列里就没法按类型计数，也没法给审核排优先级。计数按这列筛，所以它带索引。
    reason = Column(String(32), nullable=False, index=True)
    detail = Column(Text, nullable=True)
    # 举报人只留一个按天轮换的加盐哈希桶：够防同一个人刷同一篇，
    # 又不至于让一张举报表单变成收集访客 IP 的地方。
    reporter_bucket = Column(String(64), nullable=True)
    # 先隐藏待核，不是先删。这条刻意**不**由第一份举报自动置真：
    # 任何人点一次就能让别人的公开页消失，那是另一种攻击。
    hidden = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
