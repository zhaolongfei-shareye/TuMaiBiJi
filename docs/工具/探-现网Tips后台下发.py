"""现网探针：`/ops` 那组「文案栏」在服务器上到底通不通（第二十五次首跑；这一支＝第五十四次加出第二栏后再跑）。

为什么单开一支而不是把上面那份图探针改改：图那条链要往上传字节、算 sha256，文案这条链要的是
**一整份退回**——不合格的那一次不能只丢半句、更不能把上一份好的覆盖成半份。两种判据混在一份
文件里，红了读不出是"上传没落地"还是"闸门漏水"。

这条链在本地 pytest 全绿只证明这份代码；现网那台 nginx 前缀转不转、`.env` 里那把钥匙是不是这一把、
库里 `text_value` 那一栏真加上了没有、`/ops` 那一栏真渲染出来了没有——只有从公网打一次才知道
（见 `[[feedback-green-tests-not-release-ready]]`：部署后必须再跑现网探针）。

⚠⚠ **这一支写的永远是 `about_intro`，永远不是 `tips`**（10-21 准备跑它时查出两条，都得记住）：
1. **`tips` 那栏此刻装着站长 10-15 亲手填的七句真文案**（现网实读：中文七句／英文七句，**两份内容不同**）。
   探针没有权利为了"验一条写路"去动真人看得见的那一份。
2. 旧版这一支收尾是 `put({"zh": BEFORE, "en": BEFORE})`，而 `BEFORE` 只抄了 `zh` 那一排
   ⇒ **跑一趟就把他那七句英文顶成中文**，而它自己打印那句「zh/en 都按原样」是假的。
   所以写目标整支搬到 `about_intro`：这一栏现网是**空的**，而且**没有任何已发布的客户端读它**
   （线上那份 `_saveTexts` 按名只读 `config.tips`）⇒ 同一个 `PUT /api/admin/mp/texts/{kind}`、
   同一套整份退回闸门、同一个收回路径，在它上面验**覆盖不减、对真人零影响**。跑完撤成 `null`。
   ⚠ 但**覆盖确实少了一条**：`lines` 那一栏的现网写路这一支不再验了（10-15 那七句能留在位上本身就是它通了的事实）。

管理口令**从标准输入读**，绝不进命令行参数、绝不回显：`ps` 里看得见 argv。跑法：

    ssh agentsbin 'sed -n "s/^ADMIN_TOKEN=//p" /home/ubuntu/wtsj-backend/.env' \\
      | backend/.venv/bin/python docs/工具/探-现网Tips后台下发.py

要打本地那台（**改过这一支必须先彩排再碰现网**，与 poster 那支同一条规矩）带 `PROBE_BASE`，
例如 `PROBE_BASE=http://127.0.0.1:8123/wtsj`。
默认跑完把这一栏**放回进来时那一份**（进来是空的就撤成空）；留在位上接着查用户口加 `--keep`；只放回加 `--revert`。

上限（形状、字数、两份语言）一律从 `/api/admin/mp/state` 的回体现读，不写死：
后台改了上限而这里还钉着旧数，红的是尺子不是产品。
"""
import json
import os
import sys

import httpx

BASE = os.environ.get("PROBE_BASE", "https://api.agentsbin.cn/wtsj")
KEEP = "--keep" in sys.argv
REVERT_ONLY = "--revert" in sys.argv
# 写路径只走这一栏。要换别的 kind，先回答一句："现网那一栏里有没有真人正在看的字？"
KIND = "about_intro"

# 探针自己那份，与包里那段、与站长将来填的那段都无关：形状合法就行。
GOOD = {
    "zh": "探针这一段只用于现网自证，跑完就撤；形状是整段一段话，不是一排短句。",
    "en": "Probe paragraph for the live check only; reverted at the end, one paragraph not a list.",
}

fails = []


