"""现网探针：卡片模板配方这一路的下发端（方案 docs/方案-卡片模板不走发版.md §四、§八 P0-6）。

本地 pytest 与那三把尺子能证明"包内那十套转成配方之后一张像素没变"、能证明闸门会把脏的整套丢，
证明不了**现网这台跑的正是这批字节**。三种漏法都只有现网能抓到：
① 迁移没跑到 a7d2e5b8c310（那张表压根不存在，接口 404，而客户端把 404 咽了——界面照画包内那十套，
   站长以为新模板生效了，用户看到的还是老卡片，这条静默是这一整批最贵的一种）；
② 代码传上去了但只重启了 worker 没重启 API（路由不在跑着的那个进程里）；
③ 表建了、种子没灌（deploy.sh 那一步 1.7 被跳过）→ 接口回空数组，客户端合并列表退回包内十项，
   现象与②一模一样，但从界面上看不出来。

**10-06 本机彩排（`probes/rehearse_poster_probe.sh`）翻出这支探针自己有两处不行，都改了**：
③ 当时抓不到——"接口行数 == 库里行数"在两边都是 0 时照样成立，所以补了一条"live 不许是零行"的地板；
① 当时不报红而是抛 SQLAlchemy 堆栈（一屏看不懂的栈，等于没给结论），所以先查一次表在不在。
改探针必须重跑那一趟彩排，三档预期（全绿／红在零行／红在没表）钉在彩排脚本里。

用法（服务器上跑，**必须先 cd 到项目目录**：家目录那份 .env 是另一个项目的）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/poster_templates_live_probe.py

只用 deploy-test（users.id=1）这一个账号，且**通篇只读**：不写库、不建笔记、不碰内容安全额度，
所以收尾没什么可还原的。token 是本机签出来直接打现网用的，不落盘。
"""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import inspect as sa_inspect

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.poster_template import GROUP_KEYS, PosterTemplate
from app.models.user import User
from app.services.poster_recipe import validate_recipe
from app.services.poster_templates import content_hash_of, seed_rows

# 默认打现网；PROBE_BASE 只给"本机彩排"用（10-06 加：这支探针上线前一次都没跑过，
# 而它自己就有过一条判据是虚的——见下面"live 一行都没有"那条，不彩排永远发现不了）。
BASE = os.environ.get("PROBE_BASE", "https://api.agentsbin.cn/wtsj").rstrip("/")
PATH = "/api/poster/templates/"
FIELDS = {
    "template_id", "label", "label_en", "group_key",
    "sort_order", "min_app_version", "content_hash", "recipe",
}

results = []


def ck(name, ok, got=""):
    results.append((bool(ok), name))
    print(f"{'✓' if ok else '✗'} {name}{'' if got == '' else f'　→ {got}'}")


with SessionLocal() as db:
    me = db.get(User, 1)
    assert me is not None, "users.id=1（deploy-test）不在库里，这支探针只准跑在它身上"
    token = _create_token(me.id)
    # 开头说的第①种漏法（迁移没跑到，表压根不存在）今天彩排出来的是这个脸色：
    # 下面那句 query 直接抛 sqlalchemy 的 OperationalError，一屏堆栈，看不出该干什么。
    # 先查一次表在不在，红就红得能说人话。
    if "poster_templates" not in set(sa_inspect(db.get_bind()).get_table_names()):
        ck("库里那张表在（①迁移没跑到 a7d2e5b8c310 就是这一条红）", False, "库里没有 poster_templates 这张表")
        print("\n红 1 条：表都还没建出来，先跑部署（alembic 会把它带上来），再回来跑这支。")
        sys.exit(1)
    db_rows = db.query(PosterTemplate).filter(PosterTemplate.status == "live").all()

hdr = {"Authorization": f"Bearer {token}"}
r = httpx.get(f"{BASE}{PATH}", headers=hdr, timeout=30)

if r.status_code == 404:
    ck("接口在现网存在（404＝这批根本没部署）", False, "404：那张表或那条路由不在跑着的那个进程里")
    print(f"\n红 1 条：现网还没这一路。先部署（deploy.sh 第 1.7 步会灌种子），再回来跑这支。")
    sys.exit(1)

body = r.json() if r.status_code == 200 else None
ck("带着 deploy-test 的 token 打过去回 200", r.status_code == 200, f"HTTP {r.status_code}")
ck("回的是数组（客户端 applyRemoteTemplates 第一眼就问这条，不是数组就整批判脏）",
   isinstance(body, list), type(body).__name__)

rows = body if isinstance(body, list) else []
# 本文件开头说的第③种漏法（表建了、种子没灌）在这里必须是红，但"接口行数 == 库里行数"抓不到它：
# 两边都是 0，等式照样成立。所以先单独钉一条地板——live 零行就是没灌，不是"刚好都空着"。
# 种子那份 JSON 是**部署件**（不在代码里），读不到时要报成一条红，不能抛栈——
# 一屏看不懂的栈等于没给结论（10-06 彩排为同样的毛病改过这支探针一次，今天又犯在另一条上）。
try:
    种子那句 = f"种子那边有 {len(seed_rows())} 套"
except Exception as e:
    种子那句 = f"种子文件读不到：{type(e).__name__} {e}"
ck(f"库里 live 不是零行（deploy.sh 那一步 1.7 真跑过；{种子那句}）",
   len(db_rows) > 0, f"库里 live {len(db_rows)} 行 / 接口 {len(rows)} 条")
ck(f"现网 live 的行数与库里一致（接口 {len(rows)} / 库里 {len(db_rows)}）",
   len(rows) == len(db_rows), f"差 {len(rows) - len(db_rows)}")
ids = [str(x.get("template_id")) for x in rows]
ck("同一个 template_id 在响应里只出现一次（一条模板最多一行 live 由那条部分唯一索引兜着）",
   len(set(ids)) == len(ids), "重复：" + "、".join(sorted({i for i in ids if ids.count(i) > 1})))

for x in rows:
    tid = str(x.get("template_id"))
    ck(f"{tid}：八个字段齐", set(x.keys()) == FIELDS, f"多的 {set(x.keys()) - FIELDS} 少的 {FIELDS - set(x.keys())}")
    ck(f"{tid}：配方过服务端那份名单", validate_recipe(x.get("recipe") or {}) == [], str(validate_recipe(x.get("recipe") or {}))[:90])
    ck(f"{tid}：配方自己的 id 与这一行一致", (x.get("recipe") or {}).get("id") == tid, str((x.get("recipe") or {}).get("id")))
    ck(f"{tid}：分组在那两档里", x.get("group_key") in GROUP_KEYS, str(x.get("group_key")))
    ck(f"{tid}：包版本门槛是三段号（客户端按段比数，不是按字符串比）",
       bool(re.fullmatch(r"\d+\.\d+\.\d+", str(x.get("min_app_version") or ""))), str(x.get("min_app_version")))
    ck(f"{tid}：content_hash 与现算的那一份对得上（改了配方没重算 hash＝客户端缓存判据是假的）",
       x.get("content_hash") == content_hash_of(x.get("recipe") or {}),
       f"接口 {x.get('content_hash')} / 现算 {content_hash_of(x.get('recipe') or {})}")

anon = httpx.get(f"{BASE}{PATH}", timeout=30)
ck("不带 token 打过去回 401（这接口要登录；openid 从不下发，但配方也不该谁都能读）",
   anon.status_code == 401, f"HTTP {anon.status_code}")

red = sum(1 for ok, _ in results if not ok)
print(f"\n{len(results)} 条，红 {red} 条")
sys.exit(1 if red else 0)
