"""现网只读探针：把 `share_reports` 读成一张台账，打印给**人**看。

它存在的理由只有一条：Apple 1.2 要的是"有举报入口**并且有实际处理流程**"，而写入那半
（落地页那张表单）早就上线了，读取那半一直是空的——一张没人能读的表会一直安静地涨，
界面上一个字都不报错。这条探针就是"处理流程"里我们这一侧的眼睛：它不修任何东西，
跑一次给一次读数。

用法（在服务器上跑，那里才读得到 `.env` 与真库）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/读-举报台账.py

**全程只读**：一行不写、一行不删、不建临时行（所以也没有"跑完没清干净"那种行级尾账）。
一个例外要说在前面：SQLite 会把**不存在的库文件建出来**，所以忘了带 `DATABASE_URL` 就跑，
会在部署目录留下一个空库（`app/core/config.py` 那一格的默认值是 `sqlite:///./tmbj.db`）——
无害，但跑之前先核对路径。**没在现网跑过之前，别说这句"现网读数"是你的。**

口径全部来自 `app/services/report_ledger.py`，这份脚本只负责排版、"读没读到"这一层，
以及跑完之后**留一条痕迹**（见结尾那行 `logger.info`）。

为什么要看"零条"那一行：这张表上线以来大概率一直是空的（最后一次现网读数是 §8.185，
2026-10-09 23:45，`share_reports=0`），而"空"有两种——真没人举报，与读不出来（表不在、
迁移没跑、查询被异常吞了）。两者打印成 `0 组` 长得一模一样。所以这一支把**原始行数**与
**台账条数**各读一遍再比，并且在 0 的那一档明写一句话，免得下一次把"我没接上"读成"现网很干净"。

退出码：0 = 读数自洽（包括零条）；1 = 覆盖对不上、表不在、或读取抛异常——这种台账不许当依据。
"""
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect

from app.db.database import SessionLocal
from app.models.share_report import ShareReport
from app.services.report_ledger import SAMPLE_LIMIT, ledger

logger = logging.getLogger("report_ledger_probe")

# 需要人看一眼的门槛：两**人·天**以上。定在 2 的理由写在 `report_ledger` 口径①里，
# 而那一句今天必须连着读：桶的盐按天轮换，所以"同一个人连着两天举报"也会到这里来——
# 这一档宁可多看一眼，但**不许把它读成"两个人"**。
ATTENTION_AT = 2

# 一屏最多打多少组。`SAMPLE_LIMIT` 管每篇的引用条数，这一格管篇数：台账是拿来决定
# "要不要去看这一篇"的，不是拿来把整张表打印进 journald 的。
TOP_GROUPS = 50

# 展示层的卫生：原话是**公开表单**收回来的自由文本，换行能伪造出台账的下一行
# （一条 `...\n2026-10-10 举报人=甲` 读起来就像一条真记录）。控制字符在这里换成可见符号，
# 数据本身交给 `report_ledger` 原样传递——那是显示层的洞，不该靠改数据来堵。
# 为什么**不**照抄 `repr()`（10-10 我原先以为理由是"repr 会把中文转义"，那句是错的：
# Python 3 的 repr 不转义非 ASCII）：真正的差别是 repr 给整句加首尾引号、把换行打成
# `\n` 两个字符（看不出那本来是个换行）、控制字符用 `\x00` 这种人人打得出来的写法。
_CTRL = {"\n": "⏎", "\r": "␍", "\t": "⇥"}


def flat(text: str, limit: int = 120) -> str:
    """把一段外来文本压成一行、限长，并且**让被截断与被转义都看得出来**。

    非 ASCII（中文原话）照原样留着，只动控制字符。控制字符的可见码用 `␀` 打头而不是 `<`：
    `<1b>` 那种写法举报人自己就能打出来，和一个真 ESC 印成一模一样——编码必须**不能被原样
    抄进输入里**，否则"清洗"本身成了新的伪造面。截断补一个 `…`，否则 500 字的话被静默砍成
    120 字，读的人会以为那就是原话的全部。
    """
    out = []
    for ch in text:
        mapped = _CTRL.get(ch)
        if mapped is not None:
            out.append(mapped)
        elif 0x20 <= ord(ch) and ord(ch) != 0x7F:
            out.append(ch)
        else:
            out.append(f"␀{ord(ch):02x}")
    rendered = "".join(out)
    if len(rendered) > limit:
        return rendered[:limit - 1] + "…"
    return rendered


