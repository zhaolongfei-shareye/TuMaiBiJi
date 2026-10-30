"""把 10-29 表十那份「域名 → 站名」对应表灌进后台那一栏（四级链第 1 级人工表）。

站长 10-30 那句「要把前期测试的对应表补充进去」。

跑法（口令一律不出那台机器、不进 argv、不回显）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/灌-后台来源站点名表.py

四步，顺序按"写坏了怎么办"排：
① 先把库里那一行原样备份到 `/tmp`（今天那一行是空的 ⇒ 备份就是一份空表，回滚＝回到"这一栏没填过"）；
② 行**从现网代码里那份词表现读**（`site_names.BUILTIN`），不在这里手抄一份名单——
   手抄那一份会漂，漂了以后没人说得清哪一份是真的；
③ 整份 PUT（不合格整份退回，不收半张表），PUT 完立刻从后台读回那一个口逐行逐字段比对；
④ 在现网进程里走一遍四级链，确认第 1 级真赢——**含"页面自报那一从此让位"那几族**，
   那几族屏上会换名字，这一支把它们逐条念出来。

⚠ 这一支**会改现网那张表**，而且「保存就是发布」：下一趟转存就按这张表念，不用发版、不用重启
（第 1 级每次转存现读库，进程里没有缓存那份表）。
⚠ 任何一条判据红 ⇒ 立刻把备份那份写回去，并以退出码 1 收场——不留"报了红、库里却已经改了"那种半趟
（第九轮审计 Y12 那条纪律：写现网的工具必须自带兜底与退出码）。
"""
import asyncio
import datetime
import json
import re
import sys

import httpx

from app.core.config import settings  # noqa: F401  （先导配置，后面那两只才起得来）
from app.db import database
from app.models.mp_asset import KIND_SITE_NAMES, MpSetting
from app.services import mp_assets, site_names
from sqlalchemy import text as sqltext

BASE = "http://127.0.0.1:8000"
KIND = KIND_SITE_NAMES
TABLE_PUT = f"{BASE}/api/admin/mp/tables/{KIND}"
STATE = f"{BASE}/api/admin/mp/state"
NOTE = "10-29 表十实测（第七十五次随词表上现网，10-30 灌进后台这一栏）"
# 页面自己报的那一串（表十「页面自报站名」那一列，10-29 13:0x 那趟的读数）。
# 只给"与词表不同名"的那几族写，为的是让屏上换名字这件事在表里留一句来历——
# 备注那一格是"只给自己看"的，不参与上屏，所以这里多写一个字都不影响用户看到什么。
SELF_REPORT = {
    "csdn.net": "CSDN博客",
    "arxiv.org": "arXiv.org",
    "sina.com.cn": "新浪网",
    "mp.weixin.qq.com": "微信公众平台",
    "sspai.com": "少数派 - 高品质数字消费指南",
}
# 第 1 级赢过第 2 级那几族的现网验证件：一条真链接形状＋页面自报那一句。
# 前三级一次网络都不发（第 2 级吃的是抓取那一趟已经读回来的串），所以这里只是喂形状。
PROOF = (
    ("https://c.m.163.com/news/a/LAD6VGQO00097U7T.html", "", "网易"),
    ("https://blog.csdn.net/some/article/1", "CSDN博客", "CSDN"),
    ("https://mp.weixin.qq.com/s/abcdefghij", "微信公众平台", "公众号"),
    ("https://www.sspai.com/post/12345", "少数派 - 高品质数字消费指南", "少数派"),
    ("https://www.guancha.cn/politics/2026_10_29_000000.shtml", "", ""),
)

fails = []


def ck(name, cond, extra=""):
    print(("  ✓ " if cond else "  ✗ ") + name + (f"　→ {extra}" if extra else ""))
    if not cond:
        fails.append(name)


def SQL(q):
    with database.engine.connect() as c:
        return c.execute(sqltext(q)).scalar()


def stored():
    row = database.SessionLocal().query(MpSetting).filter(MpSetting.kind == KIND).first()
    return None if row is None else row.text_value


def resolve(url, meta):
    return asyncio.run(site_names.resolve(database.SessionLocal(), url, meta_site_raw=meta))


print("== 0. 底数（只读） ==")
env = {}
with open(".env", encoding="utf-8") as f:
    for line in f:
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
ADMIN = env.get("ADMIN_TOKEN") or ""
ck(".env 里读到了管理口令（只数长度，不回显）", len(ADMIN) > 8, f"{len(ADMIN)} 位")
ck("现网跑的字节里有词表那一份（没这一枚＝这一支没有出处，不许灌）",
   bool(getattr(site_names, "BUILTIN", ())), f"{len(getattr(site_names, 'BUILTIN', ()))} 条")
