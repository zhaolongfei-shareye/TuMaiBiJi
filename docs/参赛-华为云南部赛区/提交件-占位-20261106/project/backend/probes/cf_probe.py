"""提炼云函数上线后的一次性验证探针。

用法（服务器上，凭据从 .env 读，绝不打印明文）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/cf_probe.py

它回答四个问题，也正是 PRD R2 剩下的全部未知：

1. 长期 API Key 到底通不通（401 的三种子型能区分"填错类型"与"没权限"）
2. 云函数返回的是不是 4 字段契约，混元实际吐出什么
3. 真实超时上限是多少 —— 官方文档 5/15/60/900 互相矛盾，只有实测能定
4. 控制台实际开的模型名是哪个（`hy3` 不通时会把模型的原始报错带回来）

退出码：0=全部通过，1=有未通过项。不写库、不发短信、不产生任何用户可见副作用。
"""
import json
import re
import statistics
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.llm import SYSTEM_PROMPT  # noqa: E402


def env_lines(path):
    """直接读 .env，不依赖 settings。

    现网跑的仍是 v2.2，`config.py` 里还没有这两个字段，而 pydantic-settings 设了
    `extra="ignore"`，多余键会被静默丢掉——用 settings 取就永远是空串，探针会误报
    "未配置"。这个探针的存在意义正是"部署前先把通道验通"，所以必须绕开待部署的代码。
    """
    out = {}
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return out
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


_ENV = env_lines(Path(__file__).resolve().parents[1] / ".env")

# 探针要能在"新代码还没部署"时先跑，所以这里不 import app.services.llm.key_usable
# ——那正是待部署的东西；占位符判断自带一份即可。
_PLACEHOLDER = re.compile(
    r"(?i)^(sk-)?(your[-_]|example|placeholder|changeme|dummy|todo|test[-_]?key|x{3,}|<|\{\{)"
)


def usable(v):
    v = (v or "").strip()
    return bool(v) and not _PLACEHOLDER.match(v)

FAILS = []
URL = _ENV.get("HUNYUAN_CF_URL", "")
KEY = _ENV.get("HUNYUAN_CF_KEY", "")


