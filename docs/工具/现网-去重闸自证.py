"""第六十八次部署的现网自证：同一个人对同一篇只留一份（闸已在现网，这一趟在真口上打）。

跑法（服务器上，标准输入递过去，服务器盘上不留副本）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - ' < gate_probe.py

它证四件事：② 第二次点不许多出一行、③ 分数不许再结、④ 删了还能重存、⑤ 换一篇/换一个人不许被误挡。
收尾自己写：正常路径走真口删，崩在半路按记下的主键兜底删，最后拿起点那四个总数逐格对账。
⚠ 清扫与那七条判据**各装一只 try**，并对"收尾跑了几条"设下限（`END_MIN`）——§8.480 那两条教训的形状就是
"崩的正是收尾那一段，而它报绿"；两只保险装在一起时，清扫一抛，判据整段隐身。
"""
import sys
import uuid

import httpx
from sqlalchemy import or_

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.account import Account, AccountIdentity
from app.models.asset import Asset
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services import accounts as accounts_svc
from app.services import generation

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
TITLE = f"去重闸现网探针 {MARK}"
SUMMARY = f"联系方式{MARK}"
CREATED = []
TEMP_USERS = []
results = []
# 收尾那七条判据的名字都在这里，一条不多一条不少：
# 标记笔记删净／临时号名下删净／users+accounts 没留／两篇原笔记读 404／孤儿分享 0／四个总数回起点／bonus 回起点。
# 为什么要钉这个数（10-25 审计 M24）：这一支退出码只看 results 里有没有红项，
# 而"崩在半路"那几型是**少跑**而不是跑红——条数一少，账面上就是一片绿。
END_MIN = 7


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))


def mine(db, uid, source_note_id):
    """这一篇在这个人名下的副本（认 imported_from.source_note_id，与那道闸同一口径）。"""
    rows = db.query(Note.id, Note.imported_from).filter(
        Note.user_id == str(uid), Note.source_type == "share_import").all()
    return [i for i, snap in rows if (snap or {}).get("source_note_id") == source_note_id]


def marked(db, uid):
    return db.query(Note).filter(
        Note.user_id == str(uid),
        or_(Note.title.like(f"%{MARK}%"), Note.summary.like(f"%{MARK}%"))).count()


def sweep(db):
    """崩在半路时按记下的主键收掉；名下数到配图就停下来大声报（删行不等于删对象）。"""
    for nid in list(CREATED):
        n = db.get(Note, int(nid)) if str(nid).isdigit() else None
        if n is None:
            continue
        pics = db.query(Asset).filter(Asset.note_id == n.id).count()
        if pics:
            check(f"兜底删：笔记 {nid} 名下还有 {pics} 行配图，云上对象删不掉 ⇒ 停住人工看", False,
                  "这一条不许默默放过（删行不等于删对象）")
            continue
        n_share = db.query(Share).filter(Share.note_id == n.id).delete(synchronize_session=False)
        db.delete(n)
        db.commit()
        CREATED.remove(nid)
        print(f"· 兜底删：笔记 {nid} 已删（连带 {n_share} 行分享）")


def drop_temp(db, author_id):
    """临时读者整组收掉：台账行 → 分享行 → 笔记行 → 账号两行 → users，最后把这一趟结给作者的分退回起点。"""
    for uid, acct_id in TEMP_USERS:
        note_ids = [r[0] for r in db.query(Note.id).filter(Note.user_id == str(uid)).all()]
        n_asset = db.query(Asset).filter(Asset.note_id.in_(note_ids)).count() if note_ids else 0
        if n_asset:
            print(f"⚠ 停住：临时号 {uid} 名下数到 {n_asset} 行配图，云上对象删不掉 ⇒ 这个号先留着人工看")
            continue
        n_inv = db.query(Invitation).filter(Invitation.invitee_id == int(uid)).delete(synchronize_session=False)
        n_share = db.query(Share).filter(Share.note_id.in_(note_ids)).delete(synchronize_session=False) if note_ids else 0
        n_note = db.query(Note).filter(Note.user_id == str(uid)).delete(synchronize_session=False)
        db.query(AccountIdentity).filter(AccountIdentity.account_id == acct_id).delete(synchronize_session=False)
        db.query(Account).filter(Account.id == acct_id).delete(synchronize_session=False)
        db.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db.commit()
        print(f"· 清临时号 {uid}：笔记 {n_note} 行 · 分享 {n_share} 行 · 台账 {n_inv} 行 · 账号 2 行")
    row = db.get(User, author_id)
    if int(row.quota_bonus or 0) != bonus_start:
        row.quota_bonus = bonus_start
        db.commit()
        print(f"· 把这一趟结给作者的分退回起点（只动 deploy-test 这一行，bonus → {bonus_start}）")


