"""现网探针：分享这一路的五条修复，在真库真接口上过一遍（快照同步 + 撤回分享）。

和 pytest 的分工：单元用例证明"逻辑对不对"，这里证明"部署到现网的那份字节真的是它"，
而且用的是真 msgSecCheck——SEC_CHECK_ENABLED 在测试里是关掉的，绕审那条只有现网能验。

用法（在服务器上跑，读得到 .env、也只走本机出网）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/share_live_probe.py

它只用 deploy-test 那个账号（user_id=1），跑完自己把建出来的笔记删掉；
别的账号一行都不碰。全程只在结尾断言"我建的行都清了"。

要看的七件事：
① 改标题之后，公开分享页不再挂着旧内容（隐私泄漏本体）。
② 反复建分享只有一张码，而且第二次起不再多打内容安全。
③ key_links 里塞违规文本要拦（这一轮新补的送检字段）。
④ 同一张小程序码第二次拿不重复打微信（看耗时差）。
⑤ 撤掉分享（2026-09-24 这批）：状态接口说的是实话、撤掉之后旧码当场扫不开、
   重新分享换的是全新的一张码而旧码不会复活、新码不再有七天过期、落地页带要点与链接。
⑥ 作者署名与转存（2026-09-24 下午这批）：昵称进公开快照、转存抄的是同一份字段、
   来源那一栏任何写接口都改不动、原笔记没了转存那篇照旧、撤掉之后那张码也转存不进东西。
⑦ 额度改回 100 + 转存也算激活（2026-09-24 深夜这批）：接口形状、闸门挂在几条入口上、
   source_note_id 与那条部分唯一索引真在库里、自己转存自己那一趟一分钱都不结。
   现网只有 deploy-test 一个可写的号，"给作者结 10 篇"那条真给钱的分支在这里证不了，
   由 backend/tests/test_quota_and_invite.py 的 Test转存也激活 那 10 条守着。
"""
import json
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]          # 只标记这一次跑建出来的行，收尾按它清
PHONE_TITLE = f"我的手机号是 1380000{MARK[:5]}"
CLEAN_TITLE = "改成正常的标题"
VIOLATING = "线上赌场 六合彩 特码 内部资料 稳赚 下注网址"   # deploy.sh 自检里实测判 risky 的那串

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
    client = httpx.Client(base_url=BASE, timeout=30)

    def count_rows():
        return db.query(Note).filter(Note.user_id == str(user.id),
                                    Note.title.like(f"%{MARK}%")).count()

    check("起点干净：这次标记的行一条都没有", count_rows() == 0, f"标记={MARK}")

    # ---- ① 快照必须跟着笔记走 ------------------------------------------------
    r = client.post("/api/notes/", headers=hdr,
                    json={"title": PHONE_TITLE, "summary": f"联系方式{MARK}"})
    check("建一条带手机号的笔记", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return finish(client, db, user, MARK)
    note_id = r.json()["id"]

    r = client.post("/api/shares/", headers=hdr, json={"note_id": note_id})
    check("建分享", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    token = r.json().get("token", "")

    public = client.get(f"/api/shares/{token}")
    check("公开页此时确实带着手机号（前提成立）",
          PHONE_TITLE in public.text, public.json().get("title", ""))

    r = client.put(f"/api/notes/{note_id}", headers=hdr, json={"title": CLEAN_TITLE})
    check("改掉那个标题", r.status_code == 200, f"HTTP {r.status_code}")
    public = client.get(f"/api/shares/{token}")
    check("① 公开页不再返回旧标题",
          public.json().get("title") == CLEAN_TITLE,
          f"公开页现在给的是 {public.json().get('title')!r}")
    check("① 整份响应里搜不到那串手机号", PHONE_TITLE not in public.text)
    check("① 笔记详情读到的也是新标题",
          client.get(f"/api/notes/{note_id}", headers=hdr).json().get("title") == CLEAN_TITLE)

    # ---- ② 一条笔记一张码，且不重复送检 --------------------------------------
    db.expire_all()
    before = db.query(Share).filter(Share.note_id == note_id).count()
    tokens = {client.post("/api/shares/", headers=hdr,
                          json={"note_id": note_id}).json().get("token") for _ in range(5)}
    db.expire_all()
    after = db.query(Share).filter(Share.note_id == note_id).count()
    check("② 连发五次仍只有一张码", len(tokens) == 1, f"拿到 {len(tokens)} 个不同 token")
    check("② 分享行数一条没多", after == before, f"{before} → {after}")

    # ---- ③ key_links 现在也进送检 ----------------------------------------------
    # 这条**不能只看 HTTP**：本探针用的是 deploy-test 那个账号，它的 openid 是手写短串，
    # 微信对非法 openid 回 40003 → 按"没检成=放行"处理，所以 HTTP 上永远拦不下来，
    # 红了也只说明账号是假的。做法是先照常把违规内容 PUT 进去（这步会接受），
    # 再拿**真 openid** 调路由用的同一个函数、送路由会送的同一份字段——
    # 验的是"这份内容到了真账号手上会不会被拦"。一次 1 个额度。
    real = db.query(User).filter(User.openid.like("o0%"), User.id > 1) \
                       .order_by(User.id.desc()).first()
    from app.services import wechat
    from app.services.sharing import public_fields

    r = client.put(f"/api/notes/{note_id}", headers=hdr,
                   json={"key_links": [VIOLATING, f"https://example.com/{MARK}"]})
    db.expire_all()
    note_now = db.get(Note, note_id)
    check("③ 违规串已经进到 key_links 里（构造成功）",
          VIOLATING in json.dumps(note_now.key_links or [], ensure_ascii=False),
          f"HTTP {r.status_code} · {note_now.key_links}")

    verdict = wechat.probe_sec_check(real.openid, VIOLATING)
    if verdict["errcode"] in (45009, 44991):
        check("③ 今天 msgSecCheck 额度已打光，这条判不了（跳过，不是代码问题）", True,
              f"errcode={verdict['errcode']}；未上架 100 次/天，明天 00:00 恢复")
    else:
        blocked = False
        try:
            wechat.enforce_text_safety(real.openid, *public_fields(note_now))
        except wechat.UserError:
            blocked = True
        check("③ 同一份字段换成真 openid 会被拦下（key_links 确实进了送检）", blocked,
              f"单独送违规串 → {verdict['verdict']}(errcode={verdict['errcode']})，"
              f"整份字段 → {'拦' if blocked else '放'}")
    check("③ 快照与库里的内容一致（同步没漏）",
          (VIOLATING in json.dumps(note_now.key_links or [], ensure_ascii=False))
          == (VIOLATING in client.get(f"/api/shares/{token}").text))

    # ---- ④ 小程序码：同一张只真打一次微信 ------------------------------------
    # 延迟只是辅助证据（决定性的那一刀是 journald 里"小程序码回源微信"的行数，
    # 由外层脚本按这次的时间窗去数）。单次抖动可能有，所以取中位数而不是最大值。
    timings = []
    body0 = None
    for _ in range(9):
        t0 = time.perf_counter()
        r = client.get(f"/api/shares/{token}/qrcode")
        timings.append((time.perf_counter() - t0) * 1000)
        if r.status_code != 200:
            break
        if body0 is None:
            body0 = r.content
        elif r.content != body0:
            check("④ 反复拿的是同一张图", False, "字节不一致")
            break
    else:
        first, tail = timings[0], sorted(timings[1:])
        median = tail[len(tail) // 2]
        check("④ 小程序码接口出图正常", body0 is not None and len(body0) > 1000,
              f"{len(body0 or b'')} 字节")
        check("④ 后续请求的中位数远低于首次（没有反复回源）",
              median < first / 5,
              f"首次 {first:.0f}ms，其余中位数 {median:.0f}ms（全部 {[round(x) for x in timings]}）")

    # ---- ⑤ 撤掉分享：关的是"这张纸"，不是"这扇门" ----------------------------
    def status():
        return client.get("/api/shares/status", params={"note_id": note_id}, headers=hdr)

    st = status()
    check("⑤ 状态接口如实报「已公开」，并给回当前那张码",
          st.status_code == 200 and st.json().get("active") is True and st.json().get("token") == token,
          f"HTTP {st.status_code} · {st.text[:90]}")

    # 撤之前先给这篇补上要点和链接——撤回之后重新分享走的是同一份公开字段，
    # 正好一次验两件事：门关上、开着的时侯内容是全的。
    client.put(f"/api/notes/{note_id}", headers=hdr,
               json={"key_points": [f"探针要点{MARK}", "第二条要点"],
                     "source_url": f"https://example.com/src/{MARK}"})
    r = client.post("/api/shares/revoke", headers=hdr, json={"note_id": note_id})
    check("⑤ 点撤掉：关掉一行", r.status_code == 200 and r.json().get("closed") == 1, r.text[:90])
    check("⑤ 已经发出去那张码当场扫不开", client.get(f"/api/shares/{token}").status_code == 404)
    st = status()
    check("⑤ 状态接口跟着改口：不公开、也没有码",
          st.json().get("active") is False and st.json().get("token") is None, st.text[:90])
    r = client.post("/api/shares/revoke", headers=hdr, json={"note_id": note_id})
    check("⑤ 再点一次撤掉不报错、也不重复关行", r.status_code == 200 and r.json().get("closed") == 0,
          r.text[:90])

    r = client.post("/api/shares/", headers=hdr, json={"note_id": note_id})
    new_token = r.json().get("token", "")
    check("⑤ 重新分享给的是全新的一张码", bool(new_token) and new_token != token,
          f"旧 {token[:8]}… → 新 {new_token[:8]}…")
    check("⑤ 旧码不会因为「又分享了一次」被救活",
          client.get(f"/api/shares/{token}").status_code == 404)
    pub = client.get(f"/api/shares/{new_token}")
    check("⑤ 新码扫得开，且落地页带着要点与来源链接",
          pub.status_code == 200 and f"探针要点{MARK}" in pub.text
          and f"/src/{MARK}" in pub.text, f"HTTP {pub.status_code}")
    db.expire_all()
    live = db.query(Share).filter(Share.note_id == note_id, Share.is_active == True).all()
    check("⑤ 这篇名下开着的码仍然只有一张", len(live) == 1, f"{len(live)} 张")
    check("⑤ 新码不带过期时间（印在海报上的那张纸不会一周作废）",
          live and live[0].expires_at is None,
          f"expires_at={getattr(live[0], 'expires_at', None) if live else '无行'}")

    # ---- ⑥ 作者署名与转存（2026-09-24 下午这批）--------------------------------
    src_note_id = note_id
    r = client.post("/api/shares/revoke", headers=hdr, json={"note_id": note_id})
    check("⑥ 先撤掉上一组那张码，给这一组腾位置", r.status_code == 200, r.text[:60])
    AUTHOR = f"探针作者{MARK[:4]}"
    r = client.post("/api/shares/", headers=hdr, json={"note_id": note_id, "author_name": AUTHOR})
    tok6 = r.json().get("token", "")
    check("⑥ 创建分享时把作者昵称带上", r.status_code == 200 and r.json().get("author_name") == AUTHOR,
          f"HTTP {r.status_code} · author_name={r.json().get('author_name')}")
    pub6 = client.get(f"/api/shares/{tok6}")
    check("⑥ 匿名扫开也能看到是谁写的（昵称在公开响应里）",
          pub6.status_code == 200 and pub6.json().get("author_name") == AUTHOR, f"HTTP {pub6.status_code}")
    snap = pub6.json()

    r = client.post("/api/notes/from-share", headers=hdr, json={"token": tok6})
    copy = r.json()
    check("⑥ 转存成功并落进自己库", r.status_code == 200 and bool(copy.get("id")),
          f"HTTP {r.status_code} · id={copy.get('id')}")
    copy_id = copy.get("id")
    fields = ("title", "summary", "tags", "key_points", "key_links", "source_url")
    diff = [f for f in fields if snap.get(f) != copy.get(f)]
    check("⑥ 整条抄：公开页那六个字段逐字一致", not diff, f"不一致：{diff}" if diff else "全等")
    src = copy.get("imported_from") or {}
    check("⑥ 来源钉在笔记上：作者、原笔记、时间都在",
          src.get("author_name") == AUTHOR and src.get("share_token") == tok6
          and bool(src.get("imported_at")) and src.get("title_at_import") == snap.get("title"),
          f"{ {k: src.get(k) for k in ('author_name', 'title_at_import', 'imported_at')} }")
    check("⑥ 来源类型标成转存，不是手写", copy.get("source_type") == "share_import", copy.get("source_type"))

    r = client.put(f"/api/notes/{copy_id}", headers=hdr,
                   json={"title": "改过的标题", "source_type": "manual",
                         "imported_from": {"author_name": "李鬼", "share_token": "伪造"}})
    after = client.get(f"/api/notes/{copy_id}", headers=hdr).json()
    check("⑥ 正文改得动（这条还是他自己的笔记）", r.status_code == 200 and after.get("title") == "改过的标题",
          f"HTTP {r.status_code}")
    check("⑥ 来源那一栏改不动：伪造的字段整个被忽略",
          (after.get("imported_from") or {}).get("author_name") == AUTHOR
          and (after.get("imported_from") or {}).get("share_token") == tok6,
          f"改后={ {k: (after.get('imported_from') or {}).get(k) for k in ('author_name', 'share_token')} }")
    check("⑥ 来源类型也改不回手写", after.get("source_type") == "share_import", after.get("source_type"))
    db.expire_all()
    check("⑥ 转存不新增分享行：这篇自己没开过码",
          db.query(Share).filter(Share.note_id == copy_id).count() == 0)

    client.post("/api/shares/revoke", headers=hdr, json={"note_id": note_id})
    r = client.post("/api/notes/from-share", headers=hdr, json={"token": tok6})
    check("⑥ 撤掉分享之后，那张码也转存不进东西", r.status_code == 404, f"HTTP {r.status_code} {r.text[:70]}")
    r = client.delete(f"/api/notes/{note_id}", headers=hdr)
    check("⑥ 删掉原笔记", r.status_code in (200, 204), f"HTTP {r.status_code}")
    still = client.get(f"/api/notes/{copy_id}", headers=hdr)
    check("⑥ 原笔记没了，转存那篇照旧读得到、来源照旧在",
          still.status_code == 200 and (still.json().get("imported_from") or {}).get("share_token") == tok6,
          f"HTTP {still.status_code}")
    note_id = copy_id      # 收尾按这一条清（原笔记已经删掉了）

    # ---- ⑦ 额度这一轮（09-24 晚口径：100 篇基础 + 带来一个新写作者 +10 + 同一篇只挣一次）----
    # 现网只有 deploy-test 这一个可以写的号，所以"给作者结 10 篇"那条真给钱的分支在这里
    # 证不了（要两个账号），它由 backend/tests 那 12 条新用例守着。这里证的是：
    # 接口形状、闸门确实挂在五条入口上、表结构到位、自己转存自己那一趟一分钱都不结。
    inv_before = db.query(Invitation).count()
    db.expire_all()
    bonus_before = int(db.get(User, user.id).quota_bonus or 0)

    r = client.get("/api/user/quota", headers=hdr)
    body = r.json() if r.status_code == 200 else {}
    want = ["base", "bonus", "categories", "invites_rewarded", "limit", "remaining", "reward_each", "used"]
    check("⑦ /api/user/quota 回的就是界面要的那八个字段",
          r.status_code == 200 and sorted(body) == want, f"HTTP {r.status_code} · {sorted(body)}")
    check("⑦ 没有「还剩几次」这一档（带来几个人不限，回它就是假话）", "invites_left" not in body)
    check("⑦ 上限那半截 = 100 基础 + 已到手的奖励，remaining 与两者自洽",
          body.get("limit") == body.get("base") + body.get("bonus")
          and body.get("remaining") == max(0, (body.get("limit") or 0) - (body.get("used") or 0)),
          f"used={body.get('used')} limit={body.get('limit')} bonus={body.get('bonus')}")
    check("⑦ 每个新写作者给的就是 10 篇", body.get("reward_each") == 10, f"reward_each={body.get('reward_each')}")

    from sqlalchemy import text as sa_text
    cols = [row[1] for row in db.execute(sa_text("pragma table_info(invitations)")).fetchall()]
    check("⑦ 台账有 source_note_id 这一列（转存那条要指名是哪篇带来的）", "source_note_id" in cols, f"{cols}")
    idx_sql = [row[0] for row in db.execute(sa_text(
        "select sql from sqlite_master where type='index' and name='ux_invitations_one_reward_per_source_note'"
    )).fetchall()]
    check("⑦ 那条部分唯一索引真在库里（同一篇只挣一次是数据库挡的）",
          bool(idx_sql) and "source_note_id IS NOT NULL" in idx_sql[0] and "UNIQUE" in idx_sql[0].upper(),
          f"{idx_sql[0] if idx_sql else '索引不存在'}")

    from app.main import app as fastapi_app

    def dep_names(dep, acc):
        for d in dep.dependencies:
            if d.call is not None:
                acc.add(d.call.__name__)
            dep_names(d, acc)
        return acc

    wired = {}
    for route in fastapi_app.routes:
        p = getattr(route, "path", "")
        if p in ("/api/notes/", "/api/ingest/url", "/api/ingest/screenshots/stage",
                 "/api/ingest/screenshots/process", "/api/notes/from-share"):
            wired[p] = dep_names(route.dependant, set())
    missing = [k for k, v in wired.items() if "require_note_room" not in v]
    check("⑦ 五条入库入口全都还挂着额度闸门（漏一条就是从那儿绕开上限）",
          len(wired) == 5 and not missing,
          f"查到 {len(wired)} 条，缺闸门：{missing or '无'}")

    check("⑦ ⑥ 那一趟是「自己转存自己那篇」，一分钱都不该结",
          db.query(Invitation).count() == inv_before, f"台账 {inv_before} → {db.query(Invitation).count()}")
    r = client.post("/api/notes/", headers=hdr, json={"title": f"额度基线核对{MARK}"})
    check("⑦ 存一条笔记不影响已到手的奖励（额度这一轮没把钱乱发）",
          r.status_code == 200 and (db.query(Invitation).count() == inv_before) and
          int(db.get(User, user.id).quota_bonus or 0) == bonus_before,
          f"HTTP {r.status_code} · bonus={bonus_before}→{db.get(User, user.id).quota_bonus}")
    if r.status_code == 200:
        client.delete(f"/api/notes/{r.json()['id']}", headers=hdr)

    # ---- 收尾：只清这一次建的东西 ---------------------------------------------

    r = client.delete(f"/api/notes/{note_id}", headers=hdr)
    check("删掉这条笔记", r.status_code in (200, 204), f"HTTP {r.status_code}")
    check("删掉的笔记，那张码扫开是 404",
          client.get(f"/api/shares/{new_token}").status_code == 404)
    check("收尾：撤掉过的旧码也仍然是 404",
          client.get(f"/api/shares/{token}").status_code == 404)
    db.expire_all()
    check("收尾：这次标记的笔记一条不留", count_rows() == 0)
    check("收尾：两条笔记名下都没有孤儿分享行",
          db.query(Share).filter(Share.note_id.in_([note_id, src_note_id])).count() == 0)
    return finish(client, db, user, MARK)


def finish(client, db, user, mark):
    client.close()
    db.expire_all()
    left = db.query(Note).filter(Note.user_id == str(user.id), Note.title.like(f"%{mark}%")).count()
    check("收尾（失败路径）：标记行已清", left == 0, f"还剩 {left} 条")
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} 条通过")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name} — {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
