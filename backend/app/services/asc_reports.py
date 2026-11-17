"""Apple App Store Connect 每日数据拉取（「iPhone 数据」那一栏背后的这一条链）。

两个数据源、一张表（`models/asc_daily.py`）、一个同步入口 `sync()`：

1. **salesReports**（`GET /v1/salesReports`，SALES／SUMMARY／DAILY TSV，gzip）——
   按报告日逐日拉，窗口 `SALES_BACKFILL_DAYS` 天。**某天没销售 Apple 回 404
   "no sales for the date"**：那不是错误，是"那天没数"，跳过且不补 0 行。
   vendor number 的对错在这里隐式验证：404 的 detail 只骂日期不骂 vendor，
   而鉴权失败会先撞 401——链路真通的第一份 TSV 才是 vendor 的最终对账（11-16 探针实录）。
2. **analyticsReportRequests**（ONGOING 单）——先列请求找到这颗 App 的那一单，
   再列报告挑四份想要的（下载／安装删除／会话／购买），逐份取最新 DAILY 实例、
   下载 segments 的 .txt.gz、逐行 JSON 聚合。**首份实例要上架后 24–48 小时才出现**
   （Apple 官方口径，11-16 建单时现读），在那之前这一路回 `no_instance_yet`，
   不是错误、也不写任何行。

三条纪律（与 `usage_board.py` 同型）：

- **值只进不出**：.p8 内容、JWT、raw 报文一次都不进回体、不进日志；`payload` 只存聚合行。
  配置的形状（配没配、钥文件在不在）可以说，值本身不说。
- **一头红了不许拖死另一头**：sales 与 analytics 各自吞错，结果里留 errors[]，
  `sync()` 从不抛——同步口是管理员点一下"拉一次"，它该回一张账，不是一张 500。
- **缺数不补 0**：`series` 里缺的那天是 NULL，屏上念"—"；"没报"与"是零"必须分得开。

网络走模块级的 `_http_get`：真实实现一行 httpx；测试用它钉"上游回什么、我们就怎么记账"，
不用真出网（conftest 那条"整套用例零出网"的不变量不动它）。
"""
import gzip
import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import jwt

from app.core.config import settings
from app.models.asc_daily import AscDaily

logger = logging.getLogger(__name__)

ASC_BASE = "https://api.appstoreconnect.apple.com"
TOKEN_TTL_SECONDS = 1200
SALES_TIMEOUT = 15.0
ANALYTICS_TIMEOUT = 20.0
# 每次同步往前拉几天的 sales 日报。Apple 的 analytics 实例自己会带齐历史（35 天内），
# 所以这个窗口只管 sales 那一头；赶上了漏拉的日子，把这一档抬一档就行。
SALES_BACKFILL_DAYS = 7
# sales TSV 的列名按**列名**取下标，不按位置取——Apple 往表里加列的历史很长，
# 按位置取会在某天静默错位（parse_sales_tsv 里那一列名单是唯一出处）。
# Product Type Identifier → 我们要的列。1=License（下载）、7=Update、3=Redownload。
# 之外的码（内购那种 FI*）不丢：留在 payload 的逐行明细里，加列时只改这一张表。
SALES_TYPE_MAP = {"1": "downloads", "7": "updates", "3": "redownloads"}
# analytics 四份想要的标准报告：报告名 → (实例里认哪几个 metric → 记到哪一列)。
# 报告名是 ASC 后台「报告类型」列表里的原话（11-16 建单时 52 份现读核对过），
# metric 名以首批实例到手那天为准——对不上的会进 errors[]，不会静默丢。
ANALYTICS_WANTED = {
    "App Downloads Standard": {"downloads": "downloads"},
    "App Store Installation and Deletion Standard": {"installs": "installs",
                                                     "deleteActions": "deletes"},
    "App Sessions Standard": {"sessions": "sessions",
                              "totalUniqueDevices": "unique_devices"},
    "App Store Purchases Standard": {"sales": "_proceeds"},
}


class AscNotConfigured(Exception):
    """五栏配置没配齐（或钥文件不在）。路由层把它翻成 503 的人话。"""


