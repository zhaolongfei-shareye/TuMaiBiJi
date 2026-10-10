"""举报台账的**读取侧**——`probes/读-举报台账.py` 拿它出报告，别的什么都不是它的调用方。

为什么必须有这一支：`routes/landing.py` 写举报那一段的注释里早就写着"真正要补的是这张表的
读取侧（按 bucket 去重）"，而这句话到今天只做到了**写入**那一半。一张没人能读的举报表比没有
更坏：Apple 1.2 要的是"有举报入口**并且能处理**"，而"能处理"的证据是有人定期看这张表；
表一直在安静地涨，界面上一个字都不报错，这就是那种"改坏了没有任何现网症状"的洞。

四条口径，每条都有理由，不是随手写的：

① **同一个人在同一篇上、同一天里刷 N 次，折成一档**——按 `reporter_bucket` 去重。这张表单是
公开的、限流是 6/小时按来访者 IP，去重之后那个数字回答的是"**几个人的哪几天**举报过这篇"，
而不是"几个人"：`_bucket` 的盐**按天轮换**（`YYYYMMDD`），所以同一个人今天一发、明天再一发会
落进两个桶。这一格读成"人·天"是刻意的（宁可为"一个人连着两天盯着这篇"多看一眼），
但**不许在文档或打印里把它叫成人数**——那是 10-10 那轮审计抓出来的原话。

② **`reporter_bucket` 为 NULL 的每一条各算一个人**。实现按"宁可多算，不可漏算"处理是对的，而
这个理由**从 10-10 起才真的成立**：写入侧 `_bucket` 读的是 ASGI 给的客户端地址本身，拿不到就落
NULL（拍板 #184 甲）。在那之前它读的是 `slowapi.util.get_remote_address`，那一层拿不到地址时返回
字面量 `"127.0.0.1"`——"我们不知道来的是谁"的那些访客恰恰被折进**同一个桶**，正是这一条口原本要避开
的那种少报。今天 NULL 有两种出处：写入侧确实拿不到地址，或手工／迁移插的行；两种都照"各算一人"处理。

③ **撤掉的码照样出现在台账上，并标出页面状态四档**。注意理由别写反：`submit_report` 第一句
就是 `active_share_by_token`，撤掉、过期、不存在三种一律 404，**撤了之后新举报收不进来**
（`tests/test_landing_page.py` 就钉着那个 404）。所以"已撤回"这一档来自**先举报、后撤回**那一路，
不是"撤了还收得到"。`share_reports` 只挂 token 不挂外键仍然成立：作者撤码、删笔记都不该把
已经收到的举报记录一起带走。按 `is_active` 筛的话那一类行会整批消失，台账就变成"只看还开着的那些"。

④ **状态那一档问的是"此刻这页对外开着吗"，口径不许在这里另写一份**：`is_active` 加
`services/sharing.is_expired_at`，与公开页同一个出处（那一格自己的注释写着"判过期时间的口径
必须只有一份"，而现在确实只有一份：`is_expired(share)` 是它的 ORM 外衣，这一支拿的是标量）。
只看 `is_active` 会把一张早过期的码打成"公开中"——那种读数比缺读数更坏。

排序按**人·天档**降序、同档按最近一次降序：台账是给人从上往下读的，最多人在意的这篇必须在
第一屏，而不是最新的那篇在第一屏。

时间戳一律先过 `_instant()` 再比，理由见那一段——这一列里 naive 与 aware **两种形状都真能出现**
（10-10 实测，两件事都不是常识：绑定侧丢偏移、结果侧认偏移）。

刻意**不**把 `share_reports.hidden` 读进台账：模型注释写的是"先隐藏待核"，可全仓没有任何一条
路径**读**它（写入侧只由模型的 Python 默认置 0，`tests/test_landing_page.py` 反过来钉着
"一条举报不许把它置真"）。把一列没人消费的开关抄进报告，等于给一个没接线的开关画仪表盘。
待拍 #183 已按**丙**收口（10-10 拍板）：这一列留着当"人工处置"的实记落点，**不**接线、
不在台账上给它画读数——真要启用，得先有一条人写下的处置动作把它置真，那时台账再一起改。

分档按 `token` 的**逐字节**等值（SQLite 的 `=` 是 BINARY）：`AbC`、`abc`、`AbC ` 三种写法是三档。
现网造不出这种差异（写入侧存的永远是 `share.token` 那一个规范值），但手工插的行会分成三档，
而三档的条数加起来仍然等于库里行数，所以**覆盖那道闸门抓不到它**——打印侧因此把 token 也走
一道 `flat()`，让肉眼看得出边界。
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.share import Share
from app.models.share_report import ShareReport
from app.services.sharing import is_expired_at

# 页面状态的四种取值。写成常量而不是散在字符串里：判据要能引用同一个值，
# 否则改一个字面就把一条断言变成"永远绿"。
PAGE_LIVE = "公开中"
PAGE_REVOKED = "已撤回"
PAGE_EXPIRED = "已过期"
PAGE_NO_CODE = "码不存在"

# 每篇最多带几句举报人原话。数字定成 3 不是拍脑袋：台账一屏要放得下十几篇，
# 每篇贴五段长文就变成把整张表打印一遍——那已经有数据库客户端了。
SAMPLE_LIMIT = 3


def _instant(value: datetime | None) -> str:
    """把一列时间戳换成**永远能比、且比的是同一个瞬间**的键。

    两条 10-10 实测出来的平台事实，缺一条这个函数就说不通：
    ① **绑定侧丢偏移量、并且不换算**：`DateTime(timezone=True)` 在 SQLite 上把
       `11:00+08:00` 存成 `'2026-10-10 11:00:00'`（与 `03:00Z` 是同一瞬间，却差 8 小时），
       读回来 `tzinfo=None`。所以走 ORM 写的那一路，同一瞬间能落成两个不同的 naive 值。
    ② **结果侧认偏移量**：同一列里若有手工/迁移插的 `'…+08:00'` 那种字符串，读回来是
       **aware**。naive 与 aware 混进同一次比较会当场 `TypeError`——抛点不在排序那两行，
       而在取"最近一次"的那次 `max()`。

    口径：naive 按现网的写入侧本来就当 UTC（`func.now()` 给的就是 UTC），aware 先换算成 UTC
    再脱掉 tzinfo。返回值给 `max(key=…)` 与 `sort(key=…)` 用，两处**共用这一个出处**。
    None（那一列 schema 允许空）落成空串，比任何时间戳都小，于是排在同档最下面。
    """
    if value is None:
        return ""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.isoformat()


@dataclass(frozen=True)
class ReportGroup:
    token: str
    total: int
    # 不是"几个人"，是"几个人·几天"——见模块 docstring 口径①。
    reporter_days: int
    # 状态**必填**：漏传不许默认成"公开中"那种最乐观的读数。
    page_state: str
    reasons: dict[str, int] = field(default_factory=dict)
    latest_at: datetime | None = None
    # 举报人自己写的那几句话（`detail` 那一列，空白的不要），最多 `SAMPLE_LIMIT` 条、取最后那几条。
    # 为什么在服务侧而不是让脚本自己去查：那样等于把"按 token 归组"这件事在两个地方各写一遍——
    # 两处一旦分叉，台账的数字与引用的原话就来自不同口径，而那种错看不出来。
    # "最后几条"按**写入顺序**（`id`）而不是按 `created_at`：现网那一列走 `func.now()`，
    # SQLite 给的那串只到**秒**，同一秒里的三发时间上分不出先后，`id` 分得出。
    # 原话**不在这里**清洗换行：这一支交出去的是数据，换行属于展示层，清洗放在脚本里
    # （一条带换行的原话能把台账的下一行伪造成任意内容——那是显示层的洞，不该靠改数据来堵）。
    samples: tuple[str, ...] = ()


def ledger(db: Session) -> list[ReportGroup]:
    """按 token 归组的举报台账，最多人·天的排最前。**只读**，一行都不写。"""
    # 一发 LEFT JOIN 而不是"全表 + 按 token 的 IN 列表"两发，三个理由各占一份：
    # ① `IN` 那一路会把不同 token 的个数直接当绑定参数个数用——SQLite 3.45 默认上限实测
    #    32766 通过、32767 抛 `too many SQL variables`，一张涨了几万行的表会把探针打崩；
    # ② 两发查询中间落进一发新举报的话，`raw` 与台账条数来自**不同时刻**，覆盖那道闸门会
    #    假报"这本台账缺一页"；③ `shares.token` 有唯一索引（`ix_shares_token`，`unique=True`），
    #    所以 join 不会把一行举报复制成两行——这一点如果哪天变了，这里就是第一个要看的地方。
    rows = db.query(
        ShareReport.token, ShareReport.reason, ShareReport.reporter_bucket,
        ShareReport.created_at, ShareReport.detail, Share.is_active, Share.expires_at,
    ).outerjoin(Share, Share.token == ShareReport.token).order_by(ShareReport.id).all()
    if not rows:
        return []

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
        # 状态取这一组里**第一行 join 到的那两格**（`token` 唯一 ⇒ 每组至多一条 share；
        # join 不上 = 码从来没存在过，或被删笔记那一路带走了）。
        # 这里刻意只取标量：把 `Share` 实体混进 `Query` 的列里，SQLAlchemy 2.0.36 实测会在
        # **整行相等**时把多行折成一行（同一篇三行举报的 token 与 join 到的那条 share 都相等
        # ⇒ 折成一行、`total` 读出 1；本批第一次实跑就是这么撞上的）。多选一列逐行不等的标量
        # 就不折，但这里没有这样的列可用（`detail`/`bucket`/`created_at` 三行可以全等），所以取标量。
        # 注：`session.execute(select(...))` 那一套不折，这是 legacy `Query` 独有的行为。
        active, expires_at = items[0][5], items[0][6]
        if active is None:
            state = PAGE_NO_CODE
        elif not active:
            state = PAGE_REVOKED
        elif is_expired_at(expires_at):
            state = PAGE_EXPIRED
        else:
            state = PAGE_LIVE
        out.append(ReportGroup(
            token=token,
            total=len(items),
            reporter_days=len(named) + unknown,
            page_state=state,
            reasons=reasons,
            latest_at=max((r[3] for r in items), key=_instant),
            samples=tuple(noted[-SAMPLE_LIMIT:]),
        ))
    # 排序：主键"人·天档降序"，同档时"最近一次降序"。两次**稳定**排序就够，不必构造复合键。
    # 比的是 `_instant()` 出来的字符串而不是日期对象——理由全在那一段 docstring 里
    # （这一列 naive 与 aware 两种形状都真能出现，裸比会 TypeError）。
    out.sort(key=lambda g: _instant(g.latest_at), reverse=True)
    out.sort(key=lambda g: g.reporter_days, reverse=True)
    return out
