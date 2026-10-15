"""现网探针：后台那一栏「文案」在服务器上到底通不通（第二十五次部署后必跑）。

为什么单开一支而不是把上面那份图探针改改：图那条链要往上传字节、算 sha256，文案这条链要的是
**一整份退回**——不合格的那一次不能只丢半句、更不能把上一份好的覆盖成半份。两种判据混在一份
文件里，红了读不出是"上传没落地"还是"闸门漏水"。

这条链在本地 pytest 全绿只证明这份代码；现网那台 nginx 前缀转不转、`.env` 里那把钥匙是不是这一把、
库里 `text_value` 那一栏真加上了没有、`/ops` 那一栏真渲染出来了没有——只有从公网打一次才知道
（见 `[[feedback-green-tests-not-release-ready]]`：部署后必须再跑现网探针）。

管理口令**从标准输入读**，绝不进命令行参数、绝不回显：`ps` 里看得见 argv。跑法：

    ssh agentsbin 'sed -n "s/^ADMIN_TOKEN=//p" /home/ubuntu/wtsj-backend/.env' \\
      | backend/.venv/bin/python docs/工具/探-现网Tips后台下发.py

默认**跑完收回停用**（那栏回到包里那六句）——现网真实用户看到的字归站长点「发布」，
探针不许替他留一份测试文案。要留在设好那份接着查用户口，加 `--keep`；只收回，加 `--revert`。

上限（条数、每句字数、两份语言）一律从 `/api/admin/mp/state` 的回体现读，不写死：
后台改了上限而这里还钉着旧数，红的是尺子不是产品。
"""
import json
import sys

import httpx

BASE = "https://api.agentsbin.cn/wtsj"
KEEP = "--keep" in sys.argv
REVERT_ONLY = "--revert" in sys.argv

