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
不在这里另写一份归一化口径。三条 10-10 实测出来的形状事实，写在这里免得下一个人重新踩：

④ **不是日期的字符串 = 这一发跑不起来，且一行都还没删**。那一列本质是 TEXT，塞什么都存得下，
但 SQLAlchemy 读的时候当场 `ValueError: Invalid isoformat string`（实测 `/tmp/retention-shape.db`）。
所以它不是"归到哪一档"的问题，是 fail-closed：脚本在删任何一行之前就崩，不静默跳过。

⑤ **带非 UTC 偏移量的值，走 ORM 那一路与走裸 SQL 那一路不一样**。裸 INSERT 的 `'…+08:00'`
读回来是 aware，`_instant` 会正确换算；而**同一个瞬间交给 ORM** 会被丢掉偏移量、按**那个值自己
那个偏移量下的墙上时间**存成 naive（`DateTime(timezone=True)` 在 SQLite 上不换算；也不是按本机时区
换算——aware UTC 那条落下来的就是 UTC 的墙上时间，所以看不出问题）。10-10 实测
（`/tmp/retention-offset.db`，
`now=2026-10-10T03:00Z`、180 天，截止 `2026-04-13T03:00Z`，故意取边界两侧各 1 小时）：
偏东 +08／+14 那两行"该到期"的被判成**没到期**（多留 8／14 小时），偏西 −08／−12 那两行
"不该到期"的被判成**已到期**（提前 8／12 小时删掉）。两边都错，但**错的方向不对称**：
多留是可以再跑的，早删是不可逆的，而这条链路上唯一不可逆的就是 `delete_expired`。

⑥ 所以⑤今天**不是现网的错**。生产里会碰这一列的只有 `landing.py` 建 `ShareReport` 那一处，而它
**不写**这一列（于是走 `server_default=func.now()`，SQLite 给的就是 UTC）；建表那发迁移
（`alembic/versions/f1b3c8a05d27_share_reports.py`）也只**定义** `server_default`、没有回填任何行。
测试与探针里交过 aware 值的三处必须分清，别把它们混成"哪哪儿都在犯⑤"：
**故意交非 UTC 且走 ORM 的只有一发** —— `tests/test_report_ledger.py` 里
`Test时间与默认值这两条前提::test_走ORM写入的这一列读回来是_naive_且丢偏移不换算`，它交 `+08:00`
正是为了把⑤钉成判据；`tests/test_report_retention.py::test_同一瞬间的两种形状必须同档` 那种是
**裸 SQL 塞 `'…+08:00'` 字符串**，走的是换算正确那一路；`probes/反向验证-举报台账.sh` 的 gate 种子与本文件
测试的 SEED 交的都是 **aware UTC**，墙钟与 UTC 相等，所以⑤在它们身上看不出来。除此之外，哪天有人给
`created_at` 直接赋一个带**非 UTC** 偏移量的 aware 值（迁移回填、手工补行、将来的后台工具都算），⑤就会
真的作用到删除上。要改这条的正确姿势不是在这里加换算，是**让写入侧一律交 UTC**——因为库里存的字符串
已经没有偏移量信息，读的时候再聪明也补不回来。

最后一条是**读数层**的，跟形状无关（10-10 第六轮审计抓出来的）：

⑦ **一份读数内部要过两道自洽检查，两道说的是不同的事**。`total` 是**独立那条 `COUNT(*)`**，
`scanned` 是**循环真遍历到的行数**：
- `scanned != total` ⇒ 要么这一发两次读之间**有并发写**（这张表是公开网页表单在写的，6 次/小时/来访者），
  要么那次读取**不是全表**（将来谁给它加了 `limit`／分页）。脚本分不出是哪一种，所以只能报"这一发别拿去
  做删除决定"，**不许报成"分类掉了行"**——把并发诬陷成实现有 bug 是另一种假话。
- 三档加起来 `!= scanned` ⇒ 这才是"有一行既不删也不报、屏幕上看不见"。
为什么两次读都要：只拿 `scanned` 不要 `total`，"守恒"就退化成同义反复（循环里每一行必然落进三档之一），
而独立数那一遍能抓"读到的不是全表"；要 `total` 就必然吃并发这一刀——**两个都要，代价写在代码里**。
删完之后复跑那一份过的是**同一道闸**：第六轮实测过"前一遍有闸、后一遍没闸"的写法，删除提交之后
`after` 打出「总行数 3 · 到期 0 · 无时间戳 0 · 未到期 2」（三档只有 2）却**退出码 0**。
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.share_report import ShareReport
from app.services.report_ledger import _instant

# 唯一期限出处。要改成别的天数只动这一格（`probes/清-过期举报.py` 与测试都读它，不各自写死）。
RETENTION_DAYS = 180


