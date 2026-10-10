"""举报台账的**读取侧**——`probes/读-举报台账.py` 拿它出报告，别的什么都不是它的调用方。

为什么必须有这一支：`routes/landing.py` 写举报那一段的注释里早就写着"真正要补的是这张表的
读取侧（按 bucket 去重）"，而这句话到今天只做到了**写入**那一半。一张没人能读的举报表比没有
更坏：Apple 1.2 要的是"有举报入口**并且能处理**"，而"能处理"的证据是有人定期看这张表；
表一直在安静地涨，界面上一个字都不报错，这就是那种"改坏了没有任何现网症状"的洞。

三条口径，每条都有理由，不是随手写的：

① **同一个人在同一篇上刷 N 次，折成一档**——按 `reporter_bucket` 去重。这张表单是公开的、
限流是 6/小时按来访者 IP，去重之后剩下的数字才回答"到底有几个人举报过这篇"，而那才是
要不要把它当回事的判据。条数（`total`）也一起给：只有一个人反复举报 5 次，本身也是一条信息
（那多半是当事人在自己那篇上按了举报）。

② **`reporter_bucket` 为 NULL 的每一条各算一个人**。这一列可空（拿不到客户端地址时不硬造一个
指纹）。把 NULL 折叠成"同一个未知的人"会**少报人数**，而少报正是最坏的那种错——它会让一篇
真被三个人举报的页面排到台账后面去。宁可多算，不可漏算。

③ **撤掉的码照样出现在台账上，并标出页面状态**。`share_reports` 只挂 token 不挂外键，理由就写在
模型里："我已经撤了还有人举报"是真实场景，而且撤掉之后才收到的举报恰恰说明撤晚了。
按外键 join 的话那一类行会整批消失，台账就变成了"只看现在还公开着的"。

排序按 `去重人数` 降序、同数按最近一次降序：台账是给人从上往下读的，**最多人举报的那篇必须在
第一屏**，而不是最新的在第一屏（最新的那篇往往只有一个人举报过）。

刻意**不**读 `share_reports.hidden` 那一格：模型注释写的是"先隐藏待核"，可全仓没有任何一条路径
读它或写它（实测只有 `test_landing_page.py` 断言一条举报**不会**把它置真）。把一列死值抄进报告
里，等于给一个没接线的开关画了个仪表盘。那一格要不要真接上，是另一件事。
"""
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.share import Share
from app.models.share_report import ShareReport

# 页面状态的三种取值。写成常量而不是散在字符串里：判据要能引用同一个值，
# 否则改一个字面就把一条断言变成"永远绿"。
PAGE_LIVE = "公开中"
PAGE_REVOKED = "已撤回"
PAGE_NO_CODE = "码不存在"

# 每篇最多带几句举报人原话。数字定成 3 不是拍脑袋：台账一屏要放得下十几篇，
# 每篇贴五段长文就变成把整张表打印一遍——那已经有数据库客户端了。
SAMPLE_LIMIT = 3


@dataclass(frozen=True)
class ReportGroup:
    token: str
    total: int
    reporters: int
    reasons: dict[str, int] = field(default_factory=dict)
    latest_at: datetime | None = None
    page_state: str = PAGE_LIVE
    # 举报人自己写的那几句话（`detail` 那一列，空白的不要），最多 `SAMPLE_LIMIT` 条、取最后那几条。
    # 为什么在服务侧而不是让脚本自己去查：那样等于把"按 token 归组"这件事在两个地方各写一遍——
    # 两处一旦分叉，台账的数字与引用的原话就来自不同口径，而那种错看不出来。
    # "最后几条"按**写入顺序**（`id`）而不是按 `created_at`：现网那一列是 `func.now()`，
    # SQLite 给的只到**秒**，同一秒里的三发举报时间上分不出先后，而 `id` 分得出。
    # 原话**不在这里**清洗换行：这一支交出去的是数据，换行属于展示层，清洗放在脚本里
    # （一条带换行的原话能把台账的下一行伪造成任意内容——那是显示层的洞，不该靠改数据来堵）。
    samples: tuple[str, ...] = ()


def ledger(db: Session) -> list[ReportGroup]:
    """按 token 归组的举报台账，最多人举报的排最前。**只读**，一行都不写。"""
    rows = db.query(
        ShareReport.token, ShareReport.reason, ShareReport.reporter_bucket,
        ShareReport.created_at, ShareReport.detail,
    ).order_by(ShareReport.id).all()
    if not rows:
        return []

    tokens = {r[0] for r in rows}
    states: dict[str, str] = {}
    for token, active in db.query(Share.token, Share.is_active).filter(
        Share.token.in_(tokens)
    ).all():
        states[token] = PAGE_LIVE if active else PAGE_REVOKED

    grouped: dict[str, list[tuple]] = {}
    for row in rows:
        grouped.setdefault(row[0], []).append(row)

    out: list[ReportGroup] = []
    for token, items in grouped.items():
        named = {r[2] for r in items if r[2] is not None}
        unknown = sum(1 for r in items if r[2] is None)
        reasons: dict[str, int] = {}
        for r in items:
            reasons[r[1]] = reasons.get(r[1], 0) + 1
        # 空白原话不算"有人写了话"：写入那一侧本来就把空串归成 NULL，但这一列没有 CHECK 约束，
        # 手工插一行 `"   "` 也进得来。台账上出现一条空白引用，读的人会以为举报人写了什么。
        noted = [r[4].strip() for r in items if r[4] and r[4].strip()]
        out.append(ReportGroup(
            token=token,
            total=len(items),
            reporters=len(named) + unknown,
            reasons=reasons,
            latest_at=max((r[3] for r in items if r[3] is not None), default=None),
            page_state=states.get(token, PAGE_NO_CODE),
            samples=tuple(noted[-SAMPLE_LIMIT:]),
        ))
    # 排序：主键"去重人数降序"，同数时"最近一次降序"。两次**稳定**排序就够，不必构造复合键。
    # 比的是 `isoformat()` 字符串而不是日期对象，理由只有一条半：
    # ① `latest_at` 可以是 None。那一列 schema 允许空（`models/share_report.py` 里它没有
    #    `nullable=False`），而 `server_default` 只在 INSERT **省略**这一列时才兜——手工写一条
    #    `NULL` 进去它是照收的。空串比任何时间戳都小，正好把"读不到时间"那一组压到同档最下面；
    #    换成 `datetime.min` 去兜 None 就得再解释"naive 的 min 与 aware 的值能不能比"。
    # ② 那"半条"是：10-10 实测 SQLite 的 `DateTime(timezone=True)` **不存偏移量**——aware 写进去
    #    读回来是 naive（`tests/test_report_ledger.py` 里 `test_现网这一列读回来永远是_naive`
    #    把这一格钉住了）。所以"naive 与 aware 混在一起比会 TypeError"这一档**今天在现网不可达**，
    #    反向验证那一刀报★假绿★报得对，这里留字符串比较不是为它，是为①（以及换库那天不必重想）。
    out.sort(key=lambda g: g.latest_at.isoformat() if g.latest_at else "", reverse=True)
    out.sort(key=lambda g: g.reporters, reverse=True)
    return out
