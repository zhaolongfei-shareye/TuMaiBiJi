"""现网探针：10-20 夜审计那批后端修复，跑在现网那台机器上（第五十一次部署的收尾自证）。

分工照旧：`backend/tests/test_audit_20261020_backend.py` 那 11 条证逻辑，
这里证**现网跑的进程用的就是这份字节**——能走 HTTP 的一律从公网口打进去，
只有真走不了的（要临时换掉包内那一份）才在探针自己那个一次性进程里改常量，
改完当场还原，并且把"改的只是本进程的内存、盘上一个字没动"单独钉一条。

用法（在服务器上跑，读得到 .env、token 在进程内签，值不出命令行）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python - < 探-现网审计这批.py

只用 deploy-test 那一个账号。名下的笔记与配图行收尾全删，回到进门时那几个数。
`file_id` 全是假的（`cloud://probe51-…`）：这一把验的是库与闸门，不碰云上的对象。
提炼那一条是真调用（烧一次混元 token 与一次内容送检），因为它唯一的作用是证明
云函数重传之后这条链还活着——降级态与成功态在屏上长得一样，只有回体分得开。

现网验不了、只有本地用例钉着的（不许当成验过）：
- N1 的"越界归因不许挡住登录"要走微信 `code2session`，现网没有真 code；
- N14 的"库里与包里两头都坏"要同时改包内文件与库，现网不许动包。
"""
import inspect
import json
import time
import uuid

import httpx
from sqlalchemy import text

from app.api.routes import user as user_routes
from app.core.auth import _create_token
from app.core.errors import UserError
from app.db.database import SessionLocal
from app.models.asset import Asset
from app.models.note import Note
from app.models.user import User
from app.services import llm, poster_engine, poster_recipe, preset_note, quota
from app.services.queue import get_task_status

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
TOO_BIG = 10 ** 21                     # 越界：驱动绑不进去（与用例同一个数）
EDGE_OK = 9_223_372_036_854_775_807    # int64 上界本身：绑得进去，只是查不到
results = []


def ck(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))
    return bool(ok)


def has_cjk(s):
    return any("一" <= ch <= "鿿" for ch in (s or ""))