def totals(db):
    return (db.query(Note).count(), db.query(User).count(),
            db.query(Asset).count(), db.query(Invitation).count())


db = SessionLocal()
client = httpx.Client(base_url=BASE, timeout=30)
rc = 1
src_id = src2 = author = None
try:
    author = db.query(User).filter(User.openid == "deploy-test").first()
    if author is None:
        print("✗ 找不到 deploy-test 账号，这一趟一个字节都不写")
        sys.exit(1)
    hdr = {"Authorization": "Bearer " + _create_token(author.id, author.generation)}
    n_start = totals(db)
    bonus_start = int(db.get(User, author.id).quota_bonus or 0)
    print(f"起点：notes {n_start[0]} · users {n_start[1]} · assets {n_start[2]} · 台账 {n_start[3]} · bonus {bonus_start}")
    check("起点干净：这一次标记的行一条都没有", marked(db, author.id) == 0, f"标记={MARK}")

    r = client.post("/api/notes/", headers=hdr, json={"title": TITLE, "summary": SUMMARY})
    check("① 作者建一篇原笔记", r.status_code == 200, f"HTTP {r.status_code}")
    src_id = r.json()["id"]
    CREATED.append(src_id)
    r = client.post("/api/shares/", headers=hdr, json={"note_id": src_id, "author_name": "去重闸探针作者"})
    tok = r.json().get("token", "")
    check("② 分享建出来了（一张活码）", r.status_code == 200 and bool(tok), f"HTTP {r.status_code}")

    # 另一篇 + 另一张码：给第 ⑤ 条用（闸不许把"另一篇"认成"同一篇"）
    r2 = client.post("/api/notes/", headers=hdr,
                     json={"title": f"去重闸探针另一篇 {MARK}", "summary": f"联系方式{MARK}B"})
    src2 = r2.json()["id"]
    CREATED.append(src2)
    tok2 = client.post("/api/shares/", headers=hdr, json={"note_id": src2}).json().get("token", "")

    def new_reader(tag):
        o = User(openid=f"probe-dupede-{tag}-{MARK}", language="zh")
        o.generation = generation.allocate(db)
        db.add(o)
        db.commit()
        db.refresh(o)
        acct = accounts_svc.ensure_for_user(db, o)
        db.commit()
        TEMP_USERS.append((o.id, acct.id))
        return o, {"Authorization": "Bearer " + _create_token(o.id, o.generation)}

    r1, hdr1 = new_reader("A")
    check("③ 临时读者 A 建号成功（收尾连账号一并删）", bool(r1.id), f"user={r1.id}")

    inv_b = db.query(Invitation).count()
    q1 = client.post("/api/notes/from-share", headers=hdr1, json={"token": tok})
    copy1 = q1.json().get("id")
    CREATED.append(copy1) if copy1 else None
    check("④ 第一次转存：200 且真建出一篇", q1.status_code == 200 and bool(copy1),
          f"HTTP {q1.status_code} · id={copy1}")
    db.expire_all()
    check("④ 名下这一篇的副本恰好 1 行", len(mine(db, r1.id, int(src_id))) == 1,
          f"{mine(db, r1.id, int(src_id))}")
    bonus_after_first = int(db.get(User, author.id).quota_bonus or 0)
    check("④ 第一次给作者结了 1 分（闸不许把这一趟也挡掉）",
          bonus_after_first == bonus_start + 1, f"bonus {bonus_start} → {bonus_after_first}")

    inv_after_first = db.query(Invitation).count()
    check("④ 第一次转存确实结了一行台账", inv_after_first == inv_b + 1, f"{inv_b} → {inv_after_first}")
    n_before = db.query(Note).count()
    q2 = client.post("/api/notes/from-share", headers=hdr1, json={"token": tok})
    db.expire_all()
    check("⑤ 第二次转存：回 200，且回的是同一条（不是错误气泡）",
          q2.status_code == 200 and q2.json().get("id") == copy1,
          f"HTTP {q2.status_code} · id={q2.json().get('id')} vs {copy1}")
    check("⑤ 第二次一行都不许多：库里笔记总数不变", db.query(Note).count() == n_before,
          f"{n_before} → {db.query(Note).count()}")
    check("⑤ 名下这一篇的副本仍是 1 行", len(mine(db, r1.id, int(src_id))) == 1,
          f"{mine(db, r1.id, int(src_id))}")
    check("⑤ 分数不再结第二次（基线取在第一次之后）",
          db.query(Invitation).count() == inv_after_first and
          int(db.get(User, author.id).quota_bonus or 0) == bonus_after_first,
          f"台账 {inv_after_first} → {db.query(Invitation).count()} · bonus {bonus_after_first} → {int(db.get(User, author.id).quota_bonus or 0)}")
    a_before = db.query(Asset).count()
    q3 = client.post("/api/notes/from-share", headers=hdr1, json={"token": tok})
    db.expire_all()
    check("⑤ 第三次仍回同一条、配图一行都不许多",
          q3.json().get("id") == copy1 and db.query(Asset).count() == a_before,
          f"id={q3.json().get('id')} · assets {a_before} → {db.query(Asset).count()}")

    d = client.delete(f"/api/notes/{copy1}", headers=hdr1)
    check("⑥ 删掉那一副本（真口 200）", d.status_code == 200, f"HTTP {d.status_code}")
    db.expire_all()
    gone = len(mine(db, r1.id, int(src_id)))
    check("⑥ 删完名下这一篇是 0 行（闸的前提跟着消失）", gone == 0, f"还剩 {gone} 行")
    CREATED.remove(copy1) if copy1 in CREATED else None
    q4 = client.post("/api/notes/from-share", headers=hdr1, json={"token": tok})
    new_id = q4.json().get("id")
    CREATED.append(new_id) if new_id else None
    db.expire_all()
    # ⚠ 不许拿"id 变没变"当尺子：删掉最大那一行后 SQLite 会把同一个 id 再发一遍（§8.487 踩过）。
    # 正确的量法＝删之前 0 行、存之后 1 行，而且这一行读得到正文。
    check("⑥ 删了再存：走得通（名下从 0 行变 1 行，且那一条读得到）",
          q4.status_code == 200 and len(mine(db, r1.id, int(src_id))) == 1 and
          client.get(f"/api/notes/{new_id}", headers=hdr1).status_code == 200,
          f"HTTP {q4.status_code} · 名下 {gone} → {len(mine(db, r1.id, int(src_id)))} 行 · id={new_id}")
    check("⑥ 删了再存之后名下仍是 1 行", len(mine(db, r1.id, int(src_id))) == 1,
          f"{mine(db, r1.id, int(src_id))}")

    q5 = client.post("/api/notes/from-share", headers=hdr1, json={"token": tok2})
    other_copy = q5.json().get("id")
    CREATED.append(other_copy) if other_copy else None
    db.expire_all()
    check("⑦ 换一篇（另一张码）：不许被挡成'已收藏'",
          q5.status_code == 200 and bool(other_copy) and other_copy != new_id,
          f"HTTP {q5.status_code} · id={other_copy}")

    r2u, hdr2 = new_reader("B")
    q6 = client.post("/api/notes/from-share", headers=hdr2, json={"token": tok})
    b_copy = q6.json().get("id")
    CREATED.append(b_copy) if b_copy else None
    db.expire_all()
    check("⑧ 换一个人存同一篇：照旧建他自己的那一份（闸不许认成同一人）",
          q6.status_code == 200 and bool(b_copy) and b_copy not in (new_id, copy1),
          f"HTTP {q6.status_code} · id={b_copy}")

    rc = 0
