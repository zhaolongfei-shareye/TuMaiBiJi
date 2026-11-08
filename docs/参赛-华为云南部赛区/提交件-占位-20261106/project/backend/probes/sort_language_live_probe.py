"""现网探针：列表排序（撤掉置顶那一档）+「原文翻译」开关（默认关＝跟随原文语言）。

2026-10-04 站长两条：「排序没有按照日期倒序，要改」「我贴一条纯英文的…不明白为什么提炼的
时候自动翻译成中文。在取消按钮上方，加个小开关，原文翻译，默认关，可以打开」。

和 pytest 的分工：`tests/test_note_flows.py`／`tests/test_ingest_text.py` 证逻辑，这一支证
**部署到现网的那份字节真的是它**——少传一个文件、只重启了 API 没重启 worker，本地全绿也照样
是旧行为（项目记录里这条出现过不止一次）。

用法（服务器上跑，**必须先 cd 到项目目录**：家目录那份 .env 是另一个项目的）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/sort_language_live_probe.py

只用 deploy-test（users.id=1）这一个账号；建过的笔记与分类收尾全删，笔记数回到起点。
送检次数：三趟提交 × (标题+原文) ≈ 6 次 msgSecCheck，当天额度 100 次。

三组事：
① 排序：三篇按创建时间建出来 → 列表是新的在前；把**最早那篇钉住** → 顺序一字不变
   （钉着的那篇不许跳顶，这就是他截图上 09/23 压在 10/04 上面那个现象的反面）；撤钉后仍不变。
② 语言：英文原文 + 开关关 → 摘要／标签里一个中日韩字符都没有；英文原文 + 开关开 → 摘要有中文。
③ 中文原文 + 开关关 → 摘要照旧是中文（"跟随原文"不许把最常见那一档改坏）。
"""
import re
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.note import Note
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:6]
CJK = re.compile(r"[一-鿿぀-ヿ가-힯]")

EN_BODY = (
    "Large language models do not translate because they were asked to. They answer in the "
    "language of the instruction they were given, so a Chinese system prompt quietly turns an "
    "English article into a Chinese summary. The only reliable fix is to state the output "
    "language explicitly and let the user decide, per note, whether the source text should be "
    "rendered into another language."
)
ZH_BODY = (
    f"这是探针署名 {MARK} 打的一段中文原文，用来验「开关关着的时候，中文原文照旧出中文摘要」"
    "这一档没被改坏。跟随原文的语言，意思是中文进中文出、英文进英文出，而不是把中文也翻一遍。"
)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))


def submit(client, hdr, title, content, translate):
    """提交一趟手打提炼，回 (状态, 任务结果, 笔记详情)。"""
    payload = {"title": title, "content": content, "translate": translate}
    r = client.post("/api/ingest/text", json=payload, headers=hdr)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    task_id = body.get("task_id")
    if not task_id:
        return f"提交失败 {r.status_code} {r.text[:80]}", {}, {}
    status, task = "timeout", {}
    for _ in range(30):
        time.sleep(3)
        t = client.get(f"/api/tasks/{task_id}", headers=hdr)
        task = t.json() if t.status_code == 200 else {}
        status = task.get("status")
        if status in ("completed", "failed"):
            break
    note_id = (task.get("result") or {}).get("note_id")
    detail = {}
    if note_id:
        d = client.get(f"/api/notes/{note_id}", headers=hdr)
        detail = d.json() if d.status_code == 200 else {}
        detail["_note_id"] = note_id
    return status, task, detail


