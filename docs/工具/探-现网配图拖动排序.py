"""现网探针：配图拖动排序那一趟真的落库、并且五个读图口跟着换序（第五十次部署的收尾自证）。

他 10-20 那句「这个问题，还没解决，尽快解决」附的是编辑笔记那一屏弹出一串英文
"Method Not Allowed"——那是后端框架的兜底短语，根因是这条 reorder 口本地有、现网没有
（部署前实测 POST 现网那条口 405；同一路径 DELETE 回 401，说明请求走到了服务）。
所以这把**第一条**要钉的就是：那个口从 405 变成吃我们自己的鉴权。

分工照旧：`backend/tests/test_asset_order.py` 证逻辑，这里证**现网跑的就是这份字节**。

用法（在服务器上跑，读得到 .env、token 在进程内签，值不出命令行）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python - < 探-现网配图拖动排序.py

只用 deploy-test 那一个账号。名下的笔记与配图行收尾全删，回到进门时那几个数。
别人名下的行只**读一次 id 与序号**（用来验"不是这篇的 id 一律不理"那道），一个字都不写。
fileID 全是假的（`cloud://probe50-…`）：这把验的是库里的先后与各口读到的序，不碰云上的对象。

现网没有的一条（不许当成验过）：**私密篇那一趟 403**。它要先把这个号设上私密密码、
再建「私密」分类、再往里塞一篇，留下的状态比这条闸值钱；只有本地用例钉着。
"""
import uuid
from pathlib import Path

import httpx
from sqlalchemy import text

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.asset import Asset, order_by_note
from app.models.note import Note
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
SIZES = [110000, 220000, 330000]
KEYS = [f"cloud://probe50-{MARK}/img{i}-{s}.jpg" for i, s in enumerate(SIZES)]

HEAD = "a4d7e2b91c58"
results = []


def ck(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))
    return bool(ok)


def db_order(db, note_id):
    """按产品那份 order_by_note() 现读这篇的先后（不自己另拼一条 SQL，免得尺子与实现各说一套）。"""
    return [r.id for r in db.query(Asset).filter(Asset.note_id == note_id)
            .order_by(*order_by_note()).all()]


def finish(client, db, user, note_id, base):
    if note_id:
        client.delete(f"/api/notes/{note_id}", headers={"Authorization": f"Bearer {base['token']}"})
    db.expire_all()
    left = db.query(Asset).filter(Asset.user_id == base["uid"]).count()
    notes_left = db.query(Note).filter(Note.user_id == base["uid"]).count()
    nz = db.execute(text("SELECT COUNT(*) FROM assets WHERE sort_order <> 0")).scalar()
    q = client.get("/api/user/storage-quota", headers={"Authorization": f"Bearer {base['token']}"})
    j = q.json() if q.status_code == 200 else {}
    ck("收尾：这个账号名下配图行清零", left == 0, f"还有 {left} 行")
    ck("收尾：笔记数回到进门时那个数", notes_left == base["notes"], f"{base['notes']} → {notes_left}")
    ck("收尾：全站 sort_order 非 0 的行回到进门值", nz == base["nonzero"], f"进门 {base['nonzero']}、现在 {nz}")
    ck("收尾：配额两个字节数与张数回到进门值",
       all(j.get(k) == v for k, v in {
           "user_bytes": base["quota"]["user_bytes"], "user_count": base["quota"]["user_count"],
           "total_bytes": base["quota"]["total_bytes"]}.items()),
       f"现在 user_bytes={j.get('user_bytes')} user_count={j.get('user_count')} total={j.get('total_bytes')}")
    db.close()
    bad = [n for n, ok in results if not ok]
    print(f"\n探-现网配图拖动排序：{len(results)} 条，红 {len(bad)} 条" + (f"：{bad}" if bad else "（全过）"))
    return 1 if bad else 0


