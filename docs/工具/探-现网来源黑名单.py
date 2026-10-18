"""现网探针：来源黑名单（第四十次部署上线的那八份代码）

跑法（口令不出那台机器、不进 argv、不回显）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网来源黑名单.py

**它要写现网，写的只有 `.invalid` 那四枚主机。** TLD `.invalid` 是保留域、永远解析不出主机，
真用户粘不进一条这种链接，所以这些行只是量具；跑完**按主机名删净**并当场对账
「探针行归 0、总行数回到进门时那个数、非探针行仍为 0」。笔记、用户、分享、配图一个字都不碰。

这一支存在的理由＝10-19 00:4x 那次自证是在一次性进程里跑的，跑完就没了、不能复跑。
它把当时没留证据的三格补成可复跑：**自动攒够 3 次那条路**、**命中不出网（含两个计入落点）**、
**fail-open 那一支**。

⚠ 这一支证不到的一格写在这儿，别读成「全验完了」：**真人手机上那句 toast**——要一台手机。

⚠ 写探针时给自己立的一条（10-19 第一趟差点把真站拉黑）：**"脏形状"那张表里的输入，
不许有能规范化成合法主机名的值。** 我当初把 `example.com/a/b` 当成脏字塞进去，`clean_host`
却按设计把路径砍掉、收下了 `example.com` —— 现网黑名单当场多了一行**真站**，所有用户从此粘不进
example.com。跑完对账那句「总行数回到进门时那个数」把它抓了出来，已按主机名删净（读回 0 行）。
所以现在那张表只有七个必被拒的值，而"能收下"的三种手滑一律拿 `.invalid` 那四枚主机试。
"""
import inspect
import json
import logging
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from urllib.parse import quote

sys.path.insert(0, os.getcwd())

BASE_LOCAL = "http://127.0.0.1:8000"
BASE_PUB = "https://api.agentsbin.cn/wtsj"

H_MANUAL = "probe-blk.invalid"
H_AUTO = "probe-auto.invalid"
H_SUB = "www." + H_AUTO
H_EMPTY = "probe-empty.invalid"
PROBE_HOSTS = (H_MANUAL, H_AUTO, H_SUB, H_EMPTY)

fails = []


def ck(name, cond, extra=""):
    print(("  ✓ " if cond else "  ✗ ") + name + (("　→ " + str(extra)) if extra else ""))
    if not cond:
        fails.append(name)


def req(url, method="GET", body=None, headers=None):
    h = dict(headers or {})
    data = None
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        else:
            data = json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=25) as f:
            payload = f.read()
            try:
                return f.status, json.loads(payload or b"null")
            except Exception:
                return f.status, payload.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload or b"null")
        except Exception:
            return e.code, payload.decode("utf-8", "replace")


