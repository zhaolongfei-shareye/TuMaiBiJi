"""现网探针：外链贴图随笔记存档这条链（2026-10-19 第四十二次部署后跑）。

跑法（口令凭据一律不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网外链贴图.py

它做的事：拿 deploy-test 那个号（服务端自己签 token）把两条真链接打进生产的抓取队列，
等 worker 跑完，然后**四处对账**：任务回体的四个计数 / 库里那几行 `assets` /
详情接口的 `imported_from` / 配图那一口的条数与配额那一格的增量，最后删净。
期望值一律**不从应用自己的常量或谓词里 import**（共用一把尺子就永远红不了），
只有张数上限这一枚是故意读模型的——那条判的就是"现网跑的这份代码里那个数是 9"。

⚠ 10-29 第七十四次补的一格：**这一族（通用档）本来就没有作者名**，而列表那一枚来源标
判的正是"快照里有没有作者名"那一条老规则（`notes.py:230`），
所以拿原来那两条硬判据去打网易这类文章页会当场两条红——那两条红不是坏，是尺子只会量两族。
现在换成可换档：**默认还是那两条老链接**，要量别的族用环境变量递进去（值不进 argv、不落仓库）：
    PROBE_URL=https://… PROBE_LABEL=网易·文章页 PROBE_EXPECT_AUTHOR=0 \\
      ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网外链贴图.py
`PROBE_EXPECT_AUTHOR=0` 那档只把**作者名那一条**翻成"这一族的现状"：作者名**该是空**，
仍然逐条念出来，不许静默跳过——空着不判就等于没量。

⚠ 10-31 第八十次现网跑搜狐那一趟，这一档被服务端新加的那一半打红了一条（19 过／1 红，红的正是列表那颗
`has_source`）：**服务端那一枚现在判的是「作者名或站名」两半**（现读 `app/api/routes/notes.py:242`），
而这条尺子还按"只有作者名"那一条老规则期望 `False`。⇒ 红的归属＝尺子，不是链：搜狐那族作者名确实空、
站名确实「搜狐」、那颗该为真。自此这一档**自己从快照那两格现算期望值**（不 import 应用里的谓词——
共用一把尺子就永远红不了），并把站名逐条念出来；`PROBE_EXPECT_AUTHOR` 只管作者名，不再兼任来源标的期望。

⚠ 默认那两条里**小红书这一条从 10-21 起必然红**（10-29 现读现网黑名单表：`xhslink.cn` 在列，
`fail_count` 3／`last_status` 200／`last_failed_at` 10-21 16:07）：命中黑名单的站**不发 HTTP、不起提炼**，
当场回"这个网站读不到内容，已停用"，所以 `status=completed` 那一条判据对它注定不成立。
这一条红＝这一族在现网已被站长停用，不是这条链坏了；那一族的取法改由本地用例钉
（`backend/tests/test_note_images.py` 里 591／600／638 那三条：四格全出 JSON、空格不覆盖 DOM、接线那一处不吃页面皮）。
别拿这条红去追代码。
"""
import json
import os
import time

import httpx
from sqlalchemy import func

from app.core.auth import _sign
from app.db.database import SessionLocal
from app.models.asset import Asset, MAX_ASSETS_PER_NOTE
from app.models.note import Note
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
URLS = {
    "公众号": "https://mp.weixin.qq.com/s/H2BANSW_U-Jjl1Ic_ZuZKA",
    "小红书": "https://xhslink.cn/o/9F1fAXNBL1I",
}
if os.environ.get("PROBE_URL"):
    URLS = {os.environ.get("PROBE_LABEL") or "自定义一族": os.environ["PROBE_URL"]}
EXPECT_AUTHOR = os.environ.get("PROBE_EXPECT_AUTHOR", "1") != "0"

ok = bad = 0
leftovers = []


def say(cond, label, detail=""):
    global ok, bad
    if cond:
        ok += 1
        print(f"  ✓ {label}" + (f"　{detail}" if detail else ""))
    else:
        bad += 1
        print(f"  ✗ {label}" + (f"　{detail}" if detail else ""))


db = SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
assert u, "找不到 deploy-test 那个号，停手"
H = {"Authorization": f"Bearer {_sign(str(u.id), u.generation or 1)}"}
print(f"身份：users.id={u.id} openid={u.openid}（探针专用号，不是真人）")

rows0 = db.query(func.count(Asset.id)).scalar()
notes0 = db.query(func.count(Note.id)).filter(Note.user_id == u.id).scalar()
q0 = httpx.get(f"{BASE}/api/user/storage-quota", headers=H, timeout=30).json()
print(f"\n① 进门底数：全站 assets {rows0} 行｜该号笔记 {notes0} 篇｜名下 {q0['user_count']} 张 / {q0['user_bytes']:,} B")