def configured() -> bool:
    """五栏全有值且钥文件真在盘上，才算这一路开过。"""
    names = ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_PATH",
             "ASC_VENDOR_NUMBER", "ASC_APP_ID")
    if any(not (getattr(settings, n) or "").strip() for n in names):
        return False
    try:
        with open(settings.ASC_KEY_PATH, "rb"):
            return True
    except OSError:
        return False


def config_shape() -> Dict[str, Any]:
    """配置的**形状**读数（值一次都不出去，同 `usage_board._key_shape` 那条纪律）。"""
    missing = [n for n in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_PATH",
                           "ASC_VENDOR_NUMBER", "ASC_APP_ID")
               if not (getattr(settings, n) or "").strip()]
    key_present = False
    if settings.ASC_KEY_PATH and not missing:
        try:
            with open(settings.ASC_KEY_PATH, "rb"):
                key_present = True
        except OSError:
            key_present = False
    return {"missing": missing, "key_file_present": key_present}


def _token() -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": settings.ASC_ISSUER_ID, "iat": now, "exp": now + TOKEN_TTL_SECONDS,
         "aud": "appstoreconnect-v1"},
        _read_key(), algorithm="ES256", headers={"kid": settings.ASC_KEY_ID},
    )


def _read_key() -> str:
    with open(settings.ASC_KEY_PATH) as f:
        return f.read()


class _Resp:
    """`_http_get` 的返回形状（status + 字节），真实与假身共用这一张脸。"""

    def __init__(self, status: int, content: bytes = b"",
                 content_type: str = ""):
        self.status_code = status
        self.content = content
        self.headers = {"content-type": content_type}


def _http_get(url: str, headers: Dict[str, str], timeout: float) -> _Resp:
    """唯一出网的那一行。测试 monkeypatch 这一只函数，不真打 Apple。"""
    resp = httpx.get(url, headers=headers, timeout=httpx.Timeout(timeout, connect=6.0))
    return _Resp(resp.status_code, resp.content,
                 resp.headers.get("content-type", ""))


def _require_ready() -> None:
    if not configured():
        raise AscNotConfigured()


# ---------------------------------------------------------------- sales 一头

def pull_sales(db) -> Dict[str, Any]:
    """窗口内逐日拉 sales 日报并 upsert。404＝那天没数（跳过），其余非 200 记错。"""
    result: Dict[str, Any] = {"pulled": 0, "no_sales": 0, "errors": [],
                              "dates": []}
    # configured() 只保证检查那一刻钥在盘上；读到签出之间它坏了也得记进 errors[]，
    # 不许把"整链从不抛"这条纪律从签票这一发穿出去（第十一轮 W2）。
    try:
        token = _token()
    except Exception as exc:
        result["errors"].append(f"签票那一发没成（{type(exc).__name__}）")
        return result
    headers = {"Authorization": "Bearer " + token, "Accept": "application/a-gzip"}
    today = date.today()
    for offset in range(SALES_BACKFILL_DAYS):
        report_date = today - timedelta(days=1 + offset)
        url = (f"{ASC_BASE}/v1/salesReports"
               "?filter[reportType]=SALES&filter[reportSubType]=SUMMARY"
               f"&filter[frequency]=DAILY&filter[reportDate]={report_date.isoformat()}"
               f"&filter[vendorNumber]={settings.ASC_VENDOR_NUMBER}")
        try:
            resp = _http_get(url, headers, SALES_TIMEOUT)
        except Exception as exc:
            result["errors"].append(f"{report_date.isoformat()} 这一发没打出去（{type(exc).__name__}）")
            continue
        if resp.status_code == 404:
            result["no_sales"] += 1
            continue
        if resp.status_code != 200:
            result["errors"].append(f"{report_date.isoformat()} 上游回 {resp.status_code}")
            continue
        try:
            day = parse_sales_tsv(_gunzip(resp.content))
        except (ValueError, UnicodeDecodeError) as exc:
            result["errors"].append(f"{report_date.isoformat()} 报表读不出来（{type(exc).__name__}）")
            continue
        if day is None:
            result["no_sales"] += 1
            continue
        upsert(db, day["report_date"], sales=day)
        result["pulled"] += 1
        result["dates"].append(day["report_date"])
    return result