def main():
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("✗ 找不到 deploy-test 账号，探针不做任何写操作")
        return 1
    hdr = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    client = httpx.Client(base_url=BASE, timeout=40)
    uid = str(user.id)
    notes_before = db.query(Note).filter(Note.user_id == uid).count()
    print(f"起点：deploy-test id={user.id} 名下 {notes_before} 篇")

    made = []
    try:
        # ---------- ① 排序：钉着的那篇不许跳顶 ----------
        ids, stamps = [], []
        for i in range(3):
            r = client.post("/api/notes/", json={"title": f"排序探针{MARK}-{i}",
                                                 "content": f"第 {i} 篇，用来验列表只按创建时间倒序。"},
                            headers=hdr)
            j = r.json() if r.status_code == 200 else {}
            if j.get("id"):
                ids.append(j["id"])
                stamps.append(j.get("created_at"))
            time.sleep(1.3)  # 三篇必须落在三个不同的 created_at 上，否则"倒序"这条判不出来
        check("①三篇都建出来了（created_at 互不相同）",
              len(ids) == 3 and len(set(stamps)) == 3, f"{ids} {stamps}")
        made.extend(ids)

        def order():
            lst = client.get("/api/notes/", params={"limit": 50}, headers=hdr).json()
            return [x["id"] for x in lst if x["id"] in ids]

        base_order = order()
        check("①默认顺序＝新的在前（创建时间倒序）",
              base_order == sorted(base_order, reverse=True), f"{base_order}")

        oldest = min(ids)
        p = client.post(f"/api/notes/{oldest}/pin", params={"pin": True}, headers=hdr)
        db.expire_all()
        pinned_row = db.query(Note).filter(Note.id == oldest).first()
        check("①那一篇确实被钉上了（库里 is_pinned=1，否则下面两条都是空过）",
              p.status_code == 200 and pinned_row is not None and bool(pinned_row.is_pinned),
              f"{p.status_code} is_pinned={getattr(pinned_row, 'is_pinned', None)}")
        after_pin = order()
        check("①钉住最早那篇之后，列表顺序一字不变（置顶不再压日期）",
              after_pin == base_order, f"{base_order} → {after_pin}")

        client.post(f"/api/notes/{oldest}/pin", params={"pin": False}, headers=hdr)
        after_unpin = order()
        check("①撤掉置顶之后顺序仍然不变", after_unpin == base_order, f"{after_unpin}")

        # ---------- ② 语言开关：英文原文两态 ----------
        st, task, d = submit(client, hdr, f"English probe {MARK}", EN_BODY, False)
        made.append(d.get("_note_id"))
        summary = (d.get("summary") or "").strip()
        tags = " | ".join(d.get("tags") or [])
        check("②关：这趟真跑到 completed 且 degraded=False（真调到混元，不是降级存原文）",
              st == "completed" and (task.get("result") or {}).get("degraded") is False,
              f"{st} degraded={(task.get('result') or {}).get('degraded')}")
        check("②关：摘要有内容（不是空摘要蒙过下一条）", bool(summary), f"{len(summary)} 字")
        check("②关：英文原文出英文摘要（摘要里零个中日韩字符）",
              not CJK.search(summary), f"{summary[:70]}")
        check("②关：标签也跟着原文走（零个中日韩字符）", not CJK.search(tags), tags[:70])
        check("②关：原文仍原样落在 original_content（开关不许动正文）",
              (d.get("original_content") or "").strip() == EN_BODY.strip(),
              f"{len(d.get('original_content') or '')} 字")

        st2, task2, d2 = submit(client, hdr, f"English probe {MARK} B", EN_BODY, True)
        made.append(d2.get("_note_id"))
        summary2 = (d2.get("summary") or "").strip()
        check("②开：这趟跑到 completed", st2 == "completed",
              f"{st2} {str(task2)[:70]}")
        check("②开：同一篇英文原文，摘要里出现中文（开关真的换了输出语言）",
              bool(CJK.search(summary2)), f"{summary2[:70]}")

        # ---------- ③ 中文原文 + 开关关：最常见那一档不许坏 ----------
        st3, task3, d3 = submit(client, hdr, f"中文探针{MARK}", ZH_BODY, False)
        made.append(d3.get("_note_id"))
        summary3 = (d3.get("summary") or "").strip()
        check("③中文原文 + 关：摘要照旧是中文（跟随原文≠把中文也翻一遍）",
              st3 == "completed" and bool(CJK.search(summary3)), f"{summary3[:70]}")
    finally:
        for nid in [x for x in made if x]:
            client.delete(f"/api/notes/{nid}", headers=hdr)
        db.expire_all()
        after = db.query(Note).filter(Note.user_id == uid).count()
        check("收尾：笔记数回到起点", after == notes_before, f"{notes_before} → {after}")
        lst = client.get("/api/notes/", params={"search": MARK}, headers=hdr).json()
        check("收尾：列表里搜不到探针署名", all(MARK not in (x.get("title") or "") for x in lst),
              f"{len(lst)} 行")
        db.close()

    bad = [n for n, ok, _ in results if not ok]
    print(f"\n{'全部通过' if not bad else '未通过 ' + str(len(bad)) + ' 条'}："
          f"{len(results) - len(bad)}/{len(results)}")
    for n in bad:
        print("  ✗ " + n)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
