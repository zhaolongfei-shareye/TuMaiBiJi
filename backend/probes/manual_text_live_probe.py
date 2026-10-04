"""现网探针：「直接写」这一档真的走提炼这一条链路（2026-10-04 站长改口径那批）。

和 pytest 的分工：`tests/test_ingest_text.py` 证"逻辑对不对"，这一支证
"部署到现网的那份字节真的是它"——少传一个文件、只重启了一个 unit，
本地 374 条全绿也照样是旧行为（这条在项目记录里出现过不止一次）。

用法（服务器上跑，**必须先 cd 到项目目录**：家目录那份 .env 是另一个项目的）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/manual_text_live_probe.py

只用 deploy-test（users.id=1，openid='deploy-test'）这一个账号，别的账号一行都不写。
中途会建两篇笔记与一个分类，收尾按 id 删干净并回读断言归零。
送检次数：两次提交 × (标题+原文) ≈ 4 次 msgSecCheck，当天额度 100 次。

要看的四组事：
① 三道门各挡各的：没 token 401、空标题/空正文 400 或 422、别人的分类 400，
   且这三趟都不许落笔记。
② 正常一趟的形状：标题用用户打的、原文落 original_content、摘要是模型出的、
   degraded=False（降级=没真调到混元，这一条只有现网能证）。
③ 归类跟着一篇走：带分类就落、不带就是未分类。
④ 收尾干净：探针署名的笔记在列表里查不到，deploy-test 名下笔记数回到起点。
"""
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.category import Category
from app.models.note import Note
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:6]

TITLE = f"探针标题{MARK}"
BODY = (
    f"这是探针署名 {MARK} 打的一段原文。图麦笔记把手打的文字交给混元提炼，"
    "出来的是摘要、要点和标签，而这一段本身应当原样留在「原文内容」那一格里。"
    "如果详情页的原文被模型那份覆盖了，第二组的第三条就会红。"
)
CAT_NAME = f"探针分类{MARK}"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))