@dataclass(frozen=True)
class RetentionPlan:
    cutoff: datetime
    # `total` **不是**由下面两档推出来的，而是独立数一遍 `COUNT(*)`：
    # 三档守恒那道检查只有在这个前提下才有牙——`total = expired + undated + kept` 如果
    # 是定义式，任何一行分类时掉出三档之外都不可能被发现（10-10 第五轮审计实测：原来那版
    # `kept` 就是差一个减法，改坏分类之后脚本照打"未到期保留 3 行"、照退 0）。
    total: int
    # `scanned` 是循环**真遍历到的行数**。它和 `total` 是两个出处，所以对账要两个都比：
    # 与 `total` 不等＝并发写或读取被截断（口径⑦），与三档之和不等＝分类掉了一行。
    scanned: int
    expired_ids: list[int] = field(default_factory=list)
    undated: int = 0
    kept: int = 0


def selfcheck(p: RetentionPlan) -> list[str]:
    """一份读数**内部**的两道自洽检查；返回空列表就是自洽。纯函数，不碰库。"""
    bad: list[str] = []
    if p.scanned != p.total:
        bad.append(
            f"逐行数到 {p.scanned} 行，而独立那条 COUNT 数到 {p.total} 行——"
            "要么这一发两次读之间有并发写（这张表是公开表单在写的），要么那次读取不是全表。"
            "两种都不能拿去做删除决定")
    classified = len(p.expired_ids) + p.undated + p.kept
    if classified != p.scanned:
        bad.append(
            f"三档 {len(p.expired_ids)}+{p.undated}+{p.kept} 对不上遍历到的 {p.scanned} 行——"
            "有行在分类时掉了出去：既不进删除名单，也不在保留的计数里，屏幕上看不见")
    return bad


def reconcile(before: RetentionPlan, after: RetentionPlan) -> list[str]:
    """删完之后那一份与删之前那一份的对账。**方向要分清**：变多的是别人写的，不是我们删的。"""
    bad: list[str] = []
    if after.expired_ids:
        bad.append(
            f"删完之后到期那一档还剩 {len(after.expired_ids)} 行——"
            f"那句「已删除」不能算完")
    if after.undated < before.undated:
        bad.append(
            f"无时间戳那一档从 {before.undated} 变成 {after.undated}——这一档说好一条都不删的")
    return bad


def plan_expired(db: Session, now: datetime | None = None,
                 days: int = RETENTION_DAYS) -> RetentionPlan:
    """数出哪些举报行过了保留期。**只读**，不改任何行。

    `days` 是给测试留的口：要证"边界那一秒到底算哪一边"，不能靠把系统时钟往前调 180 天。
    `now` 默认取 UTC 此刻（现网那一路走的就是这条默认值，测试里一律显式传固定时刻）。
    """
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - timedelta(days=days)
    key = _instant(cutoff)
    rows = db.query(ShareReport.id, ShareReport.created_at).all()
    ids: list[int] = []
    undated = 0
    kept = 0
    for _row_id, created_at in rows:
        stamp = _instant(created_at)
        if stamp == "":
            undated += 1
            continue
        if stamp < key:
            ids.append(_row_id)
        else:
            # 这一档必须**自己数**，不许写成"总数减另外两档"：分类里掉一行出去的时候，
            # 减法版永远补得回来，看起来就是"守恒没问题"。
            kept += 1
    return RetentionPlan(cutoff=cutoff, total=db.query(func.count(ShareReport.id)).scalar() or 0,
                         scanned=len(rows), expired_ids=ids, undated=undated, kept=kept)


def delete_expired(db: Session, ids: list[int], batch: int = 500) -> int:
    """按 id 删掉这些行，返回删掉的条数。**不 commit**——要不要留下来由调用方决定。

    分批是被 SQLite 的变量上限逼出来的：实测 40000 个 id 一次给完是
    `OperationalError: too many SQL variables`（`/tmp/inlimit.db` 那一发；它炸在**编译语句**那一步，
    一行都还没删，所以那种失败反而是看得见的）。真正难看见的是**分批自己**造出来的另一种状态——
    "只删了前几批"：不报错、屏幕上也只有一句"已删除"。所以这一支坚持两件事：**不 commit**
    （提交是脚本那一步的决定），以及调用方必须把返回的条数与名单条数对一遍
    （`probes/清-过期举报.py` 里 `deleted != len(p.expired_ids)` 那道闸，刀 `AI`）。
    """
    deleted = 0
    for start in range(0, len(ids), batch):
        chunk = ids[start:start + batch]
        deleted += db.query(ShareReport).filter(ShareReport.id.in_(chunk)).delete(
            synchronize_session=False)
    return deleted