def _gunzip(content: bytes) -> str:
    return gzip.decompress(content).decode("utf-8", "replace")


def _json_body(resp: _Resp) -> Dict[str, Any]:
    """上游 JSON 回体 → dict；坏回体按"没有数据"回 {}，不炸整趟。"""
    try:
        parsed = json.loads(resp.content.decode("utf-8", "replace"))
    except (ValueError, UnicodeDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_sales_tsv(tsv: str) -> Optional[Dict[str, Any]]:
    """一天的 TSV → 聚合行。没有数据行（只有表头）按"没数"回 None。

    日期用 `Begin Date` 那一列（Apple 的 MM/DD/YYYY），**不信任请求时用的那个日期**：
    Apple 偶尔会把整表挪一天发，账跟着报表走而不是跟着我们问的那天走。
    """
    lines = [ln for ln in tsv.strip().splitlines() if ln.strip()]
    if not lines:
        return None
    header = lines[0].split("\t")
    try:
        idx = {name: header.index(col) for name, col in (
            ("provider", "Provider"), ("sku", "Sku"), ("title", "Title"),
            ("type", "Product Type Identifier"), ("units", "Unit Number"),
            ("proceeds", "Developer Proceeds"), ("begin", "Begin Date"),
            ("currency", "Currency of Proceeds"))}
    except ValueError as exc:
        raise ValueError(f"表头对不上：{exc}") from exc

    metrics = {"downloads": 0, "updates": 0, "redownloads": 0}
    proceeds_by_currency: Dict[str, float] = {}
    rows: List[Dict[str, Any]] = []
    report_date: Optional[str] = None
    for ln in lines[1:]:
        cells = ln.split("\t")
        if len(cells) <= max(idx.values()):
            continue
        units = _num_int(cells[idx["units"]])
        if units is None:
            continue
        begin = _sales_date(cells[idx["begin"]])
        row = {"sku": cells[idx["sku"]], "title": cells[idx["title"]],
               "product_type": cells[idx["type"]], "units": units,
               "proceeds": _num_float(cells[idx["proceeds"]]),
               "currency": cells[idx["currency"]].strip() or None}
        if begin:
            row["date"] = begin
            report_date = report_date or begin
        rows.append(row)
        column = SALES_TYPE_MAP.get(cells[idx["type"]].strip())
        if column:
            metrics[column] += units
        currency = row["currency"]
        if currency and row["proceeds"] is not None:
            proceeds_by_currency[currency] = (proceeds_by_currency.get(currency, 0.0)
                                              + row["proceeds"])
    if not rows or not report_date:
        return None
    proceeds = None
    currency = None
    if len(proceeds_by_currency) == 1:
        currency, proceeds = next(iter(proceeds_by_currency.items()))
    return {"report_date": report_date, "payload": {"sales_rows": rows},
            "metrics": metrics, "proceeds": proceeds, "currency": currency}


def _num_int(raw: str) -> Optional[int]:
    try:
        return int(raw.strip())
    except ValueError:
        return None


def _num_float(raw: str) -> Optional[float]:
    try:
        return float(raw.strip())
    except ValueError:
        return None


def _sales_date(raw: str) -> Optional[str]:
    try:
        return datetime.strptime(raw.strip(), "%m/%d/%Y").date().isoformat()
    except ValueError:
        return None


# ---------------------------------------------------------------- analytics 一头

def pull_analytics(db) -> Dict[str, Any]:
    """ONGOING 单 → 四份想要的报告 → 最新 DAILY 实例 → segments 逐行聚合。"""
    result: Dict[str, Any] = {"state": "ok", "reports_seen": 0,
                              "instances_pulled": 0, "errors": [], "dates": []}
    try:
        token = _token()
    except Exception as exc:
        result["state"] = "unreachable"
        result["errors"].append(f"签票那一发没成（{type(exc).__name__}）")
        return result
    headers = {"Authorization": "Bearer " + token}
    try:
        request_id = _find_ongoing_request(headers)
    except AscNotConfigured:
        raise
    except Exception as exc:
        result["state"] = "unreachable"
        result["errors"].append(f"列报告请求那一发没打出去（{type(exc).__name__}）")
        return result
    if not request_id:
        result["state"] = "no_request"
        return result

    status, reports = _list_reports(headers, request_id)
    if status != 200:
        result["state"] = "unreachable"
        result["errors"].append(f"列报告那一发上游回 {status}")
        return result

    for report in reports:
        name = (report.get("attributes") or {}).get("name") or ""
        wanted = ANALYTICS_WANTED.get(name)
        result["reports_seen"] += 1
        if not wanted:
            continue
        report_id = report.get("id")
        try:
            instance_id = _latest_daily_instance(headers, report_id)
        except Exception as exc:
            result["errors"].append(f"{name} 实例那一发没打出去（{type(exc).__name__}）")
            continue
        if not instance_id:
            result.setdefault("pending", []).append(name)
            continue
        try:
            days = _download_instance(headers, report_id, instance_id)
        except Exception as exc:
            result["errors"].append(f"{name} 数据下载没打出去（{type(exc).__name__}）")
            continue
        result["instances_pulled"] += 1
        for report_date, metrics, payload_lines in days:
            if not report_date:
                continue
            fields, proceeds = _analytics_fields(metrics, wanted)
            if fields or proceeds is not None:
                upsert(db, report_date, analytics={
                    "metrics": fields, "proceeds": proceeds,
                    "payload": {"analytics_rows": payload_lines}})
                result["dates"].append(report_date)
    if result["instances_pulled"] == 0 and not result["errors"]:
        result["state"] = "no_instance_yet"
    return result


def _find_ongoing_request(headers: Dict[str, str]) -> Optional[str]:
    resp = _http_get(f"{ASC_BASE}/v1/analyticsReportRequests", headers, ANALYTICS_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"列请求上游回 {resp.status_code}")
    items = _json_body(resp).get("data") or []
    for item in items:
        app = ((item.get("relationships") or {}).get("app") or {}).get("data") or {}
        if str(app.get("id")) == str(settings.ASC_APP_ID):
            return item.get("id")
    return None


def _list_reports(headers: Dict[str, str], request_id: str) -> Tuple[int, List[dict]]:
    resp = _http_get(f"{ASC_BASE}/v1/analyticsReportRequests/{request_id}/reports",
                     headers, ANALYTICS_TIMEOUT)
    return resp.status_code, _json_body(resp).get("data") or []


def _latest_daily_instance(headers: Dict[str, str], report_id: str) -> Optional[str]:
    """最新一份 DAILY 实例的 id；一份实例都没有（24–48 小时那一段）回 None。"""
    resp = _http_get(f"{ASC_BASE}/v1/analyticsReports/{report_id}/instances"
                     "?filter[granularity]=DAILY", headers, ANALYTICS_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"列实例上游回 {resp.status_code}")
    items = _json_body(resp).get("data") or []
    if not items:
        return None
    # procDate 是实例自己的口径，挑最大那一份；缺这个字段就取接口给的第一份（本来就是新→旧排的）。
    def key(item: dict):
        return (item.get("attributes") or {}).get("procDate") or ""
    return max(items, key=key).get("id")


def _download_instance(headers: Dict[str, str], report_id: str,
                       instance_id: str) -> List[Tuple[str, Dict[str, float], List[dict]]]:
    """一份实例的全部 segments → [(报告日, {metric: 值}, 原始行)]。"""
    resp = _http_get(f"{ASC_BASE}/v1/analyticsReports/{report_id}/instances/{instance_id}/segments",
                     headers, ANALYTICS_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"列 segments 上游回 {resp.status_code}")
    out: List[Tuple[str, Dict[str, float], List[dict]]] = []
    for seg in _json_body(resp).get("data") or []:
        url = (seg.get("attributes") or {}).get("url")
        if not url:
            continue
        seg_resp = _http_get(url, headers, ANALYTICS_TIMEOUT)
        if seg_resp.status_code != 200:
            raise RuntimeError(f"segment 下载上游回 {seg_resp.status_code}")
        out.extend(parse_analytics_jsonl(_gunzip(seg_resp.content)))
    return out


def parse_analytics_jsonl(text: str) -> List[Tuple[str, Dict[str, float], List[dict]]]:
    """JSONL → 按日期聚成 {metric: 值}。坏行跳过（留不到就说不到），未知 metric 留底。"""
    per_date: Dict[str, Dict[str, float]] = {}
    rows_by_date: Dict[str, List[dict]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(item, dict):
            continue
        report_date = str(item.get("date") or "")
        if not report_date:
            continue
        rows_by_date.setdefault(report_date, []).append(item)
        bucket = per_date.setdefault(report_date, {})
        for entry in item.get("data") or []:
            if not isinstance(entry, dict):
                continue
            value = entry.get("value")
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            metric = str(item.get("metric") or "")
            bucket[metric] = bucket.get(metric, 0.0) + float(value)
    return [(d, per_date[d], rows_by_date[d]) for d in sorted(per_date)]


def _analytics_fields(metrics: Dict[str, float],
                      wanted: Dict[str, str]) -> Tuple[Dict[str, int], Optional[float]]:
    """把**这一份报告**这一天的 metric 聚合翻成表列。

    映射按报告各自传（`ANALYTICS_WANTED` 里那一份），不并一张全局表：
    不同报告里同名 metric 记的东西可能不一样，并了表就会串线。
    `_proceeds` 那一格（purchases 报告的 sales）值可能是小数，单独走、不当行数取整。
    """
    fields: Dict[str, int] = {}
    proceeds: Optional[float] = None
    for metric, value in metrics.items():
        column = wanted.get(metric)
        if not column:
            continue
        if column == "_proceeds":
            proceeds = value
        else:
            fields[column] = int(value)
    return fields, proceeds


# ---------------------------------------------------------------- 落账与读数

def upsert(db, report_date: str, sales: Optional[Dict[str, Any]] = None,
           analytics: Optional[Dict[str, Any]] = None) -> AscDaily:
    """同一天两头来都写：`updates`/`redownloads` 只有 sales 认、`installs`/`deletes`/
    `sessions`/`unique_devices` 只有 analytics 认，各写各的半边；**`downloads` 两头都认**
    （sales 的 License 计数、analytics 的 downloads 计数），同步先拉 sales 后拉 analytics，
    同一天并存时 analytics 的值最后落——Apple 对"使用"的权威口径以它为准。

    幂等的落点就是 `ux_asc_daily_report_date`：同一天拉第二遍，行还在原位、值按
    来源各自刷新——重复点"拉一次"不会长出新行，也不会把另一头的旧数抹掉。
    """
    now = datetime.now(timezone.utc)
    row = db.query(AscDaily).filter(AscDaily.report_date == report_date).first()
    if row is None:
        row = AscDaily(report_date=report_date)
        db.add(row)
    metrics: Dict[str, Any] = {}
    payload: Dict[str, Any] = {}
    source_at = None
    if sales is not None:
        metrics = dict(sales.get("metrics") or {})
        payload = dict(sales.get("payload") or {})
        if sales.get("proceeds") is not None and (sales.get("currency") or "") == "USD":
            row.proceeds_usd = sales["proceeds"]
            row.proceeds_currency = "USD"
        source_at = "sales_at"
    elif analytics is not None:
        metrics = dict(analytics.get("metrics") or {})
        payload = dict(analytics.get("payload") or {})
        proceeds = analytics.get("proceeds")
        currency = _analytics_proceeds_currency(payload)
        if proceeds is not None and currency == "USD":
            row.proceeds_usd = proceeds
            row.proceeds_currency = "USD"
        source_at = "analytics_at"
    for column, value in metrics.items():
        setattr(row, column, value)
    if payload:
        merged = json.loads(row.payload) if row.payload else {}
        merged.update(payload)
        row.payload = json.dumps(merged, ensure_ascii=False, sort_keys=True)
    if source_at:
        setattr(row, source_at, now)
    db.flush()
    return row


def _analytics_proceeds_currency(payload: Dict[str, Any]) -> Optional[str]:
    """收入那一格的币种从**原始行**现读，不猜。所有行都带 USD 才认；否则这格不动。"""
    rows = payload.get("analytics_rows") or []
    currencies = set()
    for item in rows:
        for entry in item.get("data") or []:
            if isinstance(entry, dict) and entry.get("currency"):
                currencies.add(str(entry["currency"]))
    if len(currencies) == 1:
        return currencies.pop()
    return None


def sync(db) -> Dict[str, Any]:
    """同步入口：两头各拉一趟，回一张账。任何一头失败都留在 errors[] 里，从不抛。"""
    _require_ready()
    sales = pull_sales(db)
    analytics = pull_analytics(db)
    db.commit()
    return {"sales": sales, "analytics": analytics,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def state(db, days: int = 14) -> Dict[str, Any]:
    """那一栏要显示的全部事实：配置形状、窗口序列、合计、最近拉取时刻、订阅那一格的实话。

    没配齐就抛 `AscNotConfigured`（路由翻成 503 的那句话）——与 `sync()` 同一条纪律：
    "这一栏还没配置"得靠**状态码**说，不能画成一张全 0 的正常表
    （0 的意思是"拉到了、就是零"，与"没配"指向相反的决定）。
    """
    if not configured():
        raise AscNotConfigured()
    shape = config_shape()
    if shape["missing"] or not shape["key_file_present"]:
        shape["sentence"] = _not_configured_sentence(shape)
        return shape

    today = date.today()
    window_start = today - timedelta(days=days - 1)
    rows = (db.query(AscDaily)
              .filter(AscDaily.report_date >= window_start.isoformat(),
                      AscDaily.report_date <= today.isoformat())
              .order_by(AscDaily.report_date).all())
    by_date = {row.report_date: row for row in rows}
    columns = ("downloads", "updates", "redownloads", "installs", "deletes",
               "sessions", "unique_devices")
    series = []
    totals = {c: 0 for c in columns}
    seen_any = False
    for offset in range(days):
        d = (today - timedelta(days=days - 1 - offset)).isoformat()
        row = by_date.get(d)
        point = {"date": d}
        for c in columns:
            value = getattr(row, c) if row else None
            point[c] = value
            if value is not None:
                totals[c] += value
                seen_any = True
        point["proceeds_usd"] = (row.proceeds_usd if row else None)
        point["proceeds_currency"] = (row.proceeds_currency if row else None)
        series.append(point)

    last_sales = max((r.sales_at for r in rows if r.sales_at), default=None)
    last_analytics = max((r.analytics_at for r in rows if r.analytics_at), default=None)
    out: Dict[str, Any] = {
        **shape,
        "window_days": days,
        "series": series,
        "totals": totals,
        "seen_any": seen_any,
        "last_sales_at": last_sales.isoformat(timespec="seconds") if last_sales else None,
        "last_analytics_at": (last_analytics.isoformat(timespec="seconds")
                              if last_analytics else None),
        "sentence": _state_sentence(seen_any, last_sales, last_analytics),
        "subscription_sentence": SUBSCRIPTION_SENTENCE,
    }
    return out


def _not_configured_sentence(shape: Dict[str, Any]) -> str:
    if shape["missing"]:
        return "这一栏还没配置齐：服务器 .env 里缺 " + "、".join(shape["missing"]) + " 五栏"
    return "这一栏还没配置齐：.env 里那几栏都有值，但 .p8 私钥文件不在配置写的那个路径上"


def _state_sentence(seen_any: bool, last_sales, last_analytics) -> str:
    if not seen_any:
        return ("还没有拉到过任何一天的数据：App 11-16 才恢复在售，Apple 的日报要"
                "上架后有真实下载才有数；analytics 首批实例要上架后 24–48 小时才出现，"
                "点「拉一次」就能试")
    return "数是 Apple 的日报口径（报告日后一到两天才齐），不是实时数"


SUBSCRIPTION_SENTENCE = ("订阅数这一格暂时没有：这颗 App 内没有上架内购或订阅商品，"
                         "Apple 也就没有给订阅报告；上了内购之后这一格会跟着 Apple 的订阅报告出现")