def report(db) -> int:
    tables = set(inspect(db.bind).get_table_names())
    # 两张都要验：`ledger()` 第二发要 join `shares`，只验 `share_reports` 的话半个迁移
    # 会掉进一条 traceback，而这一支是打给**人**看的。
    missing = {"share_reports", "shares"} - tables
    if missing:
        print(f"✗ 库里没有 {'、'.join(sorted(missing))} "
              f"{'这几张表' if len(missing) > 1 else '这张表'}——迁移没跑或连错了库，"
              "下面每一行都没有意义")
        return 1

    raw = db.query(ShareReport).count()
    led = ledger(db)

    print(f"举报台账 · 读于 "
          f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}（下面每一行都是 UTC）")
    print(f"原始行数 {raw} · 台账条数 {len(led)}")

    # 覆盖一致是这支探针唯一真正的"判据"：台账把每一行都归进了某一组，一行不丢。
    covered = sum(g.total for g in led)
    if covered != raw:
        print(f"✗ 覆盖对不上：台账归了 {covered} 行，数到 {raw} 行——两者不等就先别信这本台账"
              "（两发的读数之间落进新举报也会这样，不一定是漏）")
        return 1
    if {g.token for g in led} != {r[0] for r in db.query(ShareReport.token).distinct()}:
        print("✗ 分组的 token 集合与库里的不一致（归组漏了或多算了）")
        return 1

    if raw == 0:
        print("★ 现网零条举报。这句话的意思是「那张表单上没人写过东西」，"
              "不是「读取侧接上了但没数据」也不是「坏了」——上面那两行都是 0 才叫一致。")
        print("下面每一档都是 0，属于同一条读数的展开，不另计覆盖。")
        logger.info("举报台账快照 原始行数=0 组=0 需关注=0 最高人天=0")
        return 0

    states: dict[str, int] = {}
    for g in led:
        states[g.page_state] = states.get(g.page_state, 0) + 1
    nulls = db.query(ShareReport).filter(ShareReport.reporter_bucket.is_(None)).count()
    multi = [g for g in led if g.reporter_days >= ATTENTION_AT]
    print(f"页面状态：" + " · ".join(f"{k} {v}" for k, v in sorted(states.items())))
    print(f"bucket 为 NULL 的行：{nulls}（这一档每行各算一人；现网那一路走不到，见 report_ledger 口径②）")
    print(f"需要人看一眼的（人·天 ≥ {ATTENTION_AT}）：{len(multi)} 篇")
    print()
    print(f"从上往下读，最上面那篇是最多人在意的（原话每篇最多 {SAMPLE_LIMIT} 条）：")
    for g in led[:TOP_GROUPS]:
        # token 也走一道 flat()：它不是外来文本，但它决定哪几行并成一档，读的人得看得出边界。
        head = (f"{flat(g.token, 40)} · {g.page_state} · 条数 {g.total} · 人·天 {g.reporter_days}"
                f" · 最近 {g.latest_at.strftime('%Y-%m-%dT%H:%M:%SZ') if g.latest_at else '读空'}")
        print("  " + head)
        # 理由按条数降序而不是字母序：这一栏的用处是"先处理哪一类"，不是列清单。
        reasons = "、".join(f"{flat(k, 32)} {v}"
                            for k, v in sorted(g.reasons.items(), key=lambda kv: (-kv[1], kv[0])))
        if reasons:
            print(f"    理由：{reasons}")
        for note in g.samples:
            print(f"    原话：{flat(note)}")
        if len(g.samples) < g.total:
            print(f"    （另有 {g.total - len(g.samples)} 条没写补充说明，或原话超出上面那 "
                  f"{SAMPLE_LIMIT} 条）")
    if len(led) > TOP_GROUPS:
        print(f"…另有 {len(led) - TOP_GROUPS} 组没打印（都在台账里，按条数算着；要通读就直接查库）")

    # 只进日志，不打 detail：这一行就是"实际处理流程"里我们能出示给审核看的时间戳序列。
    # 没有它，这张表照样安静地涨，而"有人定期看"永远只是纸面上的一句话。
    logger.info("举报台账快照 原始行数=%d 组=%d 需关注=%d 最高人天=%d",
                raw, len(led), len(multi), max((g.reporter_days for g in led), default=0))
    return 0


def main() -> int:
    db = SessionLocal()
    try:
        return report(db)
    except Exception as exc:  # noqa: BLE001 —— 这一支是打给人看的，不许把 traceback 当输出
        # 只打类型与截断后的消息：整条异常字符串会带上 SQL 与绑定参数，而绑定参数里
        # 有举报人的自由文本。
        print(f"✗ 读取失败：{type(exc).__name__} {flat(str(exc), 200)}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