for label, url in URLS.items():
    print(f"\n② {label}：{url}")
    r = httpx.post(f"{BASE}/api/ingest/url", headers=H, data={"url": url}, timeout=60)
    say(r.status_code == 200, "那道口收下了", f"HTTP {r.status_code}")
    if r.status_code != 200:
        print("   回体：", r.text[:200])
        continue
    tid = r.json()["task_id"]
    st = {}
    for _ in range(90):
        time.sleep(2)
        st = httpx.get(f"{BASE}/api/tasks/{tid}", headers=H, timeout=30).json()
        if st.get("status") in ("completed", "failed"):
            break
    say(st.get("status") == "completed", "任务跑完", f"status={st.get('status')} 用了 {(st.get('step') or '')}")
    if st.get("status") != "completed":
        print("   回体：", json.dumps(st, ensure_ascii=False)[:300])
        continue
    payload = st.get("result") or {}
    counts = {k: payload.get(k) for k in
              ("images_total", "images_kept", "images_failed", "images_truncated")}
    say(all(v is not None for v in counts.values()), "回体带着那四个计数", str(counts))
    note_id = payload.get("note_id")
    say(bool(note_id), "回体里有 note_id", str(note_id))
    if not note_id:
        continue
    db.expire_all()
    note = db.get(Note, note_id)
    rows = db.query(Asset).filter(Asset.note_id == note_id).all()
    say(len(rows) == counts["images_kept"], "库里那几行数得和屏上那句一样",
        f"行 {len(rows)}｜回体 kept {counts['images_kept']}")
    say(counts["images_kept"] > 0, "这一篇真存下了至少一张（不是零行空转）",
        f"总 {counts['images_total']}｜存下 {counts['images_kept']}｜没存上 {counts['images_failed']}｜截掉 {counts['images_truncated']}")
    say(all(r.object_key and r.object_key.startswith("cloud://") for r in rows),
        "每一行的地址是真进了云开发才有的 fileID",
        (rows[0].object_key[:58] + "…") if rows else "（这一篇零行）")
    say(all(r.file_size and r.width and r.height for r in rows),
        "每一行的体积与宽高都不是空",
        f"体积 {[r.file_size for r in rows][:4]}…")
    say(all(r.backup_status == "uploaded" for r in rows), "状态只有「已上传」这一种",
        str(sorted({r.backup_status for r in rows})))
    say(len(rows) <= MAX_ASSETS_PER_NOTE, "不超过那一枚上限",
        f"{len(rows)} ≤ {MAX_ASSETS_PER_NOTE}（现网跑的这份代码里的数）")
    snap = note.imported_from if isinstance(note.imported_from, dict) else {}
    if EXPECT_AUTHOR:
        say(bool(snap.get("author_name")), "来源快照里有作者名（不是空那一格）", repr(snap.get("author_name")))
    else:
        say(not snap.get("author_name"),
            "这一族本来就不取作者名（现状钉着，不是放行——要它亮来源得先补抽取）",
            repr(snap.get("author_name")))
    say(all(k in snap for k in ("images_total", "images_kept")),
        "四个计数也钉进了那份快照", str({k: snap.get(k) for k in ('images_total', 'images_kept', 'images_failed')}))
    det = httpx.get(f"{BASE}/api/notes/{note_id}", headers=H, timeout=30).json()
    say({k: (det.get("imported_from") or {}).get(k) for k in ('images_kept',)} ==
        {'images_kept': counts['images_kept']}, "详情接口回的就是这一份", "")
    as_list = httpx.get(f"{BASE}/api/notes/{note_id}/assets", headers=H, timeout=30).json()
    say(len(as_list) == len(rows), "配图那一口的条数与库里一致",
        f"接口 {len(as_list)}｜库 {len(rows)}")
    say(bool(as_list) and str(as_list[0].get("cloud_url", "")).startswith("cloud://"),
        "客户端拿去画的那一栏有值", str(as_list[0])[:90] if as_list else "")
    lst = httpx.get(f"{BASE}/api/notes/", headers=H, params={"limit": 50}, timeout=30).json()
    items = lst if isinstance(lst, list) else lst.get("items", [])
    mine = [n for n in items if n.get("id") == note_id]
    # 这一枚判的是服务端那两半（作者名或站名），所以期望值从**这一篇自己的快照那两格**现算，
    # 不 import 应用里的谓词（共用尺子就永远红不了）、也不跟着 PROBE_EXPECT_AUTHOR 走（那一档只管作者名）。
    # 10-31 第八十次现网跑搜狐时，老版这里按"只有作者名"硬期望 False，当场一条红——那红归尺子不归链。
    该真 = bool(snap.get("author_name") or snap.get("site_name"))
    say(bool(mine) and mine[0].get("has_source") is 该真,
        "列表那一行带 has_source（客户端按它画来源；期望值＝这一篇快照里作者名或站名有其一）",
        f"作者名 {snap.get('author_name')!r}／站名 {snap.get('site_name')!r} ⇒ 该 {该真}｜接口回 {mine[0].get('has_source') if mine else '（列表里没这一篇）'}")
    dr = httpx.delete(f"{BASE}/api/notes/{note_id}", headers=H, timeout=60)
    say(dr.status_code == 200, "收尾：这一篇删掉了", f"HTTP {dr.status_code}")
    obj_bytes = sum(r.file_size or 0 for r in rows)
    leftovers.append((label, len(rows), obj_bytes))

db.expire_all()
rows1 = db.query(func.count(Asset.id)).scalar()
notes1 = db.query(func.count(Note.id)).filter(Note.user_id == u.id).scalar()
q1 = httpx.get(f"{BASE}/api/user/storage-quota", headers=H, timeout=30).json()
print(f"\n③ 收尾对账：全站 assets {rows0} → {rows1}｜该号笔记 {notes0} → {notes1}｜名下 {q0['user_count']} → {q1['user_count']} 张")
say(rows1 == rows0, "库里没有留下探针行", f"{rows0} vs {rows1}")
say(notes1 == notes0, "该号名下没有留下探针篇", f"{notes0} vs {notes1}")
say(q1["user_count"] == q0["user_count"] and q1["user_bytes"] == q0["user_bytes"],
    "配额那一格回到进门那几个数", f"{q0['user_bytes']:,} → {q1['user_bytes']:,} B")
tot = sum(n for _, n, _ in leftovers)
byt = sum(b for _, _, b in leftovers)
print(f"\n④ 只有一处删不掉（不是这条链新引入的，云上对象只能客户端删）："
      f"桶里留下 {tot} 个探针对象、约 {byt/1024/1024:.2f} MB，路径前缀 images/<该号>/…")
print(f"\n=== 现网外链贴图探针：{ok} 过 / {bad} 红 ===")
db.close()