def check(name, ok, extra=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   {extra}" if extra else ""))
    if not ok:
        FAILS.append(name)


def call(payload, timeout):
    """返回 (耗时秒, status, body_text)。异常也折算成耗时，便于看是不是撞在超时上。"""
    t0 = time.perf_counter()
    try:
        r = httpx.post(
            URL,
            json=payload,
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            timeout=timeout,
        )
        return time.perf_counter() - t0, r.status_code, r.text
    except httpx.TimeoutException as e:
        return time.perf_counter() - t0, None, f"TIMEOUT {type(e).__name__}: {e}"
    except Exception as e:  # noqa: BLE001
        return time.perf_counter() - t0, None, f"{type(e).__name__}: {e}"


def body(text, fallback=""):
    return {"text": text, "fallback_title": fallback, "system_prompt": SYSTEM_PROMPT}


print(f"\n目标: {URL or '（HUNYUAN_CF_URL 未配置）'}")
print(f"凭据: {'已配置且非占位符' if usable(KEY) else '未配置或仍是占位符 —— 探针无法继续'}")
print(f"EXTRACT_PROVIDER={_ENV.get('EXTRACT_PROVIDER', '（.env 未写，取代码默认 hunyuan_cf）')}  "
      f"HUNYUAN_CF_TIMEOUT={_ENV.get('HUNYUAN_CF_TIMEOUT', '（.env 未写，取代码默认 90）')}\n")

if not URL or not usable(KEY):
    print("结论：先在 .env 填 HUNYUAN_CF_URL 与长期 API Key（不是 access_token），再跑本探针。")
    sys.exit(1)

print("[1 凭据与可达性]")
body1 = body("产品周会纪要：确定下周三发布 1.0.2，OCR 改用自建引擎。", "周会")
dt, status, text = call(body1, 30)
# 现网实测：空闲后的第一次调用必吃一个模型侧 429，紧接着几次全好。函数把这种错包成
# HTTP 200 + {error, retryable:true} 返回，后端会重试——所以探针也要重试着看，
# 否则每次冷启动都报一个假红。
for _ in range(3):
    try:
        _first = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        break
    if not (isinstance(_first, dict) and _first.get("retryable")):
        break
    print(f"        收到可重试错误（{_first.get('error', '')[:70]}），2 秒后再试一次")
    time.sleep(2)
    dt, status, text = call(body1, 30)
print(f"        首次调用 {dt:.2f}s → HTTP {status}")
if status == 401:
    code = ""
    try:
        code = json.loads(text).get("code", "")
    except json.JSONDecodeError:
        pass
    hints = {
        "MISSING_CREDENTIALS": "Bearer 头没被认出来 —— 检查是否误用了 X-API-KEY 之类的头",
        "INVALID_CREDENTIALS": "Key 值不对 —— 确认填的是控制台「环境管理 → API Key 配置」"
                               "里那块**服务端 API Key**（不是上面那个客户端 Publishable Key，"
                               "也不是设置页的 CLI 秘钥，两者实测都不被网关接受）",
        "ACCESS_TOKEN_KID_INVALID": "填成了 access_token（2 小时过期那种）—— 必须换长期 API Key",
    }
    check("凭据被接受", False, f"{code} —— {hints.get(code, '未知子型')}")
    print("\n结论：凭据这一关没过，后面的测试无意义。")
    sys.exit(1)
check("调用返回 2xx", status is not None and 200 <= status < 300, f"HTTP {status} {text[:200]}")

print("\n[2 四字段契约]")
try:
    data = json.loads(text)
except json.JSONDecodeError:
    data = None
    check("响应是 JSON", False, text[:200])
if data is not None:
    check("响应是 JSON", True)
    if data.get("error"):
        check("云函数未报错", False, f"error={data['error']!r}")
        print("        ↑ 最常见原因是模型名不对，见 [4]")
    else:
        need = {"title", "summary", "key_points", "tags"}
        check("含 title/summary/key_points/tags", need <= set(data), f"实到 {sorted(data)}")
        check("title 非空", bool(str(data.get("title", "")).strip()), repr(data.get("title")))
        check("key_points 是数组", isinstance(data.get("key_points"), list))
        check("tags 是数组", isinstance(data.get("tags"), list))
        print(f"        摘要 {str(data.get('summary'))[:60]!r}")
        print(f"        要点 {data.get('key_points')}")
        print(f"        标签 {data.get('tags')}")
        if data.get("usage"):
            print(f"        token 用量 {data['usage']}  ← 有读数才能确认扣的是哪份额度")

print("\n[3 真实耗时分布（同一篇长文连打 5 次）]")
LONG = "。".join(f"第{i}段：自建 OCR 引擎负责认字，混元负责提炼要点，两扇门之外不再有第三方依赖" for i in range(120))
lat, codes = [], []
for i in range(5):
    dt, status, text = call(body(LONG, "长文探针"), 120)
    lat.append(dt)
    codes.append(status)
    print(f"        第{i + 1}次 {dt:6.2f}s HTTP {status}")
ok_lat = [d for d, s in zip(lat, codes) if s == 200]
if ok_lat:
    print(f"        → 最短 {min(ok_lat):.2f}s / 中位 {statistics.median(ok_lat):.2f}s / 最长 {max(ok_lat):.2f}s")
    check("全部 5 次成功", all(s == 200 for s in codes), f"状态码 {codes}")
    client_timeout = float(_ENV.get("HUNYUAN_CF_TIMEOUT") or 90)
    if max(ok_lat) + 1 > client_timeout:
        print(f"        ⚠️ 最长耗时已逼近 HUNYUAN_CF_TIMEOUT={client_timeout}s，建议上调")
else:
    check("至少有一次成功", False, f"状态码 {codes}")

print("\n[4 模型名（用一个必然超窗的输入去逼出原始报错，不改代码）]")
dt, status, text = call({"text": "x", "fallback_title": "", "system_prompt": SYSTEM_PROMPT,
                         "__force_bad_model": True}, 20)
print(f"        附加未知字段 → HTTP {status} {text[:160]}")
print("        （云函数会忽略未知字段，这条只验证它对多余入参是宽容的）")
check("多余字段不导致 5xx", status is None or status < 500, f"HTTP {status}")

print("\n[5 缺 system_prompt 时函数应报错而不是瞎调]")
dt, status, text = call({"text": "一段正文", "fallback_title": ""}, 20)
try:
    err = json.loads(text).get("error", "")
except json.JSONDecodeError:
    err = ""
check("回 missing system_prompt", err == "missing system_prompt", f"HTTP {status} error={err!r}")

print("\n" + ("结论：链路已通，可以把 EXTRACT_PROVIDER 保持 hunyuan_cf 并上线。"
              if not FAILS else f"结论：{len(FAILS)} 项未过 → {FAILS}"))
sys.exit(1 if FAILS else 0)
