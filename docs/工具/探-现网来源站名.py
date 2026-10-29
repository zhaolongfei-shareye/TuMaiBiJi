"""现网探针：来源站名这一格（第七十五次部署，2026-10-29 他一句「部署」）。

跑法（口令一律不出那台机器、不进 argv、不回显）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网来源站名.py

它证的六件事，按"这一格在现网真长什么样"排：
① 那条迁移真跑了——`mp_settings` 里多出第四组那一行、且今天是**空的**（④甲：不回填存量）；
② 后台那一栏的 HTML 里有那一条（本机那把真点尺子量的是本机进程，这一半只有部署后才读得到）；
③ 四级链的**次序**在现网也成立：人工表赢过页面自报，表一撤就退到下一级；
④ 第 4 级（AI）在现网是**关着**的——`.env` 里那一行没配（部署云函数另要他一句口令），
   所以这一趟一道模型调用都不该发；这里直接量闸门的读数，不拿"日志里没看到"当证据；
⑤ 端到端真存一篇（他点名那一族：网易文章页），看**库里那一格**、**详情接口**、**列表接口**
   三处是不是同一个名字，并逐字判"不许出现「文章」「笔记」后缀"（②丙唯一的牙）；
⑥ 卡片引擎那只新文件（`sourceLabel.js`）进了名单、且每一只与名单里记的 md5 对得上——
   对不上就 503，那一栏屏上念"预览引擎没加载成"（这一族"一变必重启"，重启没做成就红在这）。

⚠ 第 1/2 级那两条只喂**主机名**与页面自报那一句，`resolve()` 在前三级一次网络都不发，
   所以那两条用的地址形状是夹具，不是"现网真读过这一家"的证据——真读过的是第 5 节那一发。
"""
import asyncio
import json
import re
import time

import httpx
from sqlalchemy import text

from app.core.auth import _sign
from app.db import database
from app.models.mp_asset import MpSetting
from app.models.note import Note
from app.models.user import User
from app.services import llm, mp_assets, poster_engine, site_names

BASE = "http://127.0.0.1:8000"
KIND = "site_names"
NETEASE_URL = "https://c.m.163.com/news/a/LAD6VGQO00097U7T.html"
# 这一家**故意选在内置词表之外**（现读 `BUILTIN` 21 族里没有它）：只有它才能证"第 1 级真接在链上"。
LONGTAIL_HOST = "www.guancha.cn"
LONGTAIL_FIXTURE = "https://www.guancha.cn/"
PROBE_ZH = "观察者网"

fails = []


def ck(name, cond, extra=""):
    print(("  ✓ " if cond else "  ✗ ") + name + (f"　→ {extra}" if extra else ""))
    if not cond:
        fails.append(name)


def SQL(q):
    with database.engine.connect() as c:
        return c.execute(text(q)).scalar()


def stored():
    r = database.SessionLocal().query(MpSetting).filter(MpSetting.kind == KIND).first()
    return None if r is None else r.text_value


def table_put(value, token):
    return httpx.put(f"{BASE}/api/admin/mp/tables/{KIND}",
                     json={"value": value}, headers=token, timeout=30)


def resolve(url, meta=""):
    return asyncio.run(site_names.resolve(database.SessionLocal(), url, meta_site_raw=meta))


print("\n== 0. 底数（只读） ==")
env = {}
with open(".env", encoding="utf-8") as f:
    for line in f:
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
ADMIN = env.get("ADMIN_TOKEN") or ""
ck(".env 里读到了管理口令（只数长度，不回显）", len(ADMIN) > 8, f"{len(ADMIN)} 位")
ck("现网跑的字节里有这一族（文件没传上来＝这一支没资格跑）",
   hasattr(site_names, "resolve") and hasattr(site_names, "snapshot_fields"))
ck("库里那一行存在（迁移 d8a3f1c60b47 跑过的直接证据）",
   SQL("select count(*) from mp_settings where kind='site_names'") == 1)
