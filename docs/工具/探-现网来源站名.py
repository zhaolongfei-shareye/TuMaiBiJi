"""现网探针：来源站名这一格（第七十五次部署起用，2026-10-29 他一句「部署」；
第七十六次他一句「全部搞完」，第 4 级那一档从"整级跳过"改成"开工并在真发几发"）。

跑法（口令一律不出那台机器、不进 argv、不回显）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网来源站名.py

它证的六件事，按"这一格在现网真长什么样"排：
① 那条迁移真跑了——`mp_settings` 里多出第四组那一行；**这一栏今天有没有内容是变的**
   （10-29 灌之前是空的，10-30 站长一句「要把前期测试的对应表补充进去」⇒ 走
   `docs/工具/灌-后台来源站点名表.py` 灌进 21 行），所以这一支**开跑前先把那一行备份、
   收尾逐字还回去**，不再假设它是空的、也不许把它跑成空的；
② 后台那一栏的 HTML 里有那一条（本机那把真点尺子量的是本机进程，这一半只有部署后才读得到）；
③ 四级链的**次序**在现网也成立：人工表赢过页面自报，表一撤就退到下一级
   （10-30 起这一栏非空 ⇒ "词表那一级本身认不认得网易"要临时撤开第 1 级才量得到，撤完立刻装回）；
④ 第 4 级（AI）**已经开工**：第七十六次那一句「全部搞完」之后，`.env` 里那一行配上、
   云函数 `site_name` 已部署 ⇒ 这里量闸门的**开**读数、并真发几发看认不认得出长尾那一家；
   这一节还留一条反向的牙：认不出那一家时**不许编一个名字出来**（宁可这一篇没有站名）；
⑤ 端到端真存一篇（他点名那一族：网易文章页），看**库里那一格**、**详情接口**、**列表接口**
   三处是不是同一个名字，并逐字判"不许出现「文章」「笔记」后缀"（②丙唯一的牙）；
⑥ 卡片引擎那只新文件（`sourceLabel.js`）进了名单、且每一只与名单里记的 md5 对得上——
   对不上就 503，那一栏屏上念"预览引擎没加载成"（这一族"一变必重启"，重启没做成就红在这）。

⚠ 第 1/2/3 级那几条只喂**主机名**与页面自报那一句，`resolve()` 在前三级一次网络都不发，
   所以那几条用的地址形状是夹具，不是"现网真读过这一家"的证据——真读过的是第 5 节那一发；
   第 4 级那几条**确实真出网**，但出的是**那一发模型调用**（送域名＋标题），仍然不抓那一页。
"""
import asyncio
import atexit
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
# 第 4 级那两档用的域名。⚠ `36kr.com` **现读不在内置词表那 21 族里**，而路径是编的：
# 这一条链的前三级只看域名与页面自报那一句，第 4 级送给模型的也就是域名＋标题＋开头，
# 一次都不抓这一页 ⇒ 这里没有"现网真读过 36氪"的意思，真出网的是**那一发模型调用**。
AI_LONGTAIL_URL = "https://36kr.com/p/3070000000000"
AI_UNKNOWN_URL = "https://totally-unknown-host-76.example/page.html"

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
原表 = stored()
BAK = f"/tmp/探针备份-site_names-{time.strftime('%Y%m%d-%H%M%S')}.json"
with open(BAK, "w", encoding="utf-8") as f:
    json.dump(原表, f, ensure_ascii=False)
ck("开跑前那一行已备份（收尾要还回这一份，**不是**还回空）", True,
   f"{len(原表) if isinstance(原表, list) else 0} 行 → {BAK}")