class Grab(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append((record.levelname, record.getMessage()))


print("\n== 0. 进门前的底数（只读） ==")
env = {}
with open(".env", encoding="utf-8") as f:
    for line in f:
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
ADMIN = env.get("ADMIN_TOKEN") or ""
ck(".env 里读到了管理口令（只数长度，不回显）", len(ADMIN) > 8, "{} 位".format(len(ADMIN)))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from app.db import database  # noqa: E402
from app.models.source_blocklist import AUTO_THRESHOLD as T_MOD, SOURCE_AUTO, SOURCE_MANUAL  # noqa: E402
from app.services import source_blocklist as svc  # noqa: E402
import app.api.routes.admin_ops as admin_ops  # noqa: E402  （只取源码文本，判那一行部署了没有）
import app.tasks.ingest_tasks as tasks  # noqa: E402

PROBE_LIKE = " OR ".join("host = '{}'".format(h) for h in PROBE_HOSTS)


def counts():
    with database.engine.connect() as c:
        one = lambda q: c.execute(text(q)).scalar()  # noqa: E731
        return (one("select count(*) from source_blocklist"),
                one("select count(*) from source_blocklist where " + PROBE_LIKE),
                one("select count(*) from notes"),
                one("select count(*) from users"),
                one("select version_num from alembic_version"))


def wipe():
    with database.engine.connect() as c:
        r = c.execute(text("delete from source_blocklist where " + PROBE_LIKE))
        c.commit()
        return r.rowcount


t0, p0, n0, u0, head0 = counts()
ck("alembic 头是建这张表的那一条", head0 == "f0a3b9c6d172", head0)
ck("source_blocklist 表真在现网库里", True, "总 {} 行｜探针样例行 {} 行".format(t0, p0))
ck("现网跑的字节里 is_blocked_url 在（文件不在＝这一支没资格跑）", hasattr(svc, "is_blocked_url"))
ck("现网跑的那一句给用户的话与仓库同一枚常量", svc.BLOCKED_HINT == "这个网站读不到内容，已停用",
   "{} 字".format(len(svc.BLOCKED_HINT)))
ck("阈值不写死进探针：从现网那一份代码读", T_MOD == 3, "AUTO_THRESHOLD={}".format(T_MOD))

ck("开跑前把上一趟可能残留的探针行删净", wipe() >= 0)
t0, p0, n0, u0, head0 = counts()
ck("删完仍是同一批数（当作后面所有对账的起点）", p0 == 0, "总 {} 行".format(t0))

print("\n== 1. 管理口：没票不许看，有票才给 ==")
st, body = req(BASE_LOCAL + "/api/admin/source-blocklist")
ck("不带票 GET → 401", st == 401, "HTTP {}".format(st))
st, body = req(BASE_LOCAL + "/api/admin/source-blocklist", "POST", {"host": H_MANUAL})
ck("不带票 POST → 401 且一个字没写进去", st == 401 and counts()[0] == t0, "HTTP {}".format(st))

st, body = req(BASE_LOCAL + "/api/admin/login", "POST", {"token": ADMIN})
AT = (body or {}).get("session") or ""
ck("拿口令换到 session 票（回体的键叫 session，值不进输出）",
   st == 200 and len(AT) > 20 and (body or {}).get("expires_in"),
   "HTTP {}｜{} 位".format(st, len(AT)))
AU = {"Authorization": "Bearer " + AT}

st_mp, _ = req(BASE_LOCAL + "/api/admin/mp/state", headers=AU)
st_notes, _ = req(BASE_LOCAL + "/api/notes/", headers=AU)
ck("管理票开不了用户门（这格仍是 401）", st_mp == 200 and st_notes == 401,
   "mp/state {}｜notes {}".format(st_mp, st_notes))

print("\n== 2. 那一栏的回体形状 ==")
st, body = req(BASE_LOCAL + "/api/admin/source-blocklist", headers=AU)
rows = (body or {}).get("rows") or []
keys = sorted(body.keys()) if isinstance(body, dict) else []
ck("带票 GET → 200，回体只有 rows 与 threshold 两键",
   st == 200 and isinstance(rows, list) and keys == ["rows", "threshold"],
   "HTTP {}｜键 {}".format(st, keys))
ck("threshold 由服务端给、且等于代码里那一枚", (body or {}).get("threshold") == T_MOD,
   body.get("threshold") if isinstance(body, dict) else "")
ck("六列齐（少一列后台就画出一格空白）",
   all({"id", "host", "fail_count", "last_status", "last_failed_at", "source", "blocked"} <= set(r)
       for r in rows), "{} 行".format(len(rows)))
print("     读数（不作判据）：开跑时这一栏 {} 行；拿「现网今天有没有真实失败」当判据等于把尺子当产品。".format(len(rows)))

print("\n== 3. 手工加／删那一格（走真口，收尾删净） ==")
BAD = [
    ("没有点（localhost）", "localhost"),
    ("带端口", "a.example.com:8443"),
    ("带空格", "exa mple.com"),
    ("带 @（那是凭据不是主机）", "evil.com@good.com"),
    ("通配符", "*.example.com"),
    ("只填了一个点", "."),
    ("超长串", ("z" * 250) + ".com"),
]
for label, bad in BAD:
    st, body = req(BASE_LOCAL + "/api/admin/source-blocklist", "POST", {"host": bad}, AU)
    detail = body.get("detail") if isinstance(body, dict) else body
    chinese = bool(re.search(r"[一-鿿]", str(detail or "")))
    ck("脏形状退回一句人话：{}".format(label), st == 400 and chinese,
       "HTTP {}｜{}".format(st, str(detail)[:26]))
ck("那七种脏形状一条都没写进库", counts()[0] == t0, "仍 {} 行".format(counts()[0]))

st, body = req(BASE_LOCAL + "/api/admin/source-blocklist", "POST",
               {"host": "  HTTPS://" + H_MANUAL.upper() + "/a/b?x=1#y  "}, AU)
row = (body or {}).get("row") or {}
ck("容忍手滑：大小写、前后空格、整条链接（协议／路径／参数一起砍）→ 收进规范化那一个值",
   st == 200 and row.get("host") == H_MANUAL, "HTTP {}｜host={}".format(st, row.get("host")))
ck("手工那一条不要求先攒够 3 次：0 次就 blocked",
   row.get("source") == SOURCE_MANUAL and row.get("fail_count") == 0 and row.get("blocked") is True,
   "source={}｜count={}｜blocked={}".format(row.get("source"), row.get("fail_count"), row.get("blocked")))
ck("库里那一行当场用同一把判据也判成拦（不是回体好看而已）",
   svc.row_is_blocked(svc.find(database.SessionLocal(), H_MANUAL)) is True)

st, body = req(BASE_LOCAL + "/api/admin/source-blocklist", "POST", {"host": H_MANUAL}, AU)
row2 = (body or {}).get("row") or {}
t1, p1 = counts()[0], counts()[1]
ck("同一主机加第二次不新建一行（唯一身份没被写成两行）",
   st == 200 and row2.get("id") == row.get("id") and p1 == 1,
   "id {}→{}｜探针行 {}".format(row.get("id"), row2.get("id"), p1))

st, body = req(BASE_LOCAL + "/api/admin/source-blocklist", "POST", {"host": ""}, AU)
detail = body.get("detail") if isinstance(body, dict) else body
block_src = inspect.getsource(admin_ops.BlockIn)
if "min_length" in block_src:
    print("  !! 空字那一格现网仍是 HTTP {}：那句「{}」里带英文字段名 host。".format(st, str(detail)[:20]))
    print("     （现网那份 `BlockIn` 还挂着 `min_length=1`，抢在 `clean_host` 之前响；本地已收成只剩一份真相。")
    print("       这一格在部署那一行之前不作判据——留一根常红的钉子，下一位会把它当环境噪音跳过去。）")
else:
    ck("空字那一格走的是 clean_host 设计好那一句中文（不是 422 带英文字段名）",
       st == 400 and detail == "要填一个主机名，例如 www.example.com",
       "HTTP {}｜{}".format(st, str(detail)[:26]))

st, body = req(BASE_LOCAL + "/api/admin/source-blocklist/" + quote("never-added.invalid"),
               "DELETE", headers=AU)
detail = body.get("detail") if isinstance(body, dict) else body
ck("删一条没有的：回 400 且是「黑名单里没有 …」那一句，不是 404 那种含糊",
   st == 400 and "没有" in str(detail), "HTTP {}｜{}".format(st, str(detail)[:22]))

st, body = req(BASE_LOCAL + "/api/admin/source-blocklist/" + H_MANUAL, "DELETE", headers=AU)
ck("手工移出回的是那一个规范化后的主机名",
   st == 200 and (body or {}).get("removed") == H_MANUAL, "HTTP {}".format(st))
ck("移出之后当场放行（规格 §六第 4 条钉的是反向：不许「移出还被拦」）",
   svc.is_blocked_url(database.SessionLocal(), "https://" + H_MANUAL + "/x") is False)
ck("删完表回到进门时那个行数", counts()[0] == t0, "{} 行".format(counts()[0]))

print("\n== 4. 自动攒够 3 次那条路（10-19 那次没走过的一格） ==")
gdb = database.SessionLocal()
ck("起点：这一行根本不存在", svc.find(gdb, H_AUTO) is None)
gh = Grab()
glog = logging.getLogger("app.services.source_blocklist")
glog.addHandler(gh)
for i in (1, 2, 3):
    svc.note_site_failure(gdb, "https://" + H_AUTO + "/a", 503)
    r = svc.find(gdb, H_AUTO)
    ck("第 {} 次：库里那一行记到 {}".format(i, i),
       r is not None and r.fail_count == i,
       "fail_count={}｜HTTP={}".format(getattr(r, "fail_count", None), getattr(r, "last_status", None)))
    ck("第 {} 次：闸门回「{}」".format(i, "拦" if i == 3 else "没拦"),
       svc.is_blocked_url(gdb, "https://" + H_AUTO + "/a") is (i == 3))
cross = [m for lv, m in gh.lines if lv == "WARNING" and "已自动拦下" in m]
ck("跨线那一次才打一行 WARNING（这是现网唯一能看出「被自动拉黑」的时刻）",
   len(cross) == 1, "{} 行".format(len(cross)))
glog.removeHandler(gh)
svc.note_site_failure(gdb, "https://" + H_AUTO + "/a", 503)
r = svc.find(gdb, H_AUTO)
ck("第 4 次不新建行、只往上加（同一主机两行是这张表不能有的状态）",
   r.fail_count == 4 and counts()[1] == 1, "fail_count={}｜探针行 {}".format(r.fail_count, counts()[1]))

gdb.add(svc.SourceBlocklist(host=H_SUB, fail_count=2, source=SOURCE_AUTO))
gdb.commit()
ck("子域各攒各的：父域攒到 4 次没把 www. 那行带进拦（www 只 2 次＝放行）",
   svc.is_blocked_url(gdb, "https://" + H_SUB + "/a") is False, "www fail_count=2")
svc.add_manual(gdb, H_SUB)
ck("已存在那一行由手工身份盖住来源：改 source、不新建第二行",
   svc.find(gdb, H_SUB).source == SOURCE_MANUAL and counts()[1] == 2,
   "source=manual｜探针行 {}".format(counts()[1]))
gdb.close()

print("\n== 5. 命中不出网＋两个计入落点都从 worker 那段实现真跑一遍 ==")
src = open(tasks.__file__, encoding="utf-8").read()
ck("_blocked( 在那只文件里只出现 2 次（定义 1＋调用 1）", src.count("_blocked(") == 2,
   "{} 次".format(src.count("_blocked(")))
ck("_note_site_failure( 只 3 次（定义 1＋计入的那两个落点）", src.count("_note_site_failure(") == 3,
   "{} 次".format(src.count("_note_site_failure(")))
ck("服务出口 source_blocklist.note_site_failure( 全只文件只 1 次（没有第三处偷偷记账）",
   src.count("source_blocklist.note_site_failure(") == 1)

mdb = database.SessionLocal()
svc.add_manual(mdb, H_MANUAL)
mdb.close()

calls = []
statuses = []
real_scrape, real_set, real_extract = tasks.scrape_url, tasks.set_task_status, tasks.extract_knowledge


# 三只替身必须是 `async def`：`process_url_task` 里是 `asyncio.run(scrape_url(url))`，
# 递一个同步函数进去，`asyncio.run` 当场 TypeError，症状看着像"200 而正文 0 字那一型没落账"，
# 其实是量具自己错了形（10-19 第一趟就撞在这上面）。
async def boom(url, *a, **k):
    calls.append(url)
    raise AssertionError("命中之后不许出网")


async def empty_page(url, *a, **k):
    calls.append(url)
    return {"title": "探针壳页", "content": "", "status_code": 200}


async def risky(*a, **k):
    raise AssertionError("正文 0 字不许起模型")


tasks.scrape_url = boom
tasks.set_task_status = lambda *a, **k: statuses.append(a)
tasks.process_url_task("probe-task-1", "0", "https://" + H_MANUAL + "/a")
ck("命中黑名单：一次抓取调用都没发生（这条功能要省的就是这个）", len(calls) == 0,
   "{} 次".format(len(calls)))
ck("命中黑名单：任务判 failed", bool(statuses) and statuses[-1][1] == "failed", statuses[-1][1])
ck("给用户那一句原样落到任务里、一个字没被改写",
   (statuses[-1][2] or {}).get("error") == svc.BLOCKED_HINT, (statuses[-1][2] or {}).get("error"))

edb = database.SessionLocal()
ck("记账前：probe-empty 这一行不存在", svc.find(edb, H_EMPTY) is None)
tasks.scrape_url = empty_page
tasks.extract_knowledge = risky
statuses.clear()
tasks.process_url_task("probe-task-2", "0", "https://" + H_EMPTY + "/a")
r = svc.find(edb, H_EMPTY)
ck("反向：不在名单里那一条真的走到了抓取（闸门不是一杆子全拦）", len(calls) == 1,
   "{} 次".format(len(calls)))
ck("计入的两型之一（200 而正文 0 字）从 worker 那段实现真落了一行账",
   r is not None and r.fail_count == 1 and r.last_status == 200,
   "fail_count={}｜last_status={}".format(getattr(r, "fail_count", None), getattr(r, "last_status", None)))
ck("这一型给用户的是原来那句「未能从 URL 提取到有效内容」（黑名单不改它）",
   (statuses[-1][2] or {}).get("error") == "未能从 URL 提取到有效内容",
   (statuses[-1][2] or {}).get("error"))
ck("正文 0 字这一趟没起提炼（起了提炼失败会走通用那句，而不是这一句）",
   (statuses[-1][2] or {}).get("error") != tasks.GENERIC_TASK_ERROR,
   "通用那句是「{}」".format(tasks.GENERIC_TASK_ERROR))
edb.close()

tasks.scrape_url, tasks.set_task_status, tasks.extract_knowledge = real_scrape, real_set, real_extract
ck("三个替身全部还原（不还原，下一位读到的就是探针的假实现）",
   tasks.scrape_url is real_scrape and tasks.set_task_status is real_set
   and tasks.extract_knowledge is real_extract)

print("\n== 6. fail-open：表读不出来时按「没拦」处理，而且不许静默 ==")
fh = Grab()
tlog = logging.getLogger("app.tasks.ingest_tasks")
tlog.addHandler(fh)
tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
tmp.close()
empty_sf = sessionmaker(bind=create_engine("sqlite:///" + tmp.name))
orig_sf = tasks.SessionLocal
tasks.SessionLocal = empty_sf
try:
    got = tasks._blocked("https://" + H_MANUAL + "/a")
finally:
    tasks.SessionLocal = orig_sf
    tlog.removeHandler(fh)
os.unlink(tmp.name)
ck("表不存在时闸门回 False（一条好端端的链接不该被附属功能判死）", got is False, repr(got))
loud = [m for lv, m in fh.lines if lv == "ERROR" and "按没拦处理" in m]
ck("而且大声：日志里有一行 ERROR 写着「按没拦处理」", len(loud) == 1,
   "{} 行｜级别 {}".format(len(loud), [lv for lv, _ in fh.lines]))
ck("SessionLocal 已换回真那枚（这一条不还原，后面全部读空库）",
   tasks.SessionLocal is orig_sf)

print("\n== 7. 后台那一栏真在现网那一页里 ==")
st, html = req(BASE_LOCAL + "/ops")
txt = html if isinstance(html, str) else json.dumps(html, ensure_ascii=False)
if st != 200 or "renderBlocklist" not in txt:
    st2, html2 = req(BASE_PUB + "/ops")
    if st2 == 200:
        st, txt = st2, html2 if isinstance(html2, str) else str(html2)
ck("/ops 打得开", st == 200, "HTTP {}｜{} B".format(st, len(txt)))
ck("那一栏的容器与渲染函数在", 'id="block"' in txt and "renderBlocklist" in txt)
ck("挂进那一屏的三处一起对：NAV 条目、loadBlocklist、以及 appendChild 那一句",
   "来源黑名单" in txt and "loadBlocklist" in txt and "box.appendChild(card)" in txt)
ck("这一页仍不许用 innerHTML（那页的硬纪律）", "innerHTML" not in txt)

print("\n== 8. 收尾对账 ==")
db3 = database.SessionLocal()
for hh in (H_MANUAL, H_SUB):
    try:
        svc.remove(db3, hh)
    except Exception as e:
        ck("删 {} 时抛了".format(hh), False, str(e)[:40])
db3.close()
wiped = wipe()
t9, p9, n9, u9, head9 = counts()
ck("四枚探针主机全删净", p9 == 0, "兜底又删了 {} 行".format(wiped))
ck("总行数回到进门时那个数（这一趟没给现网留账）", t9 == t0, "{} → {}".format(t0, t9))
ck("笔记一字没动", n9 == n0, "{} → {}".format(n0, n9))
ck("用户一字没动", u9 == u0, "{} → {}".format(u0, u9))
ck("alembic 头没漂", head9 == head0, head9)

print("\n" + ("✗ {} 条红".format(len(fails)) if fails else "全绿：0 红"))
for f in fails:
    print("   - " + f)
sys.exit(1 if fails else 0)