def finish(client, db, hdr, base):
    """收尾：把这一趟造的笔记（连带配图行与卡片）删干净，再逐样数回进门值。"""
    for nid in base["made"]:
        client.delete(f"/api/notes/{nid}", headers=hdr)
    db.expire_all()
    left_notes = db.query(Note).filter(Note.user_id == base["uid"]).count()
    left_assets = db.query(Asset).filter(Asset.user_id == base["uid"]).count()
    total = db.execute(text("SELECT COUNT(*) FROM notes")).scalar()
    ck("收尾：这个账号名下笔记数回到进门值", left_notes == base["notes"], f"{base['notes']} → {left_notes}")
    ck("收尾：这个账号名下配图行清零", left_assets == 0, f"还有 {left_assets} 行")
    ck("收尾：全站笔记数回到进门值", total == base["total"], f"进门 {base['total']}、现在 {total}")
    db.close()
    bad = [n for n, ok in results if not ok]
    print(f"\n探-现网审计这批：{len(results)} 条，红 {len(bad)} 条" + (f"：{bad}" if bad else "（全过）"))
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
    client = httpx.Client(base_url=BASE, timeout=60)
    base = {"uid": uid, "made": [],
            "notes": db.query(Note).filter(Note.user_id == uid).count(),
            "total": db.execute(text("SELECT COUNT(*) FROM notes")).scalar()}

    head = db.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    ck("这批无 schema 变更：现网 alembic 头仍是 a4d7e2b91c58", head == ["a4d7e2b91c58"], str(head))

    # ---------- ① N1：越界整数不再把接口打崩（全局 OverflowError 出口） ----------
    r = client.get(f"/api/notes/{TOO_BIG}", headers=hdr)
    detail = "" if r.status_code >= 500 else (r.json().get("detail") or "")
    ck("N1 越界的笔记编号回中文 400（改前是 500）",
       r.status_code == 400 and has_cjk(detail), f"HTTP {r.status_code} {str(detail)[:40]}")
    r = client.get(f"/api/notes/{EDGE_OK}", headers=hdr)
    ck("N1 反向：int64 上界本身不越界，查不到就该是 404 而不是被那道出口误伤",
       r.status_code == 404, f"HTTP {r.status_code}")
    mine = db.query(Note).filter(Note.user_id == uid).limit(1).first()
    if mine:
        r = client.get(f"/api/notes/{mine.id}", headers=hdr)
        ck("N1 反向：正常编号照旧读得出来（那道出口没顺手把门关上）", r.status_code == 200, f"HTTP {r.status_code}")
    ck("N1 机制底：现网那份 quota.py 里 MAX_PK 在（归因走的是它，不是 try 兜住就算）",
       getattr(quota, "MAX_PK", None) == EDGE_OK, str(getattr(quota, "MAX_PK", "没有这一枚")))

    # ---------- ② N1 剩下的那一半：补报邀请人那一口 ----------
    r = client.post("/api/user/inviter", json={"inviter": TOO_BIG}, headers=hdr)
    ck("N1 补报邀请人那口对越界编号回 200＋applied False（改前是 500）",
       r.status_code == 200 and r.json().get("applied") is False, f"HTTP {r.status_code} {r.text[:60]}")

    # ---------- ③ N13①：两条长度上限 ----------
    r = client.post("/api/ingest/url", data={"url": "https://e.com/" + "a" * 5000}, headers=hdr)
    ck("N13① 抓取那口有长度上限：超长回 422 且话里带「太长」",
       r.status_code == 422 and "太长" in json.dumps(r.json(), ensure_ascii=False), f"HTTP {r.status_code} {r.text[:60]}")
    r = client.get("/api/notes/", params={"search": "搜" * 300}, headers=hdr)
    ck("N13① 搜索串有长度上限：300 字回 422（原来原样进 LIKE 扫全表正文）",
       r.status_code == 422, f"HTTP {r.status_code}")
    r = client.get("/api/notes/", params={"search": "搜" * 5}, headers=hdr)
    ck("N13① 反向：正常长度的搜索照旧 200", r.status_code == 200, f"HTTP {r.status_code}")

    # ---------- ④ N13②：张数上限在提交之后再数一遍，被拒那次不许留行 ----------
    r = client.post("/api/notes/", headers=hdr, json={
        "title": f"探针闸门{MARK}", "summary": f"探针摘要{MARK}", "content": f"探针正文{MARK}"})
    if not ck("建出这篇探针笔记", r.status_code == 200, f"HTTP {r.status_code} {r.text[:60]}"):
        return finish(client, db, hdr, base)
    note_id = r.json()["id"]
    base["made"].append(note_id)

    # 第一版这条红在产品，红在尺子：两次都用 `{i}.jpg`，第十张递的是**已经绑过的那枚 file_id**，
    # 而那道口按 file_id 幂等（同一枚再报一次回 200 与原来九行，不新增）——于是我量到的是"幂等"，
    # 不是"第十张被拒"。每张必须用没绑过的号，且九张与第十张分属两批标记。
    def items(n, tag):
        return [{"file_id": f"cloud://probe51-{MARK}/{tag}{i}.jpg", "size": 300 * 1024} for i in range(n)]

    r = client.post(f"/api/notes/{note_id}/assets", json={"items": items(9, "a")}, headers=hdr)
    if not ck("N13② 前置：先绑满九张（200 且回九行）",
              r.status_code == 200 and len(r.json()) == 9, f"HTTP {r.status_code} {r.text[:60]}"):
        return finish(client, db, hdr, base)
    r = client.post(f"/api/notes/{note_id}/assets", json={"items": items(1, "b")}, headers=hdr)
    db.expire_all()
    rows = db.query(Asset).filter(Asset.note_id == note_id).count()
    ck("N13② 第十张当场被拒（400 且一句中文）",
       r.status_code == 400 and has_cjk(r.json().get("detail") or ""), f"HTTP {r.status_code} {r.text[:50]}")
    ck("N13② 被拒那一次库里一行都没留（「看不见又占配额」那种幽灵行）", rows == 9, f"这篇现在 {rows} 行")

    # ---------- ⑤ N13③：四个写口改成同步 def ----------
    names = ["update_wallpaper", "update_language", "get_contact_email", "update_contact_email"]
    missing = [n for n in names if not hasattr(user_routes, n)]
    still_async = [n for n in names if inspect.iscoroutinefunction(getattr(user_routes, n, None))]
    ck("N13③ 那四个写口在现网那份字节里一律是同步 def（Session 是同步的）",
       not missing and not still_async, f"缺：{missing}／还是 async：{still_async}")

    # ---------- ⑥ N11：空白配方过不了闸门（现网那份服务端抄本） ----------
    blank = {"id": "blank", "min_version": 1,
             "steps": [{"let": "height", "value": 400}, {"do": {"prim": "setFont", "args": {"size": 30}}}]}
    e1 = poster_recipe.validate_recipe(blank)
    ck("N11 一笔都不落笔的配方：闸门拒（现网进程里现读）", any("没有一笔真的落笔" in x for x in e1), "；".join(e1)[:60])
    notbase = {"id": "nb", "min_version": 1, "steps": [
        {"let": "height", "value": 400},
        {"emit": {"k": "fill", "x": 0, "y": 0, "w": 300, "h": 400, "color": "#ffffff"}}]}
    e2 = poster_recipe.validate_recipe(notbase)
    ck("N11 起手那笔铺不满整张的配方：闸门拒", any("第一笔不是盖住整张卡的底" in x for x in e2), "；".join(e2)[:60])
    good = {"id": "ok", "min_version": 1, "steps": [
        {"let": "s", "value": {"prim": "scheme", "args": {"name": "pop", "categoryId": 1}}},
        {"emit": {"k": "fill", "x": 0, "y": 0, "w": {"var": "W"}, "h": {"var": "height"}, "color": {"var": "s.bg"}}},
        {"emit": {"k": "text", "x": 40, "y": 120, "lines": [{"lit": "a"}], "size": 40}},
        {"let": "height", "value": 900}]}
    ck("N11 反向：起手是整幅底的配方照样放行（形状照 test_poster_templates.good_recipe() 那一份）",
       poster_recipe.validate_recipe(good) == [], "；".join(poster_recipe.validate_recipe(good))[:80])
    live = db.execute(text("SELECT template_id, recipe FROM poster_templates WHERE status='live'")).all()
    ck(f"现网在发的这套里有 {len(live)} 套模板（少于十套就是库里那几行不对，下面那条反向会空转）",
       len(live) >= 10, f"{len(live)} 套")
    rejected = []
    for tid, rec in live:
        obj = json.loads(rec) if isinstance(rec, str) else rec
        errs = poster_recipe.validate_recipe(obj)
        if errs:
            rejected.append(f"{tid}:{errs[0][:24]}")
    ck(f"N11 反向：现网在发的那 {len(live)} 套用这道新闸门逐套过，一套都不该被拒", not rejected, str(rejected))

    # ---------- ⑦ N9：自家 llm 那一半在现网字节上成立 ----------
    d1 = llm._parse_response("这不是 JSON", "一篇笔记")
    d2 = llm._parse_response(json.dumps({"title": "未命名笔记", "summary": "原文前 500 字",
                                         "key_points": [], "tags": [], "degraded": True}, ensure_ascii=False), "t")
    d3 = llm._parse_response(json.dumps({"title": "正常", "summary": "有要点",
                                         "key_points": ["一"], "tags": []}, ensure_ascii=False), "t")
    ck("N9 模型回体不是 JSON 那一支：degraded True（原来这一栏根本没带）", d1.get("degraded") is True, str(d1.get("degraded")))
    ck("N9 云函数兜底那份合法 JSON 重拼四栏时 degraded 透传出来（真正咬人的那一处）",
       d2.get("degraded") is True, str(d2.get("degraded")))
    ck("N9 反向：真提炼成功的 degraded 仍是 False（不许把成功也标成降级）", d3.get("degraded") is False, str(d3.get("degraded")))

    # ---------- ⑧ N9 端到端：云函数重传之后这一趟真出了要点 ----------
    r = client.post("/api/ingest/text", headers=hdr, json={
        "title": f"探针提炼{MARK}",
        "content": (f"图麦笔记探针 {MARK}。第一段讲部署：这一批把越界整数与长度上限补齐。"
                    "第二段讲探针：能在现网量到的才算数。第三段讲收尾：造出来的东西一律删回进门那个数。")})
    if ck("N9 端到端：这一趟收下了（回体带 task_id）",
          r.status_code in (200, 202) and bool(r.json().get("task_id")), f"HTTP {r.status_code} {r.text[:60]}"):
        tid = r.json()["task_id"]
        done = None
        for _ in range(40):
            time.sleep(3)
            payload = get_task_status(tid) or {}
            if payload.get("status") in ("completed", "failed"):
                done = payload
                break
        if ck("N9 端到端：120 秒内落定（不然就是 worker 没接住）", done is not None,
              f"status={done and done.get('status')}"):
            res = done.get("result") or {}
            # 第二版这条红也在尺子：它拿 `result.key_points` 当"要点出来了"，而 worker 往那一层只写
            # `{note_id, title, degraded}` 三键（`ingest_tasks.py:395` 那份），要点从来不经过 Redis。
            # 真要读要点只能读库里那一行——现在读的就是库。
            nid = res.get("note_id")
            if nid:
                base["made"].append(nid)
            db.expire_all()
            n = db.get(Note, nid) if nid else None
            ck("N9 端到端：completed＋degraded False＋库里那篇真出了要点（不是原文截头）",
               done.get("status") == "completed" and res.get("degraded") is False and n is not None
               and bool(n.key_points) and bool(n.summary)
               and n.summary != (n.original_content or "")[:500],
               f"status={done.get('status')} degraded={res.get('degraded')} "
               f"要点 {len(n.key_points or []) if n else '—'} 条 标签 {len(n.tags or []) if n else '—'} 枚")

    # ---------- ⑨ N14：包内那一份读不出来时不许把整栏打成 500 ----------
    real_seed_row = preset_note.seed_row
    def broken_seed_row(*a, **k):
        raise ValueError("探针造的错：这不是 JSON")
    preset_note.seed_row = broken_seed_row
    try:
        st = preset_note.admin_seed_state(db)
        ck("N14 包里那份读不出来时：整栏照样回得来，且把这句实话带出来（改前是 500 一片英文堆栈）",
           st.get("source") == "库里" and st.get("fallback") is None and has_cjk(st.get("fallback_error") or ""),
           f"source={st.get('source')} fallback_error={str(st.get('fallback_error'))[:36]}")
    except UserError as e:
        ck("N14 库里与包里两头都没有时：响的是自家 UserError（走 HTTP 就是中文 400，不是 500）",
           has_cjk(str(e)), str(e)[:50])
    finally:
        preset_note.seed_row = real_seed_row
    st = preset_note.admin_seed_state(db)
    ck("N14 还原后这栏一个字没变（改的只是本进程里那一枚函数名，盘上包内文件没碰）",
       st.get("fallback") is not None and st.get("fallback_error") is None, f"source={st.get('source')}")

    # ---------- ⑩ 顺带对齐的预览引擎镜像：md5 自证（对不上那一口当场 503） ----------
    eng_body, eng_etag = poster_engine.bundle()
    ck("预览引擎九份镜像与 manifest 逐只 md5 对得上（这次连镜像一起对齐了）",
       poster_engine.ready() and len(eng_body) > 100000, f"{len(eng_body)} B／ETag {eng_etag[:12]}")

    return finish(client, db, hdr, base)


if __name__ == "__main__":
    raise SystemExit(main())
