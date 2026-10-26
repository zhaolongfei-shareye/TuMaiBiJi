"""后台「用量看板」这一栏的读数（站长 10-25「你在后台做个用量看板，实时提供用量数据」）。

一条链上两个产品，这一栏把它们**分成两块各读各的**，因为它们的付费形状相反：

- **图麦笔记小程序**：提炼走混元，扣的是云开发那份**成长计划免费 Token 包**（站长 10-25 原话
  「目前小程序走混元是免费的」）⇒ 这一侧**不产生现金**，看板给的是"今天打了多少条"这种计数，
  数来自我们自己那张 `daily_usage`（M33 那一刀落的账），不来自任何外部接口。
- **RoamMark（iPhone 版）**：走 DeepSeek，**那一条才是付费的** ⇒ 这一侧给的是**余额**，
  现读上游（`GET {DEEPSEEK_BASE_URL}/user/balance`，官方文档
  `api-docs.deepseek.com/zh-cn/api/get-user-balance`）。

⚠ 官方**只有"查询余额"这一个口，没有"按天用量／账单明细"接口**（10-25 现读文档确认，字段只有
`is_available` 与 `balance_infos[{currency,total_balance,granted_balance,topped_up_balance}]`）。
所以这一栏**不画消耗曲线**：曲线只能靠我们按时采样余额再取差值，那是另一件事（要新表、要定时任务），
没在站长这句话里，不给他造。他要看 token 明细只有控制台那一处。

三条纪律：

1. **只读，一个字节都不写。** 这一栏不进 `daily_usage`：那两张档名叫 `extract`／`sec_check`，
   管理员看一眼余额既不是提炼也不是送检，记进去只会把"真人今天用了多少"混进"我点开过几眼"。
2. **值只进不出**（同 `services/service_secrets.py` 第 1 条）：回体里只有长度与指纹，
   上游回的非 200 也只转成状态码与一句话，**不把它可能带回来的任何片段往外递**。
3. **上游红了不许把整栏带走**：DeepSeek 那一块自己吞错，读不到就念"读不到"，
   小程序那一块照常出数。这一栏是给人看数用的，一处网络抖动不该让它变成空白页。
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.daily_usage import DailyUsage
from app.services import daily_budget, service_secrets
from app.services.llm import key_usable

# 余额那一发的上限：这是"人点开一栏等一个数"，不是业务链路，所以给一档比提炼（90 秒）
# 短得多的顶。超了就念"上游没回话"，别让人对着转圈的页面猜。
BALANCE_PATH = "/user/balance"
BALANCE_TIMEOUT = 8.0

# 名字只许是 `DEEPSEEK` 这一个：库里那一行（后台「密钥配置」存的）、`settings.DEEPSEEK`
# （兜底那一路）、`service_secrets.CONSUMED_NAMES` 与 `spot_draft.py` 全都是同一个串。
# ⚠ 现网 `.env` 里那行 `DEEPSEEK_API_KEY` 在这一路**不吃**——吃两个名字就有两处真相，
# 而"删掉库里那一行会回到哪一层"那句话也就没法在屏上说对。
SECRET_NAME = "DEEPSEEK"

# 「今天转发了几条景点初稿」这一档的名字。**本栏只读它**——写它的那一笔在 RoamMark 那条链里
# （`services/spot_draft.py` 与他们那批 `main.py` 同批上），在这一趟里加就等于碰另一路未上现网的文件。
# 所以今天现网读它必然是空，屏上因此念"这一档还没开始记"而不是 0（见 `board` 那一句）。
DRAFT_KIND = "roammark_draft"


def draft_calls(db: Session, day: str) -> int:
    return sum(int(row.count or 0) for row in
               db.query(DailyUsage).filter(DailyUsage.kind == DRAFT_KIND, DailyUsage.day == day).all())


def _key_for_balance() -> str:
    """现在这一刻生效的那把钥；空串＝不是一把能拿去打的钥。

    占位符判的是**共用那一句** `llm.key_usable()`：现网那一把今天正是占位符，把它当"能打的钥"
    送出去只会换来一次 401，屏上念出来的"这把钥打不通"就与真打不通分不开了。
    `spot_draft.py:current_key()` 那一侧吃的也是同一句（`from app.services.llm import key_usable`），
    所以"这一发打不打"在两条链上不会有第二种读法。
    ⚠ 这里**故意不 import `spot_draft`**：那只文件今天还没上现网（10-25 收尾对账：现网 `main.py`
    里 roammark 命中 0 处），import 它就把"本线只动三只文件"变成"必须跟他们那批一起传"
    ——同一个坑记在 `docs/版本与发布现状.md` 第三节（`main.py` 与那两只路由必须同批）。
    """
    raw = (service_secrets.resolve(SECRET_NAME, getattr(settings, SECRET_NAME, "")) or "").strip()
    return raw if key_usable(raw) else ""


def _key_shape() -> Dict[str, Any]:
    """钥的**形状**读数（有没有一把能用的、多长、哪一把），值本身一次都不出去。

    `key_present` 念的是"过没过 `key_usable()`"，不是"库里有没有那一行"：现网那一行今天有值、
    但是占位符，屏上要说"还没有一把能用的钥"，不能念成"钥在（长度 24）"。
    """
    raw = _key_for_balance()
    return {
        "key_present": bool(raw),
        "key_length": len(raw),
        "key_fingerprint": service_secrets.fingerprint(raw) if raw else None,
        "raw": raw,
    }


def deepseek_balance() -> Dict[str, Any]:
    """现读一次 DeepSeek 账户余额。任何失败都只改 `state`，不改这一格的形状。"""
    shape = _key_shape()
    raw = shape.pop("raw")
    board: Dict[str, Any] = dict(shape)
    board["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    board["balances"] = []
    if not raw:
        board["state"] = "no_key"
        board["sentence"] = ("还没有一把能用的钥：后台「密钥配置」里那一行 DEEPSEEK "
                             "要么是空的、要么仍是占位符")
        return board

    url = (settings.DEEPSEEK_BASE_URL or "https://api.deepseek.com").rstrip("/") + BALANCE_PATH
    try:
        resp = httpx.get(url, headers={"Authorization": "Bearer " + raw},
                         timeout=httpx.Timeout(BALANCE_TIMEOUT, connect=4.0))
    except httpx.TimeoutException:
        board["state"] = "timeout"
        board["sentence"] = f"上游 {int(BALANCE_TIMEOUT)} 秒内没回话，余额没读到"
        return board
    except Exception as exc:
        board["state"] = "unreachable"
        board["sentence"] = f"这一发没打出去（{type(exc).__name__}）"
        return board

    if resp.status_code != 200:
        # 不转述回体：那里面可能夹着账户信息，而这一栏的读者是浏览器。
        board["state"] = "rejected"
        board["status_code"] = resp.status_code
        board["sentence"] = ("这把钥打不通（上游回 " + str(resp.status_code) + "），余额没读到"
                             if resp.status_code in (401, 403)
                             else f"上游回 {resp.status_code}，余额没读到")
        return board

    body = resp.json() if _is_json(resp) else {}
    infos = body.get("balance_infos") or []
    board["state"] = "ok"
    board["is_available"] = bool(body.get("is_available"))
    board["balances"] = [_balance_row(i) for i in infos if isinstance(i, dict)]
    board["sentence"] = _balance_sentence(board)
    return board


def _is_json(resp: httpx.Response) -> bool:
    return "json" in (resp.headers.get("content-type") or "").lower()


def _balance_row(info: Dict[str, Any]) -> Dict[str, Any]:
    """官方那四栏原样收成数；缺哪一栏就是 None，不补 0（补 0 会把"没报"念成"是零"）。

    ⚠ 官方把金额回成**字符串**（现网 10-26 现读 `total_balance='11.02'`），所以这一把必须吃
    数字串；只认 int/float 的话症状是"接口 200、余额明明在、屏上念「共 —」"。
    """
    def num(key: str):
        value = info.get(key)
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except ValueError:
                return None
        return None
    return {
        "currency": (info.get("currency") or "").strip() or None,
        "total": num("total_balance"),
        "granted": num("granted_balance"),
        "topped_up": num("topped_up_balance"),
    }


def _balance_sentence(board: Dict[str, Any]) -> str:
    """把那一堆数念成一句中文。**赠金与充值分开说**：官方口径是两者同时在的时候先扣赠金，
    所以"还剩多少钱"要能看出哪一部分是会过期的。"""
    rows: List[Dict[str, Any]] = board.get("balances") or []
    if not rows:
        return "上游回了 200，但余额那一列是空的"
    parts = []
    for row in rows:
        parts.append(f"{row['currency'] or '未注明货币'} 共 {fmt_money(row['total'])}"
                     f"（赠金 {fmt_money(row['granted'])}／充值 {fmt_money(row['topped_up'])}）")
    head = "可用" if board.get("is_available") else "上游说这个账户当前不可用"
    return head + "：" + "；".join(parts)


def fmt_money(value) -> str:
    return "—" if value is None else f"{value:.4f}".rstrip("0").rstrip(".")


def mini_program(db: Session, days: int = 14) -> Dict[str, Any]:
    """小程序这一侧的计数：今日各档用了多少、最近这段一天多少、几个真人参与的。

    数据源只有一处＝`daily_usage`（M33 落的账）。⚠ 这一张表**分不清验收号与真人**，
    所以这里不做"剔除测试号"那种猜测——`daily_usage` 里今天有什么就念什么，
    页面那一侧必须把"含验收自己写的行"这句话一起念出来（钉在 `tests/test_用量看板.py`）。
    """
    today = datetime.now(daily_budget.DAILY_TZ).strftime("%Y-%m-%d")
    window_start = (datetime.now(daily_budget.DAILY_TZ) - timedelta(days=days - 1)).strftime("%Y-%m-%d")

    per_day: Dict[str, Dict[str, int]] = {}
    by_kind: Dict[str, Dict[str, Any]] = {
        kind: {"used": 0, "limit": daily_budget.limit_of(kind), "people": 0} for kind in daily_budget.KINDS
    }
    rows = (db.query(DailyUsage)
              .filter(DailyUsage.day >= window_start, DailyUsage.day <= today)
              .order_by(DailyUsage.day).all())
    for row in rows:
        bucket = per_day.setdefault(row.day, {kind: 0 for kind in daily_budget.KINDS})
        if row.kind in bucket:
            bucket[row.kind] += int(row.count or 0)
        if row.kind in by_kind:
            by_kind[row.kind]["used"] += int(row.count or 0)
            if row.day == today:
                by_kind[row.kind]["today"] = by_kind[row.kind].get("today", 0) + int(row.count or 0)
    for kind in daily_budget.KINDS:
        by_kind[kind].setdefault("today", 0)
        by_kind[kind]["people"] = (db.query(DailyUsage.user_id)
                                   .filter(DailyUsage.day == today, DailyUsage.kind == kind)
                                   .distinct().count())
    # 缺的那一天补 0：与「逐日」那一栏同一条口径，"三天没数"与"那三天没人来"得能分开。
    series = []
    for offset in range(days):
        day = (datetime.now(daily_budget.DAILY_TZ) - timedelta(days=days - 1 - offset)).strftime("%Y-%m-%d")
        bucket = per_day.get(day) or {kind: 0 for kind in daily_budget.KINDS}
        series.append({"date": day, **{kind: bucket.get(kind, 0) for kind in daily_budget.KINDS}})

    return {
        "tz": "UTC+08",
        "window_days": days,
        "today": today,
        "by_kind": by_kind,
        "per_day": series,
        # 档位来自 `core/config.py` 那两栏（他拍的 50／200），这里现读不写死，抬一档不用改这一处。
        "limits": {kind: daily_budget.limit_of(kind) for kind in daily_budget.KINDS},
    }


def board(db: Session, days: int = 14, forward_route_mounted: bool = False) -> Dict[str, Any]:
    mp = mini_program(db, days=days)
    ds = deepseek_balance()
    ds["forward_route_mounted"] = bool(forward_route_mounted)
    # 「今天转发了几条」这一档由 RoamMark 那一趟负责记（`services/spot_draft.py` 那一侧加一笔
    # `daily_budget.charge(..., DRAFT_KIND)`）。本栏只**读**它，不替他写：记一笔就是碰他那两只文件，
    # 而它们必须跟 `main.py` 那一批同进同出（同一句纪律见 `docs/版本与发布现状.md` 第三节）。
    # 库里今天还没有这一档的任何一行 ⇒ 回 `None`，屏上念"这一档还没开始记"。
    # ⚠ 不许念成 0：0 的意思是"今天没人用"，而真实情况是"这一件事没人在记"，两者会指向相反的决定。
    counted = (db.query(DailyUsage).filter(DailyUsage.kind == DRAFT_KIND).count() > 0)
    ds["calls_today"] = draft_calls(db, mp["today"]) if counted else None
    return {"mini_program": mp, "deepseek": ds}
