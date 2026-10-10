"""现网维护脚本：按保留期清 `share_reports` 里那些过期的举报行。

**默认只算不删**（dry-run）。这条脚本唯一会写库的分支是显式带 `--执行` 的那一条，理由在
`app/services/report_retention.py` 口径③：删除不可逆，而这张表是"某人写过什么举报"的唯一记录。

用法（在服务器上跑，那里才读得到 `.env` 与真库）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/清-过期举报.py           # 只报告
    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/清-过期举报.py --执行     # 真删

退出码：0 = 两次读数都自洽且对得上；1 = 表不在、读取抛异常、**删的条数与名单条数不一致**、
或任一份读数内部对不上（逐行数到的与独立 `COUNT` 不等＝并发写或读取被截断；三档加起来与逐行数到的
不等＝分类掉了一行），或删完之后到期那一档还有剩余、无时间戳那一档反而**变少**了。
"变多"不算错：那张表是公开表单在写的，删除之后又有人举报是正常事，报成"删错了"才是假话。
这些是这条脚本自己的对账：删了却没删干净，比不删更坏，因为屏幕已经打了一句"已删除 N 条"。

`created_at` 为空的行**一条都不删**，只报数量（口径②）。

**"打出来的档"与"走的分支"必须是一个出处**：`run()` 只认参数 `execute`，标题那行和真删那个
分支读的都是它。第五轮审计实测过分裂的写法长什么样——把 `if not EXECUTE:` 单独改坏之后，
屏幕上照打"dry-run：一行都不删"，盘上照删两行，退出码 0，而钉默认档的那条尺子仍然绿。

**复跑那一份必须过同一道闸**（10-10 第六轮审计抓的）：原来只有**删之前**那份读数做自洽检查，
删完之后那份只看了"到期还剩几行"。实测把提交之后的 `after` 弄成自相矛盾（总行数 3、三档只有 2），
脚本把那三个数打出来之后**退出码 0**——文件头那句"1 = 三档对不上总行数"当时只兑了前一遍。
现在两次读都走 `selfcheck()`；`reconcile()` 只管删前／删后那两件事（到期必须归零、无时间戳那一档
不许变**少**），方向钉死：那一档变多是别人新写的，不许报成"删错了"。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect

from app.db.database import SessionLocal, engine
from app.services.report_retention import (RETENTION_DAYS, delete_expired, plan_expired,
                                           reconcile, selfcheck)

EXECUTE = "--执行" in sys.argv[1:]


def run(db, execute: bool) -> int:
    """跑一遍：报告（`execute=False`）或真删（`execute=True`）。返回退出码。"""
    p = plan_expired(db)
    print(f"清-过期举报 · {'执行：会真删' if execute else 'dry-run：一行都不删'}")
    print(f"保留期 {RETENTION_DAYS} 天 · 截止 {p.cutoff.isoformat()} · 库里总行数 {p.total}")
    print(f"到期该删 {len(p.expired_ids)} 行 · 无时间戳保留 {p.undated} 行 · "
          f"未到期保留 {p.kept} 行")
    bad = selfcheck(p)
    for msg in bad:
        print(f"✗ {msg}")
    if bad:
        print("这一发一行都不动：先重跑一次拿个稳的读数，再来决定要不要删。")
        return 1
    if not execute:
        print("一行都没删。要真删得显式带 --执行；先拿这份读数去核对再决定。")
        return 0
    if not p.expired_ids:
        print("到期 0 行，没什么可删。")
        return 0

    deleted = delete_expired(db, p.expired_ids)
    if deleted != len(p.expired_ids):
        # 名单 3 条、真删 2 条：要么有一行已经不在库里，要么分批有一批没删着。两种都不能算删干净。
        print(f"✗ 名单 {len(p.expired_ids)} 条而数据库报删除 {deleted} 条——没有提交，先查这一发")
        return 1
    db.commit()
    print(f"已删除 {deleted} 行（提交完成）")

    after = plan_expired(db)
    # 复跑那一份过的必须是**同一道闸**：只检查"到期还剩几行"是不够的——第六轮审计实测过，
    # 删除提交之后 `after` 内部就自相矛盾（总行数 3、三档只有 2）时，原来那版照退 0。
    bad = selfcheck(after) + reconcile(p, after)
    for msg in bad:
        print(f"✗ {msg}")
    if bad:
        print(f"⚠ 「已删除 {deleted} 行」那一句已经提交、撤不回来——这一发退出码是 1，要人工再对一遍")
        return 1
    grew = after.undated - p.undated
    extra = f"（比删之前多 {grew} 行：那是删除之后新写进来的举报，不是这一档被删了）" if grew else ""
    print(f"复跑对账：总行数 {after.total} · 到期 0 · 无时间戳 {after.undated}{extra} · "
          f"未到期 {after.kept}")
    return 0


def main() -> int:
    tables = set(inspect(engine).get_table_names())
    if "share_reports" not in tables:
        print(f"✗ 库里没有 share_reports 这张表（现读到的是 {sorted(tables) or '一张空库'}）")
        print("  先确认 DATABASE_URL 指向哪个库、迁移跑过没有——这个退出码不是「现网很干净」。")
        return 1
    db = SessionLocal()
    try:
        return run(db, EXECUTE)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
