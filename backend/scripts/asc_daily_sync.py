#!/usr/bin/env python3
"""每日拉一遍 Apple ASC 报表（sales＋analytics），cron 调，不走 HTTP 不带管理票。

Apple 的 sales 日报在报告日后一到两天才齐，analytics 首批实例要上架后 24–48 小时，
所以这一趟多半天回 0／没数，属正常；结果两头从不抛，任何一头红了留在 errors[] 里。
"""
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.db.database import SessionLocal
from app.services import asc_reports


def _db_file() -> str:
    """配置里 sqlite 串的库文件绝对路径；非 sqlite 回空串（postgres 没这个形状的风险）。"""
    url = settings.DATABASE_URL
    if not url.startswith("sqlite"):
        return ""
    return os.path.abspath(url.split("sqlite:///", 1)[1])


def main() -> int:
    # 写之前的两道自检（Z61 同型，第十一轮 W13）：相对路径在错的 cwd 跑会顺手新建一只
    # 空库，把"拉到了"记进一只没人读的库——先认盘上这只库，认不出就一行不写地退。
    db_file = _db_file()
    if db_file:
        if not os.path.isfile(db_file):
            print(f"!! 盘上没有这只库（{db_file}）⇒ 什么都不写就退出；"
                  "cron 里跑的查一眼工作目录是不是项目根")
            return 1
        ro = sqlite3.connect(Path(db_file).as_uri() + "?mode=ro", uri=True)
        try:
            has_table = ro.execute(
                "select name from sqlite_master where type='table' and name='asc_daily'"
            ).fetchone()
        finally:
            ro.close()
        if has_table is None:
            print(f"!! {db_file} 里没有 asc_daily 这张表 ⇒ 这只库不像装过迁移的那只，"
                  "什么都不写就退出")
            return 1
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
