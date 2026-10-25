"""每人每天的花费闸门（10-25 第八轮审计 M33；表见 `models/daily_usage.py`）。

站长 10-25 拍的档位：**提炼每人每天 50 条、内容检查每人每天 200 次**。数值不在这里写死，
读 `settings.EXTRACT_DAILY_LIMIT`／`SEC_CHECK_DAILY_LIMIT`（`.env` 可抬，`deploy.sh` 每次都念键名）。

三条口径写在这里，因为它们决定了这一条链的行为，而不是实现细节：

1. **超了是拒、不是放行**。内容检查这一族平时的策略是"没检成就放行"（微信侧抖动不该变成
   "用户存不了笔记"），这一条**故意相反**：额度是人打光的，不是接口抖的。在这里放行等于
   把"公开出口没过筛"变成一个人的日常，而 M8 那条已经写过额度被打光之后的形状。
   拒的话术里带档位与"明天"，让人知道这不是坏了。
2. **先加一再判**，不是先查再写。`INSERT ... ON CONFLICT DO UPDATE` 是一条语句，两个并发请求
   各自加一次、各自读到自己的结果，最坏是"第 51 和第 52 条一起被拒"，不会出现"两个都以为
   还剩一条"。同一族的做法见 `routes/notes.py` 的 M6 那一刀（库里唯一索引兜并发 check-then-insert）。
3. **记在门口，不记在花钱那一刻**。一次提炼内部最多打四趟上游（`services/llm.py:MAX_RETRIES`），
   按上游调用次数记账会让人一分钟就撞墙，而那正是分钟闸 × 重试那个洞的成因——按**请求条数**
   记才与"每人每天 50 条"这句话对得上。

⚠ `SEC_CHECK_ENABLED=False` 时**一个字都不记**（测试环境要的是"根本不出网"那条不变量，
而没出网就没有花费；记了会让测试自己把额度打光，症状是一片与本条无关的用例回 429）。
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.daily_usage import DailyUsage

# 东八区日历日：限额要对齐微信侧的"每日"与站长的直觉，用 UTC 会把每天的口子开在早上 8 点。
DAILY_TZ = timezone(timedelta(hours=8))

KIND_EXTRACT = "extract"
KIND_SEC_CHECK = "sec_check"
KINDS = (KIND_EXTRACT, KIND_SEC_CHECK)

# 屏上那两句中文的唯一个出处：接口回 429 时念它，`GET /api/user/usage-today` 也把它回给客户端，
# 所以"限制是多少"这句话只有一份，不会一处写 50、一处写 20。
_SENTENCE = {
    KIND_EXTRACT: "今天的提炼次数用完了（每天 {limit} 条），明天再来",
    KIND_SEC_CHECK: "今天的内容检查次数用完了（每天 {limit} 次），明天再来",
}


@dataclass
class Budget:
    ok: bool          # False＝这一趟不许做（调用方据此回 429）
    kind: str
    used: int         # 含这一次请求自己（先加后判）
    limit: int
    message: str      # ok 时是空串；不 ok 时是可直接念给用户的那句

    @property
    def left(self) -> int:
        return max(self.limit - self.used, 0)


def limit_of(kind: str) -> int:
    if kind == KIND_EXTRACT:
        return settings.EXTRACT_DAILY_LIMIT
    if kind == KIND_SEC_CHECK:
        return settings.SEC_CHECK_DAILY_LIMIT
    raise KeyError(f"未登记的日量种类：{kind!r}（要加一档请先加进 KINDS 与 _SENTENCE）")


def today() -> str:
    return datetime.now(DAILY_TZ).strftime("%Y-%m-%d")


def _upsert(db, user_id: str, day: str, kind: str) -> int:
    """一条语句把这个人今天这一类的计数加一，并回加完之后的值。

    ⚠ 走 SQLite 方言的 `ON CONFLICT DO UPDATE ... RETURNING`：`ux_daily_usage_user_day_kind`
    那枚唯一索引是它的依赖，索引不在就退化成"每次都插新行"⇒ 限额形同不存在。
    本仓只有 SQLite（`DATABASE_URL` 现读），换引擎要先改这一句。
    """
    stmt = (
        sqlite_insert(DailyUsage)
        .values(user_id=user_id, day=day, kind=kind, count=1)
        .on_conflict_do_update(
            index_elements=["user_id", "day", "kind"],
            set_={"count": DailyUsage.count + 1},
        )
        .returning(DailyUsage.count)
    )
    used = int(db.execute(stmt).scalar_one())
    db.commit()
    return used


def charge(user_id: str, kind: str, times: int = 1) -> Budget:
    """记一次（或 times 次）花费，并回这一趟能不能做。

    `times` 是给"一趟请求里真打 N 回平台"那一路用的（截图那一批量最多九张、每张一次送检），
    一次 upsert 加 N 而不是循环 N 趟，省的是九次写。
    """
    limit = limit_of(kind)
    if kind == KIND_SEC_CHECK and not settings.SEC_CHECK_ENABLED:
        # 没出网就没有花费：档位照旧念出来（给界面那一格用），但这一趟不记账、更不拦。
        return Budget(True, kind, 0, limit, "")
    if times <= 0:
        return Budget(True, kind, 0, limit, "")
    db = SessionLocal()
    try:
        day = today()
        for _ in range(times):
            used = _upsert(db, str(user_id), day, kind)
    finally:
        db.close()
    if used > limit:
        return Budget(False, kind, used, limit, _SENTENCE[kind].format(limit=limit))
    return Budget(True, kind, used, limit, "")


def snapshot(user_id: str) -> dict:
    """这个人今天两类各已用／还剩多少（只读，`GET /api/user/usage-today` 吃它）。

    一次查两行、不写库：**读的一路不许有副作用**——客户端进「我的」那一屏不该把额度打掉一条。
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(DailyUsage.kind, DailyUsage.count)
            .filter(DailyUsage.user_id == str(user_id), DailyUsage.day == today())
            .all()
        )
    finally:
        db.close()
    used_by = {k: c for k, c in rows}
    out: dict = {"day": today(), "tz": "UTC+8"}
    for kind in KINDS:
        limit = limit_of(kind)
        used = int(used_by.get(kind, 0) or 0)
        out[kind] = {"used": used, "limit": limit, "left": max(limit - used, 0),
                     "sentence": _SENTENCE[kind].format(limit=limit)}
    return out


def reject_or_none(budget: Budget) -> Optional[object]:
    """把 `ok is False` 翻成 HTTPException(429)。

    单独一枚是因为这一族有六处调用点：话术、状态码、那句"明天"必须逐处一字不差，
    而 429 与 400 在落地页那枚按钮上是两种念法（400 走错误气泡、429 也走，但档位话不能各写一份）。
    """
    if budget.ok:
        return None
    from fastapi import HTTPException

    return HTTPException(status_code=429, detail=budget.message)