ck("alembic 头已是这一条", SQL("select version_num from alembic_version") == "d8a3f1c60b47",
   SQL("select version_num from alembic_version"))
ck("④甲：那一行今天是空的（存量没回填）", not stored(), repr(stored()))
ck("④甲：库里没有一篇带站名（部署前不该有）",
   SQL("select count(*) from notes where imported_from like '%site_name%'") == 0)
notes0 = SQL("select count(*) from notes")
print(f"  · 底数：notes={notes0}｜这一栏的上限现读模型＝站名 {mp_assets.MAX_SITE_CHARS} 字")

print("\n== 1. 后台那一栏的 HTML（部署后才读得到的那一半） ==")
html = httpx.get(f"{BASE}/ops", timeout=30).text
ck("左栏有「来源站点名」那一条", "来源站点名" in html)
ck("页面走的是表栏那一个新口（不是手拼别的地址）", "api/admin/mp/tables/" in html)
ck("卡片真挂进那一格（少这一句就是函数跑了、屏上什么都没有）",
   "tbbox.appendChild(tableCardFor(b))" in html)

print("\n== 2. 管理口：没票不许写 ==")
st = httpx.put(f"{BASE}/api/admin/mp/tables/{KIND}", json={"value": []}, timeout=30)
ck("不带票 PUT → 401，且那一行没被写", st.status_code == 401 and not stored(),
   f"HTTP {st.status_code}")
login = httpx.post(f"{BASE}/api/admin/login", json={"token": ADMIN}, timeout=30).json()
AU = {"Authorization": "Bearer " + (login.get("session") or "")}
ck("拿口令换到 session 票（值不进输出）", len(login.get("session") or "") > 20,
   f"{len(login.get('session') or '')} 位")

print("\n== 3. 四级链的次序（在现网进程里走一遍，前三级一次网络都不发） ==")
r1 = resolve(NETEASE_URL)
ck("第 3 级：网易这一族由内置词表报出「网易」",
   r1.get("zh") == "网易" and r1.get("via") == "builtin", json.dumps(r1, ensure_ascii=False))
# ⚠ 第 2 级吃的是**已经从页面里抽出来的那一句**（`scraper` 那一层负责抽），不是整段 HTML。
#    第一版探针把整枚 `<meta property=… content=…>` 标签当值喂进来，当场读到空——
#    红的是探针不是这一级：那串远超 12 字那道闸，本来就该判脏。下面补两条把这件事钉住。
META = "滑风网 "
r2 = resolve(LONGTAIL_FIXTURE, META)
ck("第 2 级：词表不认识这一家时，用页面自报那一句（尾随空格清掉）",
   r2.get("zh") == "滑风网" and r2.get("via") == "meta", json.dumps(r2, ensure_ascii=False))
r2b = resolve(LONGTAIL_FIXTURE, '<meta property="og:site_name" content="滑风网">')
ck("整段标签当值喂进来也不采纳（脏值在这一级判掉，不上屏）", r2b == {},
   json.dumps(r2b, ensure_ascii=False))
r2c = resolve(LONGTAIL_FIXTURE, "滑风网 - 旗下原创平台")
ck("站名后面挂 slogan（带分隔符）也判脏", r2c == {}, json.dumps(r2c, ensure_ascii=False))

st = table_put([{"domain": LONGTAIL_HOST, "zh": PROBE_ZH, "en": "Guanchazhe", "note": "探针临时行"}], AU)
ck("写一行进第 1 级 → 200", st.status_code == 200, f"HTTP {st.status_code}")
ck("读回逐字相等（站名就是「观察者网」，代码没拼任何后缀）",
   st.json().get("current") == [{"domain": LONGTAIL_HOST, "zh": PROBE_ZH,
                                 "en": "Guanchazhe", "note": "探针临时行"}],
   json.dumps(st.json().get("current"), ensure_ascii=False))
