"""现网维护脚本：按保留期清 `share_reports` 里那些过期的举报行。

**默认只算不删**（dry-run）。这条脚本唯一会写库的分支是显式带 `--执行` 的那一条，理由在
`app/services/report_retention.py` 口径③：删除不可逆，而这张表是"某人写过什么举报"的唯一记录。

用法（在服务器上跑，那里才读得到 `.env` 与真库）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/清-过期举报.py           # 只报告
    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/清-过期举报.py --执行     # 真删

退出码：0 = 读数自洽（包括零条）；1 = 表不在、读取抛异常、或**删完之后到期那一档居然还有剩余**。
最后那一条是这条脚本自己的对账：删了却没删干净，比不删更坏，因为屏幕已经打了一句"已删除 N 条"。

`created_at` 为空的行**一条都不删**，只报数量（口径②）。所以"库里 40 行、到期 12 行、无时间戳 3 行"
这三句加起来必须等于 40，脚本把这条守恒写在末尾那次复跑上。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect

from app.db.database import SessionLocal, engine
from app.services.report_retention import RETENTION_DAYS, delete_expired, plan_expired

EXECUTE = "--执行" in sys.argv[1:]
MODE = "执行：会真删" if EXECUTE else "dry-run：一行都不删"


def main() -> int:
    tables = set(inspect(engine).get_table_names())
    if "share_reports" not in tables:
        print(f"✗ 库里没有 share_reports 这张表（现读到的是 {sorted(tables) or '一张空库'}）")
        print("  先确认 DATABASE_URL 指向哪个库、迁移跑过没有——这个退出码不是「现网很干净」。")
        return 1

    db = SessionLocal()
    try:
        p = plan_expired(db)
        print(f"清-过期举报 · {MODE}")
        print(f"保留期 {RETENTION_DAYS} 天 · 截止 {p.cutoff.isoformat()} · 库里总行数 {p.total}")
        print(f"到期该删 {len(p.expired_ids)} 行 · 无时间戳保留 {p.undated} 行 · "
              f"未到期保留 {p.kept} 行")
        if p.total != len(p.expired_ids) + p.undated + p.kept:
            print(f"✗ 三档加起来不等于总行数（{len(p.expired_ids)}+{p.undated}+{p.kept}"
                  f"≠{p.total}）——这份读数别信")
            return 1
        if not EXECUTE:
            print("一行都没删。要真删得显式带 --执行；先拿这份读数去核对再决定。")
            return 0
        if not p.expired_ids:
            print("到期 0 行，没什么可删。")
            return 0

        deleted = delete_expired(db, p.expired_ids)
        db.commit()
        print(f"已删除 {deleted} 行（提交完成）")

        after = plan_expired(db)
        if after.expired_ids:
            print(f"✗ 删完之后到期那一档还剩 {len(after.expired_ids)} 行——"
                  f"那句「已删除 {deleted} 行」不能算完")
            return 1
        if after.undated != p.undated:
            print(f"✗ 无时间戳那一档从 {p.undated} 变成 {after.undated}——"
                  "这一档说好一条都不删的")
            return 1
        print(f"复跑对账：总行数 {after.total} · 到期 0 · 无时间戳 {after.undated} · "
              f"未到期 {after.kept}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