ck("④甲：库里没有一篇带站名（存量不回填）",
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
ck("不带票 PUT → 401，且那一行逐字没动（拿开跑前那一份比，不比「是不是空」）",
   st.status_code == 401 and stored() == 原表, f"HTTP {st.status_code}")
login = httpx.post(f"{BASE}/api/admin/login", json={"token": ADMIN}, timeout=30).json()
AU = {"Authorization": "Bearer " + (login.get("session") or "")}
ck("拿口令换到 session 票（值不进输出）", len(login.get("session") or "") > 20,
   f"{len(login.get('session') or '')} 位")


已还原 = False


def 还原():
    """收尾必须把这一栏还回开跑前那一份——10-30 起那一栏**有内容了**（站长灌的那张对应表），
    还回空＝把人家填的东西删了。挂在 `atexit` 上：中途抛异常也照跑（Y12 兜底那一半）。
    做成只跑一次：第 7 节自己调一遍好让判据量到还原之后的读数，`atexit` 那一遍就跳过。"""
    global 已还原
    if 已还原:
        return
    已还原 = True
    try:
        back = httpx.put(f"{BASE}/api/admin/mp/tables/{KIND}",
                         json={"value": 原表 if 原表 else None}, headers=AU, timeout=30)
        print(f"  · 收尾还原：PUT {back.status_code}｜库里现在 "
              f"{len(stored()) if isinstance(stored(), list) else 0} 行"
              f"（开跑前 {len(原表) if isinstance(原表, list) else 0} 行）")
    except Exception as exc:
        print(f"  ! 收尾还原没走成 ⇒ 手工把 {BAK} 那一份 PUT 回去：{type(exc).__name__}: {exc}")


atexit.register(还原)

print("\n== 3. 四级链的次序（在现网进程里走一遍；除挂在「认得出的域名」上的那一条，都不发网络） ==")
# ⚠ 10-30 起这一栏里灌着站长那张对应表（`灌-后台来源站点名表.py`），第 1 级会盖住第 3 级。
#    所以"词表这一级本身对不对"要先把第 1 级临时撤开、量完立刻装回去——
#    撤与装这两步本身就是「谁说了算」那条次序的现网读数，不是绕开判据。
table_put(None, AU)
r1 = resolve(NETEASE_URL)
ck("第 3 级：临时撤掉第 1 级之后，网易这一族由内置词表报出「网易」",
   r1.get("zh") == "网易" and r1.get("via") == "builtin", json.dumps(r1, ensure_ascii=False))
back = table_put(原表, AU)
ck("装回开跑前那一份（PUT 回 200 且库里逐字相等；这一句红＝后面每一条量的都是空表那一态）",
   back.status_code == 200 and stored() == 原表,
   f"HTTP {back.status_code}｜库里 {len(stored()) if isinstance(stored(), list) else 0} 行"
   f"｜开跑前 {len(原表) if isinstance(原表, list) else 0} 行")
r1b = resolve(NETEASE_URL)
ck("第 1 级装回去就盖住第 3 级：同一条 URL 改由这张表报出（次序不许重排的那条牙）",
   r1b.get("zh") == "网易" and r1b.get("via") == "table", json.dumps(r1b, ensure_ascii=False))
# ⚠ 第 2 级吃的是**已经从页面里抽出来的那一句**（`scraper` 那一层负责抽），不是整段 HTML。
#    第一版探针把整枚 `<meta property=… content=…>` 标签当值喂进来，当场读到空——
#    红的是探针不是这一级：那串远超 12 字那道闸，本来就该判脏。下面补三条把这件事钉住。
#    ⚠ 第七十六次起第 4 级开工，"判脏"不再是"这一篇没名字"而是"这一句不许上屏、链子往下走"，
#    所以前两条把域名换成**模型也认不出的一家**（整条链落空才量得到"那一句没进屏"），
#    第三条再拿同一句脏值换到认得出的域名上，量它退到了哪一级。
META = "滑风网 "
r2 = resolve(LONGTAIL_FIXTURE, META)
ck("第 2 级：词表不认识这一家时，用页面自报那一句（尾随空格清掉）",
   r2.get("zh") == "滑风网" and r2.get("via") == "meta", json.dumps(r2, ensure_ascii=False))
r2b = resolve(AI_UNKNOWN_URL, '<meta property="og:site_name" content="滑风网">')
ck("整段标签当值喂进来绝不作为站名上屏（脏值在这一级判掉）", r2b == {},
   json.dumps(r2b, ensure_ascii=False))
r2c = resolve(AI_UNKNOWN_URL, "滑风网 - 旗下原创平台")
ck("站名后面挂 slogan（带分隔符）也判脏：那一句没上屏", r2c == {},
   json.dumps(r2c, ensure_ascii=False))
r2d = resolve(LONGTAIL_FIXTURE, "滑风网 - 旗下原创平台")
ck("同一句脏值换到模型认得出的域名：判脏后**退下一级**，屏上那个名字不来自这一句",
   r2d.get("via") == "ai" and r2d.get("zh") == PROBE_ZH, json.dumps(r2d, ensure_ascii=False))

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

print("\n== 4. 第 4 级那道闸门（第七十六次起已开工：函数已部署＋`.env` 那一行已配） ==")
ck("现网 `.env` 里有那条函数的地址（尾巴＝site_name）",
   env.get("SITE_NAME_CF_URL", "").endswith("/site_name"),
   f"键数 {len(env)}｜地址长度 {len(env.get('SITE_NAME_CF_URL', ''))}")
ck("闸门读数＝这一级开工（provider 没关／地址配了／凭据不是占位符）",
   # 10-30 起这一句是 `async`（与真调用同取一把钥，见 Y3），所以要 `asyncio.run` 取。
   asyncio.run(llm.site_channel_ready()) is True,
   f"闸门回 {asyncio.run(llm.site_channel_ready())}")
ai_hit = asyncio.run(site_names.ai_site(AI_LONGTAIL_URL, "小米发布新款自研芯片", "开头一段正文。"))
ck("真发一发：长尾那一家认得出来（名字非空、via 记的是 ai）",
   bool(ai_hit.get("zh")) and ai_hit.get("via") == "ai", json.dumps(ai_hit, ensure_ascii=False))
r5 = resolve(AI_LONGTAIL_URL)
ck("前三级全落空的那一条 ⇒ 链子走到第 4 级才拿到名字（内置表里没这一族，不是抄表抄来的）",
   r5.get("via") == "ai" and bool(r5.get("zh")), json.dumps(r5, ensure_ascii=False))
ai_miss = asyncio.run(site_names.ai_site(AI_UNKNOWN_URL, "", ""))
ck("认不出那一家就是没有站名（不许拿「未知网站」这类串顶上——那条硬约束在现网唯一的牙）",
   ai_miss == {}, json.dumps(ai_miss, ensure_ascii=False))
ck("同一条 URL 走完整条链也是空（闸门开了不等于非要凑一个）",
   resolve(AI_UNKNOWN_URL) == {}, repr(resolve(AI_UNKNOWN_URL)))

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

print("\n== 7. 收尾：这一栏还回开跑前那一份（10-30 起那一份是站长灌进去的对应表，不是空态） ==")
还原()
ck("还回开跑前那一份、逐字相等（探针写的那几行没留下，人家填的也没被删）",
   stored() == 原表 and SQL("select count(*) from mp_settings where kind='site_names'") == 1,
   f"{len(stored()) if isinstance(stored(), list) else 0} 行｜备份 {BAK}")

print(f"\n结论：{'全部过，0 条红' if not fails else str(len(fails)) + ' 条红'}"
      + ("" if not fails else "　｜" + "、".join(fails)))
