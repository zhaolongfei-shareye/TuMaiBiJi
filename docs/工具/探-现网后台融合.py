"""现网探针：后台融合这一期（换票口＋统计口＋`/ops`「数据」栏＋「卡片模板」栏）在服务器上到底通不通。

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

「卡片模板」那一栏有写口，所以这一支对它只做三种打：匿名打（应当 401）、登录后读列表、
以及**两次注定改不到任何数据的写**——空 body（在任何一行被查出来之前就被挡）与一个不存在的 id
（在字段校验之前就被挡）。往真行上打非法值同样会被挡，但万一"挡"这件事本身没部署对，
代价是现网少一套卡片给用户用；真行字段的校验只在本地 pytest 判（`tests/test_admin_templates.py` 十六条）。
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
# 只报状态码：成功回体里那枚 session 票不许进日志、更不许进对话（打印 `r.text` 就是把它抄一份）
check("管理口令能登录", r.status_code == 200, f"HTTP {r.status_code}{'' if r.status_code == 200 else ' ' + r.text[:80]}")
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
need = {"window_days", "tz", "totals", "per_day", "sources", "templates",
        "categories", "assets", "invitations", "shares"}
check("回体十块齐全", need <= set(d), f"缺 {sorted(need - set(d))}" if d else "没拿到回体")
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
# A4 分类：这一块的用处是"只出计数"，所以判据是**键集封闭**——多一个键（比如哪天有人把分类名塞进回体）
# 就等于把用户写的字带上这一屏，规格 §5 那条硬边界管到它。
cat = d.get("categories", {})
check("分类那一块五键封闭（多一个键就是往这一屏塞用户内容）",
      set(cat) == {"authored", "uncategorized", "categorized", "private", "slots"}, str(sorted(cat)))
check("分类三个数自洽：未分类＋已分类＝动笔数，且私密不超总数",
      int(cat.get("uncategorized") or 0) + int(cat.get("categorized") or 0) == int(cat.get("authored") or 0)
      and int(cat.get("private") or 0) <= int(cat.get("authored") or 0), str(cat))
# A9 图片：uploaded 走的是 `not_failed()`（NULL 并进来），failed 走 `== 'failed'`，
# 两边不重不漏 ⇒ uploaded＋failed＝总数。不相等说明库里出现了第三种状态，那一栏就开始漏账。
asf = d.get("assets", {})
check("图片那一块：已上传＋失败＝总行数（不等就是有第三种状态没被算）",
      int(asf.get("uploaded") or 0) + int(asf.get("failed") or 0) == int(asf.get("total") or 0), str(asf))
check("图片那一块带『体积不知道』那一格（缺它总字节会被读成精确占用）",
      "size_unknown" in asf, str(sorted(asf)))
srcs = {x.get("source_type") for x in d.get("sources", [])}
# 判据钉的是"代码那个闭集没漏出第七种值"，不是"库里两种文章都出现过"——
# 现网今天没有一条 `web_article`（实测六档只出五档），那是数据事实，拿它判红等于把尺子当产品。
KNOWN = {"manual", "screenshot", "web_article", "wechat_article", "share_import", "preset"}
unknown = sorted(srcs - KNOWN)
check("来源取值都在代码那六档闭集里（冒出第七种就是脏值上屏）", not unknown,
      str(unknown) if unknown else f"{len(srcs)} 档：{', '.join(sorted(srcs))}")
if "web_article" not in srcs:
    note("这一台库里没有一条 `web_article`，所以那一档在表里缺席＝数据事实，不是分不开")

# ---------------- ⑤ 卡片模板那一栏：门、形状、以及两次注定改不到数据的写 ----------------
TPL = f"{BASE}/api/admin/poster/templates"
check("匿名打模板列表口是 401", httpx.get(TPL, timeout=20).status_code == 401)
r = httpx.get(f"{BASE}/api/poster/templates/", headers=H, timeout=20)
check("管理票打用户那个下发口是 401（方向只有一个，反了就是提权）", r.status_code == 401, f"HTTP {r.status_code}")
r = httpx.get(TPL, headers=H, timeout=30)
check("登录后模板列表口 200", r.status_code == 200, f"HTTP {r.status_code}{'' if r.status_code == 200 else ' ' + r.text[:80]}")
tb = r.json() if r.status_code == 200 else {}
if tb:
    check("回体两块齐全（rows 与 counts）", {"rows", "counts"} <= set(tb), str(sorted(tb)))
    check("counts 三态各一个数（少一态就是页面那个'线上几套'会说谎）",
          {"live", "draft", "archived"} <= set(tb.get("counts") or {}), str(tb.get("counts")))
    need_row = {"id", "template_id", "label", "label_en", "group_key", "sort_order", "status",
                "min_app_version", "content_hash", "recipe", "used", "used_current"}
    missing = sorted(need_row - set(tb["rows"][0])) if tb.get("rows") else ["一行都没有"]
    check("每行十二个字段齐全（配方只读也要看得见）", not missing, f"缺 {missing}")
    if tb.get("rows"):
        check("列表按排序从小到大回", [x["sort_order"] for x in tb["rows"]] == sorted(x["sort_order"] for x in tb["rows"]),
              str([x["sort_order"] for x in tb["rows"]][:6]) + "…")
    live_ids = [x["template_id"] for x in tb.get("rows", []) if x["status"] == "live"]
    check("同一套 template_id 只有一版在线上（那条部分唯一索引在现网是真的）",
          len(live_ids) == len(set(live_ids)), f"线上 {len(live_ids)} 套")
    note(f"这一台今天：线上 {tb['counts'].get('live')} 套／草稿 {tb['counts'].get('draft')}／已下架 {tb['counts'].get('archived')}")
    # 用户那道口读到的套数应当＝这里数的 live（两处不是一个口，但必须是同一个事实）
    r2 = httpx.get(f"{BASE}/api/poster/templates/", timeout=20)
    note(f"用户口不带票是 {r2.status_code}（要带用户票才读得到，这一支不签用户票）")
r = httpx.put(f"{TPL}/0", json={}, headers=H, timeout=20)
check("空 body 被挡且说的是'什么都没要改'（这一句在查任何一行之前）",
      r.status_code == 400 and "什么都没要改" in r.json().get("detail", ""), f"HTTP {r.status_code} {r.text[:60]}")
r = httpx.put(f"{TPL}/999999", json={"status": "on"}, headers=H, timeout=20)
check("不存在的 id 被挡并写明 id（这一句在字段校验之前，所以非法状态也到不了任何一行）",
      r.status_code == 400 and "999999" in r.json().get("detail", ""), f"HTTP {r.status_code} {r.text[:60]}")

# ---------------- ⑥ 那一页：部署的必须是带「数据」栏与「卡片模板」栏的这一版 ----------------
r = httpx.get(OPS, timeout=20)
page = r.text
check("/ops 匿名可取（它只是个口令框）", r.status_code == 200, f"HTTP {r.status_code}")
check("/ops 那页真带「数据」那一栏", "renderStats" in page and "api/admin/stats/overview" in page)
check("/ops 那页真带「卡片模板」那一屏",
      "loadTemplates" in page and "view-tpl" in page and "api/admin/poster/templates" in page)
check("/ops 那页三屏各一个容器（不是一列到底）",
      all(f'id="view-{v}"' in page for v in ("stats", "config", "tpl")))
check("/ops 那页仍零 innerHTML（动态串一律 textContent）", "innerHTML" not in page)
check("/ops 不缓存（no-store）", "no-store" in r.headers.get("cache-control", ""),
      r.headers.get("cache-control", ""))

# ---------------- ⑦ 对面那一侧：换票这条链在现网真走通（10-16 它部署之后才有这一段） ----------------
# 它自己的口不带 /wtsj 前缀；这一段只在打真现网时跑（本机自测探针本身时没有对面可打）。
THEIR = os.environ.get("THEIR_BASE", "https://api.agentsbin.cn").rstrip("/")
if "api.agentsbin.cn" not in BASE:
    note("⑦ 对面那一段跳过：这一台不是现网，换票链的另一头不在")
else:
    EX = f"{THEIR}/admin/session/exchange"
    r = httpx.post(EX, json={}, timeout=20)
    check("对面换票口不再是 404（它那一版真上线了）", r.status_code != 404, f"HTTP {r.status_code}")
    check("空 ticket → 400（钉的是新契约：浏览器只交票，不再带暗号）",
          r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")
    r = httpx.post(EX, json={"ticket": "not-a-real-ticket"}, timeout=20)
    check("假票 → 401 而不是 502（它真打到我们验票口、我们回了『票不对』）",
          r.status_code == 401, f"HTTP {r.status_code} {r.text[:60]}")
    r = httpx.post(EX, json={"ticket": session}, timeout=20)
    b = r.json() if r.status_code == 200 else {}
    check("拿我们这侧的真管理票换到它自己的票 → 200", r.status_code == 200,
          f"HTTP {r.status_code}{'' if r.status_code == 200 else ' ' + r.text[:80]}")
    check("换到的回体只有 token/expiresAt 两键", set(b) == {"token", "expiresAt"}, str(sorted(b)))
    if SECRET and b.get("token"):
        their_exp = int(httpx.post(VERIFY, json={"token": session},
                                   headers={"X-Exchange": SECRET}, timeout=20).json().get("exp") or 0)
        check("换到的票有效期不超过我们这侧那枚票的 exp（两边一起到点，不许这边还登着）",
              0 < int(b.get("expiresAt") or 0) <= their_exp, f"{b.get('expiresAt')} vs {their_exp}")
    else:
        note("有效期那条跳过：这一台没给暗号，拿不到对面回体里那个 exp")
    if b.get("token"):
        r = httpx.get(f"{THEIR}/admin/dashboard", headers={"Authorization": "Bearer " + b["token"]}, timeout=30)
        check("换出来的票开得了它自己的门（/admin/dashboard 200）", r.status_code == 200, f"HTTP {r.status_code}")
    r = httpx.get(f"{THEIR}/admin/dashboard", headers=H, timeout=20)
    check("我们那枚票直接开不了它的门（不共用签名密钥这件事在现网是真的）", r.status_code == 401, f"HTTP {r.status_code}")
    r = httpx.post(f"{THEIR}/admin/login", json={"username": "nobody@example.com", "password": "wrong-on-purpose"}, timeout=20)
    check("它自己那套邮箱＋密码那口照旧在（应急通道没被融合堵死）", r.status_code == 401, f"HTTP {r.status_code}")
    r = httpx.get(f"{THEIR}/admin.html", timeout=20)
    check("对面那一页已是登录改道那一版（一个口令框＋应急通道那条链接）",
          r.status_code == 200 and "loginWithSharedToken" in r.text and "showLocalLogin" in r.text,
          f"HTTP {r.status_code}")
    check("那一页里不出现暗号（红线 1 也要在现网那份上钉住）",
          "X-Exchange" not in r.text and "ADMIN_EXCHANGE_SECRET" not in r.text)

# ── ⑧ 卡片模板那一栏的预览引擎（10-16 加的那一口）─────────────────────────
# 这一口吐的是自家源码，所以门的检查要先做；更要紧的是第二条：**现网那一份与本机
# miniprogram 那一份逐字相同**。副本与源文件一旦分叉，屏上那张预览就成了看着像的假图，
# 而这件事在本机测不出来——只有打现网才量得到那台机上到底部署了哪一份。
import hashlib
from pathlib import Path as _P

ENGINE = f"{BASE}/api/admin/poster/engine"
UTILS = _P(__file__).resolve().parents[2] / "miniprogram" / "utils"
check("匿名打预览引擎口是 401（它吐的是源码）", httpx.get(ENGINE, timeout=20).status_code == 401)
r = httpx.get(ENGINE, headers=H, timeout=30)
eng = r.json() if r.status_code == 200 else {}
check("管理票打预览引擎口 200，回体是 JSON 两键", r.status_code == 200 and set(eng) == {"entry", "files"},
      f"HTTP {r.status_code}{'' if r.status_code == 200 else ' ' + r.text[:80]}")
if eng.get("files"):
    drift = [n for n, src in eng["files"].items()
             if hashlib.md5((UTILS / n).read_bytes()).hexdigest() != hashlib.md5(src.encode("utf-8")).hexdigest()]
    check(f"现网那 {len(eng['files'])} 只引擎文件与本机 miniprogram/utils 逐字相同", not drift, f"分叉的：{drift}")
    check("入口是 poster.js 且导出着预览要用的那四个名字",
          eng.get("entry") == "poster.js" and all(
              k in eng["files"]["poster.js"] for k in ("planPoster", "paintLayers", "applyRemoteTemplates", "recipeSource")))
    r2 = httpx.get(ENGINE, headers=dict(H, **{"If-None-Match": r.headers.get("etag", "")}), timeout=20)
    check("内容没变回 304（一次进那一栏只占一个读口额度）", r2.status_code == 304, f"HTTP {r2.status_code}")
page = httpx.get(OPS, timeout=20).text
check("现网那一页已带上预览那一格（第三十二次部署真落了）",
      "paintPreviews" in page and "预览引擎没加载成" in page and "function makeRequire" in page)
check("那一页里仍然没有第二份画法",
      not any(k in page for k in ("fillRect", "measureText", "createLinearGradient")))

print(f"\n{'!!! 失败 ' + str(len(fails)) + ' 条：' + '、'.join(fails) if fails else '✓ 全过'}")
for n in notes:
    print("  · " + n)
sys.exit(1 if fails else 0)