ck("库里那一行存在（迁移 d8a3f1c60b47 跑过的直接证据）",
   SQL(f"select count(*) from mp_settings where kind='{KIND}'") == 1)
before = stored()
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
bak = f"/tmp/site-names-table-{stamp}.json"
with open(bak, "w", encoding="utf-8") as f:
    json.dump(before, f, ensure_ascii=False)
ck("写之前那一行已备份到 /tmp（回滚就是把它 PUT 回去）", True, bak)
print(f"  · 底数：这一栏现在 {len(before) if isinstance(before, list) else 0} 行｜"
      f"notes={SQL('select count(*) from notes')}｜上限现读＝"
      f"{mp_assets.TABLE_SPECS[KIND]['max_rows']} 行／站名 {mp_assets.MAX_SITE_CHARS} 字")

print("\n== 1. 那份对应表（现读词表，不手抄） ==")
spec = mp_assets.TABLE_SPECS[KIND]
rows = [
    {"domain": d, "zh": zh, "en": en,
     "note": (NOTE + f"；页面自报「{SELF_REPORT[d]}」，这一行盖住它") if d in SELF_REPORT else NOTE}
    for d, zh, en in site_names.BUILTIN
]
ck("行数没超这张表的上限", len(rows) <= spec["max_rows"], f"{len(rows)} ≤ {spec['max_rows']}")
ck("域名逐条都是纯主机名（带协议或路径＝那一行永远命中不了）",
   all(mp_assets._DOMAIN.match(r["domain"]) for r in rows))
ck("站名逐条不超上限（超了整份退回，这里先自己判掉）",
   all(0 < len(r["zh"]) <= spec["max_site_chars"] for r in rows))
ck("备注逐条不超上限", all(len(r["note"]) <= spec["max_note_chars"] for r in rows))
ck("同一家在这张表里只占一行（域名不重复）",
   len({r["domain"] for r in rows}) == len(rows))
for r in rows:
    print(f"  · {r['domain']:<20} {r['zh']:<12} {r['en']}")

print("\n== 2. 整份灌进去，并从后台那一个口读回 ==")
login = httpx.post(f"{BASE}/api/admin/login", json={"token": ADMIN}, timeout=30).json()
AU = {"Authorization": "Bearer " + (login.get("session") or "")}
ck("拿口令换到 session 票（值不进输出）", len(login.get("session") or "") > 20,
   f"{len(login.get('session') or '')} 位")
put = httpx.put(TABLE_PUT, json={"value": rows}, headers=AU, timeout=30)
ck("PUT 回 200（不合格会整份退回成 400，不收半张表）", put.status_code == 200,
   f"HTTP {put.status_code} {put.text[:120] if put.status_code != 200 else ''}")
after = put.json().get("current") if put.status_code == 200 else None
ck("回体里就是刚灌进去的那几行（逐字段）", after == rows,
   f"{len(after) if isinstance(after, list) else after} 行")
st = httpx.get(STATE, headers=AU, timeout=30).json()
tab = next((t for t in st.get("tables", []) if t.get("kind") == KIND), None)
ck("后台那一页读回的那一个口也念这几行（屏上画得出＝这一栏不是空着）",
   isinstance(tab, dict) and tab.get("current") == rows,
   f"{len(tab['current']) if isinstance(tab, dict) else '读不到'} 行")
ck("库里那一行与回体一字不差（不是接口自己拼的）", stored() == rows)

print("\n== 3. 第 1 级在现网真赢（含盖住页面自报那几族） ==")
for url, meta, want in PROOF:
    got = resolve(url, meta)
    zh = (got or {}).get("zh") or ""
    via = (got or {}).get("via") or ""
    if want:
        ck(f"{url[:44]}… → 「{want}」且来自这张表", zh == want and via == "table",
           f"实读 zh={zh!r} via={via!r}（页面自报喂的是 {meta!r}）")
    else:
        ck(f"{url[:44]}… 这张表里没有 ⇒ 不许硬认成表里任何一家",
           via != "table", f"实读 zh={zh!r} via={via!r}")

print("\n== 4. 收尾 ==")
if fails:
    print("  ! 有红 ⇒ 把备份那份写回去（这一栏退回灌之前的样子）")
    rb = httpx.put(TABLE_PUT, json={"value": before or None}, headers=AU, timeout=30)
    print(f"  · 回滚 PUT HTTP {rb.status_code}｜库里现在 "
          f"{len(stored()) if isinstance(stored(), list) else 0} 行")
print(f"\n结果：{len(fails)} 红｜备份在 {bak}")
sys.exit(1 if fails else 0)