r3 = resolve(LONGTAIL_FIXTURE, META)
ck("第 1 级赢过第 2 级：同一条 URL，表里那一个覆盖页面自报",
   r3.get("zh") == PROBE_ZH and r3.get("via") == "table", json.dumps(r3, ensure_ascii=False))
ck("库里那一行存的就是这张表（一行一家，不是整句）",
   isinstance(stored(), list) and len(stored()) == 1, repr(stored()))

ck("域名里混进协议 → 整份退回（不收半张表）",
   table_put([{"domain": "https://带协议进来/", "zh": "不该收"}], AU).status_code == 400)
ck("同一域名出现两次 → 退回（填了不生效的格子比报错更气人）",
   table_put([{"domain": LONGTAIL_HOST, "zh": PROBE_ZH},
              {"domain": LONGTAIL_HOST, "zh": "同一家的第二行"}], AU).status_code == 400)
ck(f"超过 {mp_assets.MAX_SITE_CHARS} 字 → 退回（上限只有模型那一个出处）",
   table_put([{"domain": "over-limit.example", "zh": "名" * (mp_assets.MAX_SITE_CHARS + 1)}], AU)
   .status_code == 400)
keep = table_put([{"domain": "suffix.example", "zh": "例子网文章"}], AU)
ck("他自己往表里写「例子网文章」也照原样收（②丙：屏上念什么全由那一格决定，代码不加工）",
   keep.status_code == 200 and keep.json()["current"][0]["zh"] == "例子网文章",
   json.dumps(keep.json().get("current"), ensure_ascii=False))

st = table_put(None, AU)
ck("停用这一栏（PUT null）→ 200", st.status_code == 200, f"HTTP {st.status_code}")
ck("停用是**留行不留值**：那一行还在，而读不出任何一家",
   SQL("select count(*) from mp_settings where kind='site_names'") == 1 and not stored(),
   repr(stored()))
r4 = resolve(LONGTAIL_FIXTURE, META)
ck("撤掉第 1 级之后，同一条 URL 退到第 2 级（不是当场没名字）",
   r4.get("zh") == "滑风网" and r4.get("via") == "meta", json.dumps(r4, ensure_ascii=False))

print("\n== 4. 第 4 级那道闸门（他还没给「部署云函数」那一句） ==")
ck("现网 `.env` 里没有那条函数的地址（这一趟一行 `.env` 都没动）",
   "SITE_NAME_CF_URL" not in env, f"键数 {len(env)}")
ck("闸门读数＝这一级整级跳过", llm.site_channel_ready() is False, llm.site_channel_ready())
ck("直接打第 4 级也回空＝一次出网都不发",
   asyncio.run(site_names.ai_site("https://anything.example/x", "任意标题", "任意正文")) == {})
r5 = resolve("https://totally-unknown-host-75.example/page.html")
ck("前三级全落空 ⇒ 这一篇就是没有站名（不许猜、不许编「未知网站」这种串）",
   r5 == {}, json.dumps(r5, ensure_ascii=False))

print("\n== 5. 端到端：真存一篇网易文章页（走真 worker、真出网、真建篇） ==")
db = database.SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
assert u, "找不到 deploy-test 那个号，停手"
H = {"Authorization": f"Bearer {_sign(str(u.id), u.generation or 1)}"}
assets0 = SQL("select count(*) from assets")
tid = httpx.post(f"{BASE}/api/ingest/url", data={"url": NETEASE_URL}, headers=H, timeout=60) \
    .json().get("task_id")
ck("转存那一趟收下了（起任务成功）", bool(tid), f"task={tid}")
status = note_id = None
for _ in range(40):
    time.sleep(3)
    stt = httpx.get(f"{BASE}/api/tasks/{tid}", headers=H, timeout=30).json()
    status = stt.get("status")
    if status in ("completed", "failed"):
        note_id = (stt.get("result") or {}).get("note_id")
        break
ck("worker 跑完＝completed", status == "completed",
   f"status={status}｜note_id={note_id}")