def check(label, ok, detail=""):
    print(f"  {'✓' if ok else '✗'} {label}{('　→ ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


token = sys.stdin.read().strip()
if not token:
    print("✗ 标准输入里没读到管理口令（按上面那条 ssh | python 的跑法给它）")
    raise SystemExit(2)

h = httpx.Client(timeout=30.0, verify=True)

print(f"① 登录（打的这一台：{BASE}）")
r = h.post(f"{BASE}/api/admin/login", json={"token": token})
check("POST /api/admin/login", r.status_code == 200, f"{r.status_code}")
if r.status_code != 200:
    print("   回体：", r.text[:200])
    raise SystemExit(1)
auth = {"Authorization": f"Bearer {r.json()['session']}"}


def state():
    return h.get(f"{BASE}/api/admin/mp/state", headers=auth).json()


def texts_of(st):
    return {t.get("kind"): t for t in (st.get("texts") or [])}


def current_of(st, kind):
    return (texts_of(st).get(kind) or {}).get("current")


def put(value, kind=KIND):
    return h.put(f"{BASE}/api/admin/mp/texts/{kind}", headers=auth, json={"value": value})


print("② 两栏都在、各读各的规格；tips 那份真文案只看一眼、一个字不写")
st = state()
check("GET /api/admin/mp/state 带 texts 组", st.get("texts") is not None, f"组：{sorted(st.keys())}")
texts = texts_of(st)
check("文案组里两栏都在（少一栏＝后端注册了、后台画不出，屏上永远读不到）",
      {"tips", KIND} <= set(texts), f"组里：{sorted(texts)}")
TIPS_BEFORE = current_of(st, "tips")
if TIPS_BEFORE:
    print(f"   tips 现读：中文 {len(TIPS_BEFORE.get('zh') or [])} 句／英文 {len(TIPS_BEFORE.get('en') or [])} 句"
          "（两份内容不同 ⇒ 这一支探针一律不写它）")
else:
    print("   tips 现读：空的（首屏用包里那六句）")
t0 = texts.get(KIND)
if t0 is None:
    print("✗ 写目标那一栏不在组里（没注册／迁移没跑），后面没法跑")
    raise SystemExit(1)
SHAPE = t0.get("shape")
MAX_CHARS = t0.get("max_chars")
LANGS = t0.get("langs") or []
check("shape／上限／语言三条都给了（缺一条＝网页只能把数抄第二份，两处迟早分叉）",
      bool(SHAPE) and bool(MAX_CHARS) and len(LANGS) >= 1,
      f"shape={SHAPE} max_chars={MAX_CHARS} langs={LANGS}")
check("写目标这一栏是整段那个形状（跑到 lines 那栏上去＝把一段话当一排短句塞）",
      SHAPE == "paragraph", str(SHAPE))
BEFORE = t0.get("current")
print(f"   进来时这一栏是：{'已有一份（跑完原样放回，两份都按原样）' if BEFORE else '空的（撤完还它空的）'}")

if REVERT_ONLY:
    r = put(BEFORE)
    check("收回：PUT 回进来时那一份", r.status_code == 200, f"{r.status_code}")
    cur = current_of(state(), KIND)
    check("位上回到进来时那一份", (cur is None) if BEFORE is None else cur == BEFORE,
          json.dumps(cur, ensure_ascii=False)[:120])
    print("\n" + ("收回完成" if not fails else f"✗ {len(fails)} 条不过：{fails}"))
    raise SystemExit(0 if not fails else 1)

print("③ 发一份合法的（两份语言、各一整段）")
r = put(GOOD)
check(f"PUT /api/admin/mp/texts/{KIND}", r.status_code == 200,
      f"{r.status_code} {r.text[:160] if r.status_code != 200 else ''}")
if r.status_code != 200:
    raise SystemExit(1)
back = r.json()["current"]
check("回体就是发过去的那份（一字不吞、不重排）", back["zh"] == GOOD["zh"] and back["en"] == GOOD["en"],
      f"zh {len(back['zh'])} 字／en {len(back['en'])} 字")
# `updated_at` 只在用户那道口（/api/mp/config）给，客户端拿它当"本机那份要不要换"的判据；
# 后台这个写回体里没有是设计如此（判"改过没有"看用户口，别在这里加一个没人读的键）。
check("写回体形状就是 {zh, en}", sorted(back.keys()) == ["en", "zh"], f"键：{sorted(back.keys())}")
check("state 读回同一份", current_of(state(), KIND) and current_of(state(), KIND)["zh"] == GOOD["zh"],
      json.dumps(current_of(state(), KIND), ensure_ascii=False)[:120])
check("写这一栏没把 tips 带上（那栏 current 与②读到的逐字相等）",
      current_of(state(), "tips") == TIPS_BEFORE, "两份读数逐字相等")

print("④ 闸门：脏的那几次必须整份退回，且留在位上的那一份一个字不许变")


def rejected(label, body, why, code=400):
    r = h.put(f"{BASE}/api/admin/mp/texts/{KIND}", headers=auth, json={"value": body})
    same = current_of(state(), KIND)
    ok = r.status_code == code and same and same.get("zh") == GOOD["zh"]
    check(label, ok, f"{r.status_code}（要 {code}）　{why}　留在位上的那一份："
                     f"{(same or {}).get('zh', '')[:24] if same is not None else '【被改成空了！】'}")


TOO_LONG = "这" * (int(MAX_CHARS) + 1)
rejected("整段超过上限被拒", {"zh": TOO_LONG, "en": "ok"}, f"上限 {MAX_CHARS} 字，塞了 {len(TOO_LONG)} 字")
rejected("空段被拒", {"zh": "   ", "en": "ok"}, "那一格只剩空白（strip 之后是空串）")
rejected("给成句子列表被拒", {"zh": ["一句", "两句"], "en": ["a", "b"]},
         "整段那一栏要串不要数组：收了屏上按『一句一段』排，跟他要的连着排不是一回事")
rejected("给的不是字符串", {"zh": 123, "en": "ok"}, "那一格给的是数字")
rejected("缺一份语言被拒", {"zh": "只有中文一份"}, f"只给了 zh，缺 {LANGS}")
# value 给成列表：Pydantic 在门口就挡了，422 而不是 400。
# 钉它是因为这两种码在界面上读法不同——422＝请求本身不合法，压根没走到"整份退回"那道闸门。
rejected("给的不是 {zh, en} 那个形状", ["不是对象"], "value 给成列表，FastAPI 先拦", code=422)
r = h.put(f"{BASE}/api/admin/mp/texts/__nope__", headers=auth, json={"value": GOOD})
check("未知 kind 被拒（文案那一排只认闭集）", r.status_code == 400, f"{r.status_code} {r.text[:100]}")

print("⑤ 用户那一排门：管理凭证开不了，且没登录也开不了")
check("GET /api/mp/config 用管理 session → 401",
      h.get(f"{BASE}/api/mp/config", headers=auth).status_code == 401)
check("GET /api/mp/config 不带凭证 → 401",
      h.get(f"{BASE}/api/mp/config").status_code == 401)

print("⑥ 后台那一页真把两栏文案都画出来了")
r = h.get(f"{BASE}/ops")
html = r.text
check("GET /ops", r.status_code == 200, f"{r.status_code} {len(html)}B")
check("页面里有文案那一栏的挂载点", 'id="texts"' in html)
check("页面标题已改口成「运营后台」", "运营后台" in html)
check("两份语言各一个文本框（不是只有一个）", html.count("textarea") >= 2, f"textarea 出现 {html.count('textarea')} 次")
check("左栏真挂了「关于介绍」那一格（接口绿了不等于屏上有这一栏）",
      "text:about_intro" in html and "关于介绍" in html)
check("页面按 shape 分两支画（整段那栏画成一排短句＝他要的东西没做出来）", "isPara" in html)

print("⑥·B 两栏的规格各归各（只读）")
texts2 = texts_of(state())
i0 = texts2.get(KIND) or {}
check("整段那一栏 shape 是 paragraph、Tips 那栏是 lines（两栏共用形状＝后台会把一段切成一排短句）",
      i0.get("shape") == "paragraph" and (texts2.get("tips") or {}).get("shape") == "lines",
      f"about_intro.shape={i0.get('shape')}")
cap_i = i0.get("max_chars")
cap_t = (texts2.get("tips") or {}).get("max_chars")
check("两栏上限各归各（同一个数＝要么介绍放不进去，要么 Tips 撑爆那只 9em 盒子）",
      bool(cap_i) and bool(cap_t) and cap_i != cap_t, f"介绍 {cap_i}／Tips {cap_t}")
check("停用那一句有出处（网页抄一句『包里那六句』对这一栏就是念半句假话）",
      bool(i0.get("empty_text")), str(i0.get("empty_text"))[:60])
check("用户口那一条仍要登录才给（多一栏不改鉴权口径）",
      h.get(f"{BASE}/api/mp/config").status_code == 401)

print("⑦ 收尾")
if KEEP:
    check("--keep：留在位上的就是探针那一份（下一步要拿它验用户口，验完记得 --revert）",
          current_of(state(), KIND) is not None)
else:
    r = put(BEFORE)
    check("跑完原样放回（没替站长留测试文案）", r.status_code == 200,
          f"{r.status_code}　放回的是：{'原来那一份' if BEFORE else 'null＝空的，界面上念包里那段'}")
    cur = current_of(state(), KIND)
    check("位上确实回到进来时那一份", (cur is None) if BEFORE is None else cur == BEFORE,
          json.dumps(cur, ensure_ascii=False)[:120])
    check("全程没动过 tips（那栏 current 到现在仍与②逐字相等）",
          current_of(state(), "tips") == TIPS_BEFORE, "读数逐字相等")

print("\n" + ("探针全过" if not fails else f"✗ {len(fails)} 条不过：{fails}"))
raise SystemExit(0 if not fails else 1)