except Exception as exc:
    print(f"!! 崩在半路：{type(exc).__name__}: {exc}")
    import traceback
    traceback.print_exc()
finally:
    # 清扫与判据拆成两个 try（10-25 审计 M24）：原先两只保险装在一起，清扫一抛，
    # 下面那七条收尾判据一条都进不了 results，而退出码只认 results 里有没有红项
    # ⇒ 屏幕上只剩一句"收尾本身也崩了"，退出码照旧 0：假绿灯＋残留同时隐身。
    try:
        for nid in [x for x in CREATED if x in (src_id, src2)]:
            client.delete(f"/api/notes/{nid}", headers=hdr)
        sweep(db)
        drop_temp(db, author.id)
    except Exception as exc:
        check("收尾清扫整段崩了（库里可能有残留，人工按标记 %s 查一遍）" % MARK, False,
              f"{type(exc).__name__}: {exc}")
    try:
        db.expire_all()
        left = marked(db, author.id) + sum(marked(db, u) for u, _ in TEMP_USERS) if TEMP_USERS else marked(db, author.id)
        check("收尾：这次标记的笔记一条不留（标题与摘要两栏都搜）", left == 0, f"还剩 {left} 条")
        check("收尾：临时号名下的行删净（笔记 0）",
              all(db.query(Note).filter(Note.user_id == str(u)).count() == 0 for u, _ in TEMP_USERS),
              f"临时号 {len(TEMP_USERS)} 个")
        check("收尾：users 与 accounts 里那两个临时号都没留",
              db.query(User).filter(User.openid.like(f"probe-dupede-%{MARK}%")).count() == 0, "")
        check("收尾：作者那篇原笔记与另一篇都已删（读是 404）",
              client.get(f"/api/notes/{src_id}", headers=hdr).status_code == 404 and
              client.get(f"/api/notes/{src2}", headers=hdr).status_code == 404, "")
        check("收尾：孤儿分享行 0（活码/死码都不留在这一次标记的笔记名下）",
              db.query(Share).join(Note, Share.note_id == Note.id).filter(Note.title.like(f"%{MARK}%")).count() == 0, "")
        n_end = totals(db)
        check("收尾：四个总数回到起点", n_end == n_start, f"{n_start} → {n_end}")
        check("收尾：作者的已到奖励回到起点",
              int(db.get(User, author.id).quota_bonus or 0) == bonus_start,
              f"{bonus_start} → {int(db.get(User, author.id).quota_bonus or 0)}")
    except Exception as exc:
        check("收尾判据整段崩了（这一趟的账读不出来，按残留处理）", False,
              f"{type(exc).__name__}: {exc}")
    # 条数下限：崩在半路那一趟是"results 里恰好一条红的都没有"的唯一来源——判据压根没跑。
    # 认的是名字带「收尾：」那七条的条数：它们是这一支全部的对外账单，少一条就说明这一趟不配报绿。
    got = sum(1 for name, _ in results if name.startswith("收尾："))
    if got < END_MIN:
        check(f"收尾判据跑够了（应 {END_MIN} 条，实跑 {got} 条）", False,
              "少掉的那几条是崩在半路时没跑到的，别看上面那条数")
    ok = sum(1 for _, o in results if o)
    bad = len(results) - ok
    print(f"\n{ok}/{len(results)} 条通过（收尾判据 {got}/{END_MIN} 条）· 红 {bad} · 退出码 {rc if bad == 0 else 1}")
    db.close()
sys.exit(rc if not any(not o for _, o in results) else 1)
