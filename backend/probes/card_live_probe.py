"""现网探针：卡片留档那条链在服务器上真的跑着（2.0.1 P0 · S1/S2）。

和 pytest 的分工同 `assets_live_probe`：用例证明逻辑对不对，这里证明**现网跑的就是这份字节**。
这一条尤其要跑——"版本更新之后卡片不见了"那个毛病，症状本身就是"界面上看着正常、
换台手机才发现图没了"，只有真打一次才知道服务器上那一行写得进、读得回、删得掉。

用法（在服务器上跑，读得到 .env、token 在进程内签，值不出命令行）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/card_live_probe.py

只用 deploy-test 那一个账号（users.id=1）。名下的笔记与 note_cards 行结尾全部清掉。
别人名下的行只读一次 id 用来验归属那道闸，一行都不碰。

fileID 是**假的**（`cloud://probe-card-…`）：这台后端删不掉云上的真对象，探针也不该真去传一张图，
它验的是"库里那一行、归属那道闸、撤掉时回给客户端的那份清单"。真对象那半边由客户端真机那条链验。

**不建分享**：`need_confirm` 那一档要一篇"公开过但没卡片行"的笔记才出得来，而建分享要打
msgSecCheck 与出码配额。那一条已经在 `tests/test_note_cards.py::Test批量读那份待确认名单` 钉住，
这里只断"这篇有卡片行，所以它不许冒进 need_confirm"。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import text

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.asset import Asset
from app.models.note import Note
from app.models.note_card import NoteCard
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
FID_A = f"cloud://probe-card-{MARK}/a.jpg"
FID_B = f"cloud://probe-card-{MARK}/b.jpg"

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
    uid = str(user.id)
    hdr = {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}
    client = httpx.Client(base_url=BASE, timeout=30)

    def mine():
        db.expire_all()
        return db.query(NoteCard).filter(NoteCard.user_id == uid).count()

    def quota():
        return client.get("/api/user/storage-quota", headers=hdr).json()

    # ---- 0. 地基：迁移真的跑过了 ------------------------------------------------
    head = db.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    # 这一条原来钉的是"头 == 卡片那条"，10-08 名片那条迁移（a9d3e5c7f218）一长出来它就红了——
    # 红了不是谁弄坏了，是这把尺子问的是"今天第几天"。改成问**卡片那条在不在已跑到的链上**。
    anc = set()
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        sd = ScriptDirectory.from_config(Config("alembic.ini"))
        for h in head:
            anc |= {r.revision for r in sd.iterate_revisions(h, "base")}
    except Exception as e:  # 读不到链就说读不到，不许默默判过
        check("读不到 alembic 的迁移链（这条探针不猜）", False, str(e)[:90])
    check("卡片那条迁移在库里已跑到的那个头之前（链上，不等于头）",
          "f2b7d4a8c915" in anc, f"库里的头={head}")
    tables = set(db.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table'")).scalars().all())
    check("note_cards 表在", "note_cards" in tables, str(sorted(tables))[:120])
    idx_sql = db.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='index' "
        "AND name='ux_note_cards_one_current_per_note'")).scalar()
    check("那条部分唯一索引在，且真的只圈当前行（丢 WHERE 就是历史行也一起挡）",
          bool(idx_sql) and "UNIQUE" in (idx_sql or "").upper() and "is_current = 1" in (idx_sql or ""),
          str(idx_sql)[:160])
    base_rows = mine()
    check("起点干净：这个账号名下没有遗留的卡片行", base_rows == 0, f"库里有 {base_rows} 行")
    q0 = quota()
    foreign = db.query(Note.id).filter(Note.user_id != uid).limit(1).scalar()

    # ---- 1. 四个口都在（不带票回 401 而不是 404）--------------------------------
    r = client.post(f"/api/notes/0/card", json={"file_id": FID_A, "tpl": "classic"})
    check("写口在（无票 401，不是 404）", r.status_code == 401, f"HTTP {r.status_code}")
    r = client.get("/api/notes/0/card")
    check("读一篇口在", r.status_code == 401, f"HTTP {r.status_code}")
    r = client.delete("/api/notes/0/card")
    check("撤档口在", r.status_code == 401, f"HTTP {r.status_code}")
    r = client.get("/api/user/cards")
    check("批量读口在", r.status_code == 401, f"HTTP {r.status_code}")

    # ---- 2. 写一篇、读回来就是那一张 --------------------------------------------
    r = client.post("/api/notes/", headers=hdr, json={
        "title": f"探针卡片{MARK}", "summary": f"探针摘要{MARK}", "content": f"探针正文{MARK}"})
    check("建出这篇探针笔记", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    if r.status_code != 200:
        return finish(client, db, user, q0)
    note_id = r.json()["id"]

    def put(fid, **kw):
        body = {"file_id": fid, "tpl": kw.pop("tpl", "classic"), "no_qr": kw.pop("no_qr", False)}
        body.update({k: v for k, v in kw.items() if v is not None})
        return client.post(f"/api/notes/{note_id}/card", headers=hdr, json=body)

    r = put(FID_A, size=204800, width=1080, height=1440)
    j = r.json() if r.status_code == 200 else {}
    check("登记一张（200）", r.status_code == 200, f"HTTP {r.status_code} {r.text[:100]}")
    check("回体形状对：cloud_url / tpl / no_qr / size / origin 五样",
          j.get("cloud_url") == FID_A and j.get("tpl") == "classic" and j.get("no_qr") is False
          and j.get("size") == 204800 and j.get("origin") == "live", str(j)[:160])
    r = client.get(f"/api/notes/{note_id}/card", headers=hdr)
    got = r.json()
    check("读一篇：拿回来的是那一张", r.status_code == 200 and (got.get("card") or {}).get("cloud_url") == FID_A,
          str(got)[:160])
    check("读一篇：had_share 这一栏在（待确认档的入口，分两个请求就会出现中间态）",
          "had_share" in got and got["had_share"] is False, str(got)[:80])

    # ---- 3. 幂等：同一张再登记一次不产生第二行 ----------------------------------
    r = put(FID_A, size=307200)
    db.expire_all()
    n = db.query(NoteCard).filter(NoteCard.note_id == note_id).count()
    check("同一个 fileID 重复登记：库里仍是一行（补传那趟会重跑）", n == 1, f"{n} 行")
    check("重复登记把数更新掉（size 从 204800 变 307200）",
          r.status_code == 200 and r.json().get("size") == 307200, str(r.json())[:120])

    # ---- 4. 换一张：旧的转历史，当前仍只有一张 ----------------------------------
    r = put(FID_B, tpl="quote")
    db.expire_all()
    rows = db.query(NoteCard).filter(NoteCard.note_id == note_id).all()
    check("换一张之后库里两行（历史行留着，不直接删）", len(rows) == 2, f"{len(rows)} 行")
    check("当前只有一张", sum(1 for x in rows if x.is_current) == 1,
          str([(x.object_key[-6:], x.is_current) for x in rows]))
    got = client.get(f"/api/notes/{note_id}/card", headers=hdr).json()
    check("读回来的是新那张（tpl 也跟着换）",
          (got.get("card") or {}).get("cloud_url") == FID_B and got["card"]["tpl"] == "quote",
          str(got.get("card"))[:120])

    # ---- 5. 批量读 --------------------------------------------------------------
    lst = client.get("/api/user/cards", headers=hdr).json()
    mine_ids = [c["note_id"] for c in lst.get("cards", [])]
    check("批量读：这篇在名单里", note_id in mine_ids, str(mine_ids)[:80])
    check("批量读：有卡片行的这篇不许冒进 need_confirm",
          note_id not in (lst.get("need_confirm") or []), str(lst.get("need_confirm"))[:80])

    # ---- 6. 不收的形状：拦下来且一行都不写 --------------------------------------
    before = mine()
    for name, fid, kw in (
        ("`cloud://` 后面是空的（一条指向空的地址）", "cloud://", {}),
        ("地址里有空格", "cloud://a b.jpg", {}),
        ("不是云开发的地址", "http://x/y.jpg", {}),
    ):
        r = put(fid, **kw)
        check(f"不收：{name}", r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")
    r = put(FID_A, origin="magic")
    check("不收：来源不认得（origin 是给用户看那句话的数据来源，写错一档就是悄悄换了人家的图）",
          r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")
    r = put(FID_A, tpl="clas sic")
    check("不收：模板名带空白", r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")
    r = put(FID_A, size=20 * 1024 * 1024 + 1)
    check("不收：字节数超过云开发单文件上限（20MB 那道线，**不是** 200KB 那个入账口径）",
          r.status_code == 422, f"HTTP {r.status_code}")
    db.expire_all()
    check("被拦下来的那几趟一行都没写", mine() == before, f"{before} → {mine()}")
    r = put(FID_A, size=300 * 1024)
    check("比 200KB 大的照样登记得进（200KB 是配额估算口径，故意不是拒收线）",
          r.status_code == 200, f"HTTP {r.status_code} {r.text[:60]}")

    # ---- 7. 归属：别人的那一篇，三个口全是 404，且不留行 ------------------------
    if foreign:
        db.expire_all()
        f0 = db.query(NoteCard).filter(NoteCard.note_id == foreign).count()
        r = client.post(f"/api/notes/{foreign}/card", headers=hdr,
                        json={"file_id": f"cloud://probe-card-{MARK}/steal.jpg", "tpl": "classic"})
        check("往别人的笔记登记卡片回 404（不回 403：那等于给人一篇一篇试 id 的探测器）",
              r.status_code == 404, f"HTTP {r.status_code}")
        r = client.get(f"/api/notes/{foreign}/card", headers=hdr)
        check("读别人的那一篇回 404", r.status_code == 404, f"HTTP {r.status_code}")
        r = client.delete(f"/api/notes/{foreign}/card", headers=hdr)
        check("撤别人那一篇的卡片回 404", r.status_code == 404, f"HTTP {r.status_code}")
        db.expire_all()
        check("三趟都没在别人名下写出行",
              db.query(NoteCard).filter(NoteCard.note_id == foreign).count() == f0, f"{f0} 行")

    # ---- 8. 撤掉那一格：两行都走、回体带清单、幂等 ------------------------------
    r = client.delete(f"/api/notes/{note_id}/card", headers=hdr)
    body = r.json() if r.status_code == 200 else {}
    check("撤掉这一格（200）", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    check("回体带的是**同一个 file_ids 键**、两行都在（对象只有客户端删得动）",
          set(body.get("file_ids") or []) == {FID_A, FID_B} and "card_file_ids" not in body,
          str(body)[:140])
    got_ids = body.get("file_ids") or []
    check("清单里没有重复的 fileID（前面故意换回过 A，库里三行只有两个地址）",
          len(got_ids) == len(set(got_ids)), str(got_ids)[:120])
    db.expire_all()
    check("撤完库里这篇零行（历史行也一起走：对象要删了，留一行指向空地址就是幽灵行）",
          db.query(NoteCard).filter(NoteCard.note_id == note_id).count() == 0)
    got = client.get(f"/api/notes/{note_id}/card", headers=hdr).json()
    check("撤完再读是 null（不是 404、不是报错）", got.get("card") is None, str(got)[:80])
    r = client.delete(f"/api/notes/{note_id}/card", headers=hdr)
    check("撤第二下不报错、清单为空（幂等：那一枚点两下不该冒出一句失败）",
          r.status_code == 200 and r.json().get("file_ids") == [], f"HTTP {r.status_code} {r.text[:80]}")

    # ---- 9. 卡片行进的是另一个数：配图那口不许被它撑大 --------------------------
    put(FID_A, size=204800)
    q1 = quota()
    check("登记一张卡片之后，配图那个配额口一个字都没变（卡片不与配图混成同一个数）",
          (q1["user_count"], q1["user_bytes"], q1["total_bytes"])
          == (q0["user_count"], q0["user_bytes"], q0["total_bytes"]),
          f"{q1['user_count']}/{q1['user_bytes']}/{q1['total_bytes']} vs {q0['user_count']}/{q0['user_bytes']}/{q0['total_bytes']}")

    # ---- 9b. snapshots 这一栏（S3 重渲那一步的第二份输入）在现网真回得来 ----------------
    # 为什么这一条必须打在现网而不只是用例：客户端重渲要按**当年那份分享快照**的正文渲，
    # 这一栏不在，那一趟就静默退成"按笔记现在的内容渲"，而界面上说的是"按当年那份内容重出的"——
    # 从 health 200 和小程序码都看不出来，只有真读一次回体才知道。
    # 仍然不建分享（配额那条纪律没变）：拿这个账号现存的分享行做对照，
    # 断的是服务端内部那条不变量——**每一份"待确认"都必须配着一份快照**，少一份就有一篇渲不出当年那张。
    body = client.get("/api/user/cards", headers=hdr).json()
    snaps = body.get("snapshots")
    check("/api/user/cards 回体里有 snapshots 这一栏，且是个清单",
          isinstance(snaps, list), f"实际拿到 {type(snaps).__name__}")
    check("每一份 need_confirm 都配着一份快照（缺一篇就渲不出当年那张）",
          sorted(x.get("note_id") for x in (snaps or [])) == sorted(body.get("need_confirm") or []),
          f"snapshots={sorted(x.get('note_id') for x in (snaps or []))} "
          f"need_confirm={sorted(body.get('need_confirm') or [])}")
    缺键 = [x.get("note_id") for x in (snaps or [])
            if not all(k in x for k in ("title", "summary", "key_points", "author_name"))]
    check("快照那几栏形状齐（客户端拿的是这四个键）", not 缺键, f"缺键的篇：{缺键}")
    check("这篇此刻有卡片行，所以它既不在待确认名单、也不在快照里（有下落的不许再报一次）",
          note_id not in (body.get("need_confirm") or [])
          and note_id not in [x.get("note_id") for x in (snaps or [])],
          f"note_id={note_id}")

    # ---- 10. 删笔记连带：卡片地址并进同一份 file_ids ---------------------------
    r = client.delete(f"/api/notes/{note_id}", headers=hdr)
    body = r.json() if r.status_code == 200 else {}
    check("删那篇（200）", r.status_code == 200, f"HTTP {r.status_code}")
    check("删笔记的回体里带着卡片的 fileID（同一个 file_ids 键，客户端只会读那一个）",
          FID_A in (body.get("file_ids") or []), str(body.get("file_ids"))[:140])
    db.expire_all()
    check("这篇的卡片行跟着清零",
          db.query(NoteCard).filter(NoteCard.note_id == note_id).count() == 0)

    return finish(client, db, user, q0)


def finish(client, db, user, q0):
    """不管前面红到哪一步，收尾都要把探针名下那几样抹干净。"""
    uid = str(user.id)
    auth = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    ids = [n.id for n in db.query(Note).filter(Note.user_id == uid,
                                               Note.title.like(f"%{MARK}%")).all()]
    for i in ids:
        client.delete(f"/api/notes/{i}", headers=auth)
    # 极端情况下（删笔记那一步之前就红了）可能留下指向已没了的笔记的行，这里按名下扫一遍
    db.query(NoteCard).filter(NoteCard.user_id == uid).delete(synchronize_session=False)
    db.commit()
    db.expire_all()
    left_note = db.query(Note).filter(Note.user_id == uid, Note.title.like(f"%{MARK}%")).count()
    left_card = db.query(NoteCard).filter(NoteCard.user_id == uid).count()
    left_asset = db.query(Asset).filter(Asset.user_id == uid).count()
    check("收尾：探针笔记一条不留", left_note == 0, f"还剩 {left_note}")
    check("收尾：探针卡片行一条不留", left_card == 0, f"还剩 {left_card}")
    check("收尾：探针没在配图那张表里留下任何东西（这条链一行都不该写进 assets）",
          left_asset == 0, f"还剩 {left_asset}")
    if q0:
        q = client.get("/api/user/storage-quota", headers=auth).json()
        check("收尾：配图配额三个数回到开始前的值",
              (q["user_count"], q["user_bytes"], q["total_bytes"])
              == (q0["user_count"], q0["user_bytes"], q0["total_bytes"]),
              f"现在 {q['user_count']}/{q['user_bytes']}/{q['total_bytes']}")
    client.close()
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} 条通过")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name} — {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
