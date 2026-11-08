"""响应里的时间戳统一带时区标记。

库里存的是 UTC naive 串（SQLite 的 `CURRENT_TIMESTAMP` 就是 UTC，`DateTime(timezone=True)`
在 SQLite 上并不会真的带回时区），FastAPI 直接序列化出来是 `2026-09-22T10:17:52` 这种
**不带任何时区信息**的形式。小程序那端 `new Date(串)` 对这种形式的规则是"按本地时区解释"
（ECMAScript 明确规定无偏移的 date-time 走本地），于是北京时间 18:17 存进去的笔记显示成
10:17，**凌晨 0–8 点存的那批日期会整体退到前一天**——列表方块上的 `MM-DD`、页头的
"本周/本月"统计、详情页到分钟的时间、卡片图上的日期全部跟着错。

所以出口统一补成 `...Z`，让对端拿到的是无歧义的瞬时点，本地化交给客户端。
"""
from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def _as_utc_iso(value):
    if value is None or isinstance(value, str):
        # 已是字符串就原样出去：库里读出来的是 naive datetime，字符串只可能来自
        # 已经处理过的路径或测试桩，这里不做二次猜测
        return value
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


UTCDatetime = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str, when_used='json')]
UTCDatetimeOrNone = Annotated[datetime | None, PlainSerializer(_as_utc_iso, return_type=str, when_used='json')]
