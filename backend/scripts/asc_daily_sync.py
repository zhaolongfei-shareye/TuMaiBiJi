#!/usr/bin/env python3
"""每日拉一遍 Apple ASC 报表（sales＋analytics），cron 调，不走 HTTP 不带管理票。

Apple 的 sales 日报在报告日后一到两天才齐，analytics 首批实例要上架后 24–48 小时，
所以这一趟多半天回 0／没数，属正常；结果两头从不抛，任何一头红了留在 errors[] 里。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.database import SessionLocal
from app.services import asc_reports


def main() -> int:
    if not asc_reports.configured():
        print("asc 五栏没配齐，这一趟什么都不拉")
        return 0
    db = SessionLocal()
    try:
        result = asc_reports.sync(db)
    finally:
        db.close()
    sales = result.get("sales") or {}
    analytics = result.get("analytics") or {}
    print(
        "sales: pulled={pulled} no_sales={no_sales} errors={se} | "
        "analytics: instances={ip} state={st} errors={ae} | fetched_at={at}".format(
            pulled=sales.get("pulled"),
            no_sales=sales.get("no_sales"),
            se=len(sales.get("errors") or []),
            ip=analytics.get("instances_pulled"),
            st=analytics.get("state"),
            ae=len(analytics.get("errors") or []),
            at=result.get("fetched_at"),
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
