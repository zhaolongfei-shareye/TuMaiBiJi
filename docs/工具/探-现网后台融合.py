"""现网探针：后台融合这一期（换票口＋统计口＋`/ops`「数据」栏）在服务器上到底通不通。

本地 pytest 全绿只证明这份代码；现网那台 nginx 前缀转不转、`.env` 里那两把钥匙是不是各就各位、
`/ops` 那一页真把「数据」渲染出来了没有——只有从公网打一次才知道
（`[[feedback-green-tests-not-release-ready]]`：部署后必须再跑现网探针）。

两把钥匙都**从标准输入读**，绝不进命令行参数、绝不回显：`ps` 里看得见 argv。跑法：

    ssh agentsbin 'sed -n "s/^ADMIN_TOKEN=//p;/^ADMIN_EXCHANGE_SECRET=//p" /home/ubuntu/wtsj-backend/.env' \\
      | backend/.venv/bin/python docs/工具/探-现网后台融合.py

（第一行是管理口令，第二行是换票暗号；服务器上那行还没配就留空行，探针会把换票那三条记成
"未开闸"而不是失败——**没配就该是 503，这一趟顺便把这条钉住**。）

这一支**只读**：一个写口都不碰，不改文案、不传图、不发任何东西。所以它不需要 `--keep`／`--revert`
那一套收尾，跑完现网状态与跑之前逐字节相同。
"""
import os
import sys

import httpx

# 默认打现网；本机自测这支探针本身时给个 OPS_PROBE_BASE 指到本地端口（它不是密钥，走环境变量无妨）。
BASE = os.environ.get("OPS_PROBE_BASE", "https://api.agentsbin.cn/wtsj").rstrip("/")
VERIFY = f"{BASE}/api/admin/verify-token"
STATS = f"{BASE}/api/admin/stats/overview"
OPS = f"{BASE}/ops"

lines = [line.rstrip("\n") for line in sys.stdin.read().split("\n")]
TOKEN = (lines[0] if len(lines) > 0 else "").strip()
SECRET = (lines[1] if len(lines) > 1 else "").strip()

fails = []
notes = []