def main():
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("✗ 找不到 deploy-test 账号，探针不做任何写操作")
        return 1
    uid = str(user.id)
    token = _create_token(user.id, user.generation)
    hdr = {"Authorization": f"Bearer {token}"}
    client = httpx.Client(base_url=BASE, timeout=30)

    head = db.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    cols = [r[1] for r in db.execute(text("PRAGMA table_info(assets)"))]
    ck(f"现网 alembic 头是 {HEAD}（这一列只有这一条路会长出来）", head == [HEAD], str(head))
    ck("库里 assets 真有 sort_order 那一栏", "sort_order" in cols, str(cols))

    quota0 = client.get("/api/user/storage-quota", headers=hdr)
    j0 = quota0.json() if quota0.status_code == 200 else {}
    base = {
        "token": token, "uid": uid,
        "notes": db.query(Note).filter(Note.user_id == uid).count(),
        "nonzero": db.execute(text("SELECT COUNT(*) FROM assets WHERE sort_order <> 0")).scalar(),
        "quota": j0,
    }
    ck("起点干净：这个账号名下没有遗留的配图行", db.query(Asset).filter(Asset.user_id == uid).count() == 0)
    ck("起点：全站 sort_order 非 0 的行是 0（存量都还没被人拖过）", base["nonzero"] == 0, str(base["nonzero"]))

    r = client.post("/api/notes/", headers=hdr, json={
        "title": f"探针拖动{MARK}", "summary": f"探针摘要{MARK}", "content": f"探针正文{MARK}"})
    if not ck("建出这篇探针笔记", r.status_code == 200, f"HTTP {r.status_code} {r.text[:60]}"):
        return finish(client, db, user, None, base)
    note_id = r.json()["id"]

    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr, json={
        "items": [{"file_id": k, "size": s, "width": 1080, "height": 1440} for k, s in zip(KEYS, SIZES)]})
    rows = r.json() if r.status_code == 200 else []
    if not ck("绑上三张（200 且回三行）", r.status_code == 200 and len(rows) == 3, f"HTTP {r.status_code}"):
        return finish(client, db, user, note_id, base)
    ids = [x["id"] for x in rows]
    db.expire_all()
    seq0 = [v[0] for v in db.execute(text(
        f"SELECT sort_order FROM assets WHERE id IN ({','.join(map(str, ids))}) ORDER BY id"))]
    # 这一条我第一次写反了（写成"刚绑上来的三行应该是 0"）：0 那一档是**迁移留给存量没排过的那批**，
    # 新登记的行走 `next_sort_order`（当前最大值 +1）拿 1..N——本地用例第 149 行钉的就是这个。
    # 判据写错改判据，不改代码迁就旧尺子。
    ck("刚绑上来的三行拿到 1、2、3（新登记按最大值+1 递增，所以永远追加在最后，不会把老笔记的头图换掉）",
       seq0 == [1, 2, 3], str(seq0))
    ck("默认先后＝登记先后（id 升序，sort_order 同值时由它决胜）", db_order(db, note_id) == ids,
       f"{db_order(db, note_id)} vs {ids}")

    # ---- ① 那条英文的直接对照：口在了，鉴权先拒 ----
    r = client.post(f"/api/notes/{note_id}/assets/reorder", json={"ids": ids})
    body = r.text if r.status_code != 200 else ""
    ok401 = r.status_code == 401 and any("\u4e00" <= c <= "\u9fff" for c in body)
    ck("不带凭证打那条口回 401 且那句是中文（部署前这里是 405「Method Not Allowed」）",
       ok401, f"HTTP {r.status_code} {body[:40]}")

    # ---- ② 真排一次：反着递 ----
    want = [ids[2], ids[0], ids[1]]
    r = client.post(f"/api/notes/{note_id}/assets/reorder", headers=hdr, json={"ids": want})
    got = [x["id"] for x in r.json()] if r.status_code == 200 else []
    ck("拖动那一趟回 200，回体就是服务端认下的新序", r.status_code == 200 and got == want,
       f"HTTP {r.status_code} {got}")
    db.expire_all()
    seq = [v[0] for v in db.execute(text(
        f"SELECT sort_order FROM assets WHERE id IN ({','.join(map(str, ids))}) ORDER BY sort_order"))]
    ck("库里序号是 1、2、3（从 1 起，0 永远空着——否则'排过'与'没排过'挤进同一个数）", seq == [1, 2, 3], str(seq))
    ck("库里按产品那份 order_by_note() 读回来也是这一序", db_order(db, note_id) == want)

    r = client.get(f"/api/notes/{note_id}/assets", headers=hdr)
    ck("详情窗/编辑那一排读回来跟着换序（同一个口）",
       [x["id"] for x in r.json()] == want, str([x["id"] for x in r.json()]))
    r = client.get("/api/notes/", headers=hdr, params={"limit": 100})
    lst = r.json() if r.status_code == 200 else []
    row = next((n for n in lst if n.get("id") == note_id), {})
    ck("列表右侧那枚封面＝拖到第一那张（notes.py 那一刀真吃这一列）",
       row.get("cover_file_id") == KEYS[2],
       f"读到 {str(row.get('cover_file_id'))[:60]}（这篇在列表第一页里：{'是' if row else '否'}）")

    # ---- ③ 幂等 ----
    r = client.post(f"/api/notes/{note_id}/assets/reorder", headers=hdr, json={"ids": want})
    ck("同一份名单再排一次回体一字不变（重排不重号）",
       r.status_code == 200 and [x["id"] for x in r.json()] == want)
    db.expire_all()
    ck("幂等这一趟没把序号写成 1..3 之外", db_order(db, note_id) == want)

    # ---- ④ 名单里少递一张：那张落到末尾，不许留在原地撞号 ----
    partial = [want[1], want[0]]
    r = client.post(f"/api/notes/{note_id}/assets/reorder", headers=hdr, json={"ids": partial})
    after = [x["id"] for x in r.json()] if r.status_code == 200 else []
    ck("少递一张时它被排到末尾（留在原地会与新写的数撞上同一个值，症状是'拖了又跑回去'）",
       after == [partial[0], partial[1], want[2]], str(after))

    # ---- ⑤ 不是这篇的 id 一律不理；别人的行一个字不写 ----
    foreign = db.query(Asset).filter(Asset.user_id != uid).first()
    if foreign:
        fid, fbefore = foreign.id, foreign.sort_order
        r = client.post(f"/api/notes/{note_id}/assets/reorder", headers=hdr,
                        json={"ids": after + [fid]})
        db.expire_all()
        fafter = db.query(Asset).filter(Asset.id == fid).first().sort_order
        ck("递进别人那张的 id：本篇回体不多行、别人那行的序号没被写",
           r.status_code == 200 and len(r.json()) == 3 and fafter == fbefore,
           f"回体 {len(r.json()) if r.status_code == 200 else '?'} 行，别人那行 {fbefore} → {fafter}")
    else:
        ck("递进别人那张的 id：本篇回体不多行、别人那行的序号没被写", False, "现网没有别人的配图行可比对，这条没量到")

    other_note = db.query(Note).filter(Note.user_id != uid).first()
    if other_note:
        r = client.post(f"/api/notes/{other_note.id}/assets/reorder", headers=hdr, json={"ids": [1]})
        ck("拿别人的 note_id 打这个口回 404", r.status_code == 404, f"HTTP {r.status_code}")
    else:
        ck("拿别人的 note_id 打这个口回 404", False, "现网没有别人的笔记，这条没量到")

    return finish(client, db, user, note_id, base)


raise SystemExit(main())
