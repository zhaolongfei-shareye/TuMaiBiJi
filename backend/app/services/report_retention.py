"""举报行的**保留期**——`probes/清-过期举报.py` 拿它算"哪些行到期了"，别的地方都不消费这一支。

为什么必须有这一支（10-10 拍板 #186 乙）：`share_reports` 只挂 `token`、不挂外键，为的是留住
"先举报、后撤回"和"作者删了笔记"那两类行（见 `app/models/share_report.py`）。**但没有保留期的
"永不删"是另一头的洞**：那一列 `detail` 是举报人写的自由文本，里面可能有对第三者的指控，
它比被举报的那一页活得久——页都没了，那段话还留在库里。没有期限的表还会一直涨，
涨到没人读完，台账就从"能处理"退化成"只看得到最上面那几篇"。

三条口径，每条都有理由：

① **只有一个旋钮**：`RETENTION_DAYS`。改期限就改这一格，脚本、台账、注释不许各写一份天数——
"保留 180 天"这句话在三个地方长得不一样，是将来最难查的那种错。

② **`created_at` 为空的行一律保留，并单独计数**。那一列 schema 允许空（`server_default` 只管
新建那一路，手工或迁移插的行可能是空）。到期判断需要知道"这是什么时候的事"，空着就是不知道，
而"不知道"不是"已经很旧、该删"。这类行只多不少，所以在报告里必须看得见数量。

③ **默认只算不删**。删除不可逆，而这张表里存的是举报人写过什么的唯一记录。要真删必须显式
带 `--执行`，并且那一刻先打印出条数——这是"手滑一次就把证据清了"那道最后一道闸。

时间戳的形状问题（naive／aware 混在一列里）与台账同源：比较一律走 `report_ledger._instant()`，
不在这里另写一份归一化口径。
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.share_report import ShareReport
from app.services.report_ledger import _instant

# 唯一期限出处。要改成别的天数只动这一格（`probes/清-过期举报.py` 与测试都读它，不各自写死）。
RETENTION_DAYS = 180


@dataclass(frozen=True)
class RetentionPlan:
    cutoff: datetime
    total: int
    expired_ids: list[int] = field(default_factory=list)
    undated: int = 0

    @property
    def kept(self) -> int:
        """还没到期的那些行——`total - len(expired_ids) - undated`，用它反着钉一条"行数守恒"。"""
        return self.total - len(self.expired_ids) - self.undated


def plan_expired(db: Session, now: datetime | None = None,
                 days: int = RETENTION_DAYS) -> RetentionPlan:
    """数出哪些举报行过了保留期。**只读**，不改任何行。

    `days` 是给测试留的口：要证"边界那一秒到底算哪一边"，不能靠把系统时钟往前调 180 天。
    """
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - timedelta(days=days)
    key = _instant(cutoff)
    rows = db.query(ShareReport.id, ShareReport.created_at).all()
    ids: list[int] = []
    undated = 0
    for row_id, created_at in rows:
        stamp = _instant(created_at)
        if stamp == "":
            undated += 1
            continue
        if stamp < key:
            ids.append(row_id)
    return RetentionPlan(cutoff=cutoff, total=len(rows), expired_ids=ids, undated=undated)


def delete_expired(db: Session, ids: list[int], batch: int = 500) -> int:
    """按 id 删掉这些行，返回删掉的条数。**不 commit**——要不要留下来由调用方决定。

    分批是因为 `IN (…)` 的占位符数量有上限：一条举报行不多，但一张跑了一年半的表会一次给出
    上千个 id，届时不是"报错"而是删不下去，而那种半删状态最难看出来。
    """
    deleted = 0
    for start in range(0, len(ids), batch):
        chunk = ids[start:start + batch]
        deleted += db.query(ShareReport).filter(ShareReport.id.in_(chunk)).delete(
            synchronize_session=False)
    return deleted