def main():
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("✗ 找不到 deploy-test 账号，探针不做任何写操作")
        return 1
    hdr = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    client = httpx.Client(base_url=BASE, timeout=40)
    notes_before = db.query(Note).filter(Note.user_id == str(user.id)).count()
    print(f"起点：deploy-test id={user.id} 名下 {notes_before} 篇")

    made_notes, made_cats = [], []
    try:
        # ---------- ① 三道门 ----------
        r = client.post("/api/ingest/text", json={"title": "x", "content": "y"})
        check("①没带 token 直接 401", r.status_code == 401, f"{r.status_code}")

        n0 = db.query(Note).filter(Note.user_id == str(user.id)).count()
        r = client.post("/api/ingest/text", json={"title": "   ", "content": BODY}, headers=hdr)
        check("①空标题被挡（400 或 422 都算挡住，钉的是「不许落到落库那一步」）",
              r.status_code in (400, 422), f"{r.status_code} {r.text[:60]}")
        r = client.post("/api/ingest/text", json={"title": TITLE, "content": ""}, headers=hdr)
        check("①空正文被挡", r.status_code in (400, 422), f"{r.status_code} {r.text[:60]}")
        db.expire_all()
        check("①那两趟一篇都没落", db.query(Note).filter(Note.user_id == str(user.id)).count() == n0,
              f"{n0} → {db.query(Note).filter(Note.user_id == str(user.id)).count()}")

        other = db.query(Category).filter(Category.user_id != str(user.id)).first()
        if other:
            r = client.post("/api/ingest/text",
                            json={"title": TITLE, "content": BODY, "category_id": other.id},
                            headers=hdr)
            check("①别人的分类 id 挡在门外（不烧一次提炼）", r.status_code == 400,
                  f"{other.id} 属 user={other.user_id} → {r.status_code} {r.text[:60]}")
        else:
            check("①别人的分类 id 挡在门外", False, "库里找不到别人的分类，这条空过")

        # ---------- ②③ 正常一趟（带归类） ----------
        c = client.post("/api/categories/", json={"name": CAT_NAME}, headers=hdr)
        check("③先建一个探针专用分类", c.status_code == 200 and c.json().get("id"),
              f"{c.status_code} {c.text[:60]}")
        cat_id = c.json().get("id") if c.status_code == 200 else None
        if cat_id:
            made_cats.append(cat_id)

        r = client.post("/api/ingest/text",
                        json={"title": TITLE, "content": BODY, "category_id": cat_id},
                        headers=hdr)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        check("②提交回 queued + task_id", r.status_code == 200 and body.get("status") == "queued"
              and bool(body.get("task_id")), f"{r.status_code} {body}")

        task_id = body.get("task_id")
        status, task = "timeout", {}
        for _ in range(30):
            time.sleep(3)
            t = client.get(f"/api/tasks/{task_id}", headers=hdr)
            task = t.json() if t.status_code == 200 else {}
            status = task.get("status")
            if status in ("completed", "failed"):
                break
        check("②90 秒内跑到 completed", status == "completed", f"{status} {str(task)[:90]}")

        note_id = (task.get("result") or {}).get("note_id")
        if note_id:
            made_notes.append(note_id)
        d = client.get(f"/api/notes/{note_id}", headers=hdr).json() if note_id else {}
        check("②标题用的就是他打的那个（模型另起的只当 fallback）",
              d.get("title") == TITLE, f"{d.get('title')}")
        check("②手打那段原文原样落在 original_content",
              (d.get("original_content") or "").strip() == BODY.strip(),
              f"存了 {len(d.get('original_content') or '')} 字")
        summary = (d.get("summary") or "").strip()
        check("②摘要有内容，且不是把原文照抄进摘要那一格",
              bool(summary) and summary != BODY.strip(), f"{len(summary)} 字：{summary[:40]}")
        check("②degraded=False（真调到混元，不是降级存原文）",
              d.get("source_type") == "manual" and (task.get("result") or {}).get("degraded") is False,
              f"source_type={d.get('source_type')} degraded={(task.get('result') or {}).get('degraded')}")
        check("③归类跟着这一篇落了", d.get("category_id") == cat_id,
              f"{d.get('category_id')} vs {cat_id}")

        # ---------- ③不带分类 ----------
        r2 = client.post("/api/ingest/text", json={"title": f"{TITLE}B", "content": BODY}, headers=hdr)
        tid2 = (r2.json() or {}).get("task_id")
        st2, res2 = "timeout", {}
        for _ in range(30):
            time.sleep(3)
            t2 = client.get(f"/api/tasks/{tid2}", headers=hdr)
            res2 = t2.json() if t2.status_code == 200 else {}
            st2 = res2.get("status")
            if st2 in ("completed", "failed"):
                break
        nid2 = (res2.get("result") or {}).get("note_id")
        if nid2:
            made_notes.append(nid2)
        d2 = client.get(f"/api/notes/{nid2}", headers=hdr).json() if nid2 else {}
        check("③不带分类就是未分类（不是报错、也不是落进别人的格子）",
              st2 == "completed" and d2.get("category_id") is None,
              f"{st2} category_id={d2.get('category_id')}")

        # ---------- ④ 收尾 ----------
        for nid in list(made_notes):
            client.delete(f"/api/notes/{nid}", headers=hdr)
        for cid in list(made_cats):
            client.delete(f"/api/categories/{cid}", headers=hdr)
        db.expire_all()
        after = db.query(Note).filter(Note.user_id == str(user.id)).count()
        check("④笔记数回到起点", after == notes_before, f"{notes_before} → {after}")
        lst = client.get("/api/notes/", params={"search": MARK}, headers=hdr).json()
        check("④列表里搜不到探针署名", all(MARK not in (x.get("title") or "") for x in lst),
              f"{len(lst)} 行")
        check("④探针建的那个分类也删掉了",
              db.query(Category).filter(Category.name == CAT_NAME).count() == 0)
    finally:
        # 中途崩了也要把已建的删掉，别把探针数据留在现网
        for nid in made_notes:
            client.delete(f"/api/notes/{nid}", headers=hdr)
        for cid in made_cats:
            client.delete(f"/api/categories/{cid}", headers=hdr)
        db.close()

    bad = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} 过")
    if bad:
        print("红在这些条：")
        for n in bad:
            print("  ✗ " + n)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