note = db.get(Note, note_id) if note_id else None
snap = note.imported_from if note and isinstance(note.imported_from, dict) else {}
ck("库里那一格有站名", bool(snap.get("site_name")),
   json.dumps({k: snap.get(k) for k in ("site_name", "site_name_en", "source_url")}, ensure_ascii=False))
ck("②丙：那一格念「网易」两字，**没有**「文章」「笔记」任何后缀",
   snap.get("site_name") == "网易", repr(snap.get("site_name")))
ck("写口只有 `snapshot_fields` 那一处（快照里就是那两个键，没多出第三个）",
   {"site_name", "site_name_en"} <= set(snap), sorted(snap))
det = httpx.get(f"{BASE}/api/notes/{note_id}", headers=H, timeout=30).json()
ck("详情接口把这一格带出来了（与库里逐字相同）",
   det.get("source_site") == snap.get("site_name"), repr(det.get("source_site")))
lst = httpx.get(f"{BASE}/api/notes/", params={"limit": 50}, headers=H, timeout=30).json()
items = lst if isinstance(lst, list) else lst.get("items", [])
mine = [x for x in items if x.get("id") == note_id]
ck("列表接口也带这一格（客户端那一枚吃的就是它）",
   bool(mine) and mine[0].get("source_site") == "网易",
   repr(mine[0].get("source_site") if mine else None))
ck("⑤甲：这一族没有作者名，而来源那一行现在判「作者名**或**站名」⇒ 有站名就算来源篇",
   bool(mine) and mine[0].get("has_source") is True,
   f"has_source={mine[0].get('has_source') if mine else None}｜作者名={snap.get('author_name')!r}")
ck("source_type 仍在六档里（配额与后台来源分布那条线没被动）",
   note.source_type == "web_article", note.source_type)
d = httpx.delete(f"{BASE}/api/notes/{note_id}", headers=H, timeout=60)
ck("收尾删净这一篇", d.status_code == 200, f"HTTP {d.status_code}")
db.expire_all()
ck("notes 计数回到开跑前", SQL("select count(*) from notes") == notes0,
   f"{SQL('select count(*) from notes')} vs {notes0}")
print(f"  · assets：开跑前 {assets0} → 现在 {SQL('select count(*) from assets')}"
      "（这一篇带的那几张正文图的对象只能客户端删，记在 #337 那格账上）")
ck("除了刚删那篇，库里仍没有一篇带站名（④甲再量一遍）",
   SQL("select count(*) from notes where imported_from like '%site_name%'") == 0)

print("\n== 6. 卡片引擎那一格（名单一变必重启；md5 对不上就 503） ==")
ck("引擎在现网进程里加载得成", poster_engine.ready() is True)
ck("名单里已有 `sourceLabel.js` 这一只", "sourceLabel.js" in poster_engine.names(),
   f"{len(poster_engine.names())} 只")
try:
    body, etag = poster_engine.bundle()
    ck("名单里每一只与盘上逐字对得上（`source()` 里那道 md5 闸门没抛）", True,
       f"{len(body):,} B｜ETag {etag[:12]}")
except ValueError as exc:
    ck("名单里每一只与盘上逐字对得上（`source()` 里那道 md5 闸门没抛）", False, str(exc)[:120])
eng = httpx.get(f"{BASE}/api/admin/poster/engine", headers=AU, timeout=30)
ck("预览口回 200（对不上就是 503，那一栏念「预览引擎没加载成」）",
   eng.status_code == 200, f"HTTP {eng.status_code}｜{len(eng.content):,} B")

print("\n== 7. 那一栏恢复成迁移刚建出来那一态 ==")
ck("收尾时这一栏是停用的（探针写的那几行没留在现网）",
   not stored() and SQL("select count(*) from mp_settings where kind='site_names'") == 1,
   repr(stored()))

print(f"\n结论：{'全部过，0 条红' if not fails else str(len(fails)) + ' 条红'}"
      + ("" if not fails else "　｜" + "、".join(fails)))