def check(label, ok, detail=""):
    print(f"  {'✓' if ok else '✗'} {label}{('　→ ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


def note(text):
    notes.append(text)
    print(f"  · {text}")


print(f">>> 目标 {BASE}　口令 {'读到' if TOKEN else '没读到'}　换票暗号 {'读到' if SECRET else '没配'}")

# ---------------- ① 未登录那一头：门必须是关的 ----------------
r = httpx.get(STATS, timeout=20)
check("匿名打统计口是 401（不是 403/200）", r.status_code == 401, f"HTTP {r.status_code}")

r = httpx.post(VERIFY, json={"token": "not-a-ticket"}, timeout=20)
if SECRET:
    check("不带暗号打验票口是 401", r.status_code == 401, f"HTTP {r.status_code}")
else:
    check("暗号没配时验票口是 503（不是放行、也不是 401）", r.status_code == 503, f"HTTP {r.status_code}")
    note("这台还没配 ADMIN_EXCHANGE_SECRET：换票那条链处于『不可用』，两边各自登录不受影响")

# ---------------- ② 登录 → 拿票 ----------------
r = httpx.post(f"{BASE}/api/admin/login", json={"token": TOKEN}, timeout=20)
check("管理口令能登录", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
if r.status_code != 200:
    print("\n!!! 登录都没过，后面的判据无从谈起")
    sys.exit(1)
session = r.json()["session"]
H = {"Authorization": f"Bearer {session}"}

# ---------------- ③ 验票口：只有管理票能过，且只回三个键 ----------------
if SECRET:
    hdr = {"X-Exchange": SECRET}
    r = httpx.post(VERIFY, json={"token": session}, headers=hdr, timeout=20)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    check("真管理票＋对暗号 → 200", ok, f"HTTP {r.status_code} {r.text[:80] if not ok else ''}")
    check("回体只有 sub/scope/exp 三个键", ok and set(body) == {"sub", "scope", "exp"}, str(sorted(body)))
    check("scope 是 admin（对端拿这个当判据）", ok and body.get("scope") == "admin", str(body.get("scope")))
    # 反向对照：换过口令之后的旧票应当当场失效，这一条只能靠"签一枚注定不对的票"近似，
    # 所以这里钉的是**别的都不许过**：伪造签名、错 scope、过期票。
    forged = session[:-4] + "AAAA"
    r = httpx.post(VERIFY, json={"token": forged}, headers=hdr, timeout=20)
    check("改过一位的票（签名不合法）→ 401", r.status_code == 401, f"HTTP {r.status_code}")
    r = httpx.post(VERIFY, json={"token": session}, headers={"X-Exchange": SECRET + "-x"}, timeout=20)
    check("暗号差一个字 → 401", r.status_code == 401, f"HTTP {r.status_code}")
    r = httpx.post(VERIFY, json={"token": session}, timeout=20)
    check("不带暗号打验票口 → 401（有暗号可配时）", r.status_code == 401, f"HTTP {r.status_code}")
else:
    note("换票那六条本轮跳过（这台没配暗号）；配好之后重跑这一支，它们会一起亮")

# ---------------- ④ 统计口：形状与口径 ----------------
r = httpx.get(STATS, headers=H, timeout=30)
check("登录后统计口 200", r.status_code == 200, f"HTTP {r.status_code}")
d = r.json() if r.status_code == 200 else {}
need = {"window_days", "tz", "totals", "per_day", "sources", "templates", "invitations", "shares"}
check("回体八块齐全", need <= set(d), f"缺 {sorted(need - set(d))}" if d else "没拿到回体")
check("日期口径写着 UTC（不擅自换算成北京时间）", d.get("tz") == "UTC", str(d.get("tz")))
check("逐日行数＝窗口天数（缺的那一天补 0）", len(d.get("per_day", [])) == d.get("window_days"),
      f"{len(d.get('per_day', []))} vs {d.get('window_days')}")
check("窗口被夹住：days=999 → 90",
      httpx.get(f"{STATS}?days=999", headers=H, timeout=30).json().get("window_days") == 90)
tot = d.get("totals", {})
check("总量那一块带『剔除的预置篇数』（不写就等于把预置算进新增）",
      "preset_notes_excluded" in tot, str(sorted(tot)))
# 假数专项：转存量若等于笔记总量，就是 `IS NOT NULL` 那个坑又回来了（JSON 列存 None 是文本 null）。
imp = sum(int(x.get("imports") or 0) for x in d.get("per_day", []))
notes_total = int(tot.get("notes") or 0)
if notes_total and imp == notes_total:
    check("转存量不等于笔记总量（等于就是 JSON 那个坑）", False, f"两边都是 {notes_total}")
else:
    check("转存量不等于笔记总量（等于就是 JSON 那个坑）", True, f"转存 {imp}／笔记 {notes_total}")
check("邀请那两个数一起回（只回一个就是替操作者判等）",
      {"rewards_granted", "quota_bonus_held"} <= set(d.get("invitations", {})), str(d.get("invitations")))
srcs = {x.get("source_type") for x in d.get("sources", [])}
check("来源里公众号与网页是分开的两档", {"wechat_article", "web_article"} <= srcs or not srcs, str(sorted(srcs)))

# ---------------- ⑤ 那一页：部署的必须是带「数据」栏的这一版 ----------------
r = httpx.get(OPS, timeout=20)
page = r.text
check("/ops 匿名可取（它只是个口令框）", r.status_code == 200, f"HTTP {r.status_code}")
check("/ops 那页真带「数据」那一栏", "renderStats" in page and "api/admin/stats/overview" in page)
check("/ops 那页仍零 innerHTML（动态串一律 textContent）", "innerHTML" not in page)
check("/ops 不缓存（no-store）", "no-store" in r.headers.get("cache-control", ""),
      r.headers.get("cache-control", ""))

print(f"\n{'!!! 失败 ' + str(len(fails)) + ' 条：' + '、'.join(fails) if fails else '✓ 全过'}")
for n in notes:
    print("  · " + n)
sys.exit(1 if fails else 0)