# 探针自己那份，跟包里那六句、跟站长将来填的那份都无关：只要形状合法就行。
GOOD = {
    "zh": ["探针第一句（现网）", "探针第二句（现网）"],
    "en": ["probe line one", "probe line two"],
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

print("① 登录")
r = h.post(f"{BASE}/api/admin/login", json={"token": token})
check("POST /api/admin/login", r.status_code == 200, f"{r.status_code}")
if r.status_code != 200:
    print("   回体：", r.text[:200])
    raise SystemExit(1)
auth = {"Authorization": f"Bearer {r.json()['session']}"}


def state():
    return h.get(f"{BASE}/api/admin/mp/state", headers=auth).json()


def tips_of(st):
    for t in st.get("texts") or []:
        if t.get("kind") == "tips":
            return t
    return None


def put(value):
    return h.put(f"{BASE}/api/admin/mp/texts/tips", headers=auth, json={"value": value})


print("② 状态那一栏里有「文案」这一组，且上限是从回体读的")
st = state()
check("GET /api/admin/mp/state 带 texts 组", st.get("texts") is not None,
      f"组：{sorted(st.keys())}")
t0 = tips_of(st)
check("tips 这一条在", t0 is not None, json.dumps(t0, ensure_ascii=False)[:160] if t0 else "没有")
if t0 is None:
    raise SystemExit(1)
MAX_ITEMS = t0.get("max_items")
MAX_CHARS = t0.get("max_chars")
LANGS = t0.get("langs") or []
check("上限三条都给了", bool(MAX_ITEMS) and bool(MAX_CHARS) and len(LANGS) >= 1,
      f"max_items={MAX_ITEMS} max_chars={MAX_CHARS} langs={LANGS}")
BEFORE_FULL = t0.get("current")
BEFORE = (BEFORE_FULL or {}).get("zh")
print(f"   进来时那一栏是：{'已有一份（探针跑完原样放回，zh/en 都按原样）' if BEFORE else '空的（停用＝用包里那六句）'}")

if REVERT_ONLY:
    r = put(None)
    check("PUT value=null 收回停用", r.status_code == 200 and (r.json().get("current") is None),
          f"{r.status_code}")
    check("state 里也回 null", (tips_of(state()) or {}).get("current") is None)
    print("\n" + ("收回完成" if not fails else f"✗ {len(fails)} 条不过：{fails}"))
    raise SystemExit(0 if not fails else 1)

print("③ 发一份合法的（两份语言、各两句）")
r = put(GOOD)
check("PUT /api/admin/mp/texts/tips", r.status_code == 200, f"{r.status_code} {r.text[:160] if r.status_code != 200 else ''}")
if r.status_code != 200:
    raise SystemExit(1)
back = r.json()["current"]
check("回体就是发过去的那份（一字不吞、不重排）", back["zh"] == GOOD["zh"] and back["en"] == GOOD["en"],
      f"zh={len(back['zh'])}句 en={len(back['en'])}句")
# `updated_at` 只在用户那道口（/api/mp/config）给，客户端拿它当"本机那份要不要换"的判据；
# 后台这个写回体里没有是设计如此（判"改过没有"看用户口，别在这里加一个没人读的键）。
check("写回体形状就是 {zh, en}", sorted(back.keys()) == ["en", "zh"], f"键：{sorted(back.keys())}")
t1 = tips_of(state())
check("state 读回同一份", (t1 or {}).get("current") and (t1["current"]["zh"] == GOOD["zh"]),
      json.dumps((t1 or {}).get("current"), ensure_ascii=False)[:120])

print("④ 闸门：脏的那几次必须整份退回，且屏上那份一个字不许变")


def rejected(label, body, why, code=400):
    r = h.put(f"{BASE}/api/admin/mp/texts/tips", headers=auth, json={"value": body})
    same = (tips_of(state()) or {}).get("current")
    ok = r.status_code == code and same and same.get("zh") == GOOD["zh"]
    check(label, ok, f"{r.status_code}（要 {code}）　{why}　留在位上的那一份："
                     f"{(same or {}).get('zh') if same is not None else '【被改成空了！】'}")


LONG = "这一句故意写得很长很长" * 20
rejected(
    "超条数被拒", {"zh": ["句"] * (int(MAX_ITEMS) + 1), "en": ["x"] * (int(MAX_ITEMS) + 1)},
    f"上限 {MAX_ITEMS} 句，塞了 {int(MAX_ITEMS) + 1} 句",
)
rejected(
    "单句超长被拒", {"zh": [LONG], "en": ["ok"]},
    f"每句上限 {MAX_CHARS} 字，塞了 {len(LONG)} 字",
)
rejected("空句被拒", {"zh": ["有一句是空的", ""], "en": ["ok"]}, "第 2 句是空串")
rejected("非字符串被拒", {"zh": [123], "en": ["ok"]}, "那一格给的是数字")
rejected("缺一份语言被拒", {"zh": ["只有中文"]}, f"只给了 zh，缺 {LANGS}")
# 给的不是那个形状（这里是列表）：Pydantic 在门口就挡了，422 而不是 400。
# 钉它是因为这两种码在界面上读法不同——422＝请求本身不合法，压根没走到"整份退回"那道闸门。
rejected("给的不是 {zh, en} 那个形状", ["不是对象"], "value 给成列表，FastAPI 先拦", code=422)
r = h.put(f"{BASE}/api/admin/mp/texts/__nope__", headers=auth, json={"value": GOOD})
check("未知 kind 被拒（文案那一排只认闭集）", r.status_code == 400, f"{r.status_code} {r.text[:100]}")

print("⑤ 用户那一排门：管理凭证开不了，且没登录也开不了")
check("GET /api/mp/config 用管理 session → 401",
      h.get(f"{BASE}/api/mp/config", headers=auth).status_code == 401)
check("GET /api/mp/config 不带凭证 → 401",
      h.get(f"{BASE}/api/mp/config").status_code == 401)

print("⑥ 后台那一页真把「文案」渲染出来了")
r = h.get(f"{BASE}/ops")
html = r.text
check("GET /ops", r.status_code == 200, f"{r.status_code} {len(html)}B")
check("页面里有文案那一栏的挂载点", 'id="texts"' in html)
check("页面标题已改口成「运营后台」", "运营后台" in html, "标题/大标题里读到了" if "运营后台" in html else "")
check("两份语言各一个文本框（不是只有一个）", html.count("textarea") >= 2, f"textarea 出现 {html.count('textarea')} 次")

print("⑦ 收尾")
if KEEP:
    check("--keep：留在位上的就是探针那一份（下一步要拿它验用户口，验完记得 --revert）",
          (tips_of(state()) or {}).get("current") is not None)
else:
    OLD = {"zh": BEFORE, "en": BEFORE} if BEFORE else None
    r = put(OLD if BEFORE else None)
    check("跑完原样放回（没替站长留测试文案）", r.status_code == 200,
          f"{r.status_code}　放回的是：{'原来那一份' if BEFORE else 'null＝停用，回包里那六句'}")
    cur = (tips_of(state()) or {}).get("current")
    check("位上确实干净了", (cur is None) if not BEFORE else cur.get("zh") == BEFORE,
          json.dumps(cur, ensure_ascii=False)[:120])

print("\n" + ("探针全过" if not fails else f"✗ {len(fails)} 条不过：{fails}"))
raise SystemExit(0 if not fails else 1)
