"""现网探针：分享这一路的五条修复，在真库真接口上过一遍（快照同步 + 撤回分享）。

和 pytest 的分工：单元用例证明"逻辑对不对"，这里证明"部署到现网的那份字节真的是它"，
而且用的是真 msgSecCheck——SEC_CHECK_ENABLED 在测试里是关掉的，绕审那条只有现网能验。

用法（在服务器上跑，读得到 .env、也只走本机出网）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/share_live_probe.py

它主打 deploy-test 那个账号（user_id=1），跑完自己把建出来的笔记删掉；别的**真人**账号一行都不碰。
⚠ 10-24 起它还会**临时造一个只给这一把探针用的假 openid 账号**（`probe-reader-<标记>`），
因为「别人扫我的码存进来」这条生产上真跑的路，在现网只有一个可写号时变不出来；而 10-24 那道自存闸
把原来这一组「自己转存自己」的走法当场挡掉了——不改就永远读不到成功那半条腿。收尾按记下的主键
把那个号连它名下的笔记、台账行一起删净，并核对「转存给作者结的那 1 分」已还原（起点/收尾各读一次）。
全程只在结尾断言"我建的行都清了、MIND 台账与 deploy-test 的奖励回到起点"。
⚠ 崩在半路也有一套兜底：建出来的每一篇笔记主键都记在 `CREATED` 里，进程退出前 `sweep()` 按它补删
（10-24 那一趟崩在 ⑥ 之前，① 那篇——标题中途被改过、只剩摘要带着标记——留在现网，一张码还是开着的）。

要看的七件事：
① 改标题之后，公开分享页不再挂着旧内容（隐私泄漏本体）。
② 反复建分享只有一张码，而且第二次起不再多打内容安全。
③ key_links 里塞违规文本要拦（这一轮新补的送检字段）。
④ 同一张小程序码第二次拿不重复打微信（看耗时差）。
⑤ 撤掉分享（2026-09-24 这批）：状态接口说的是实话、撤掉之后旧码当场扫不开、
   重新分享换的是全新的一张码而旧码不会复活、新码不再有七天过期、落地页带要点与链接。
⑥ 作者署名与转存（10-24 夜里加了一道自存闸，这一组跟着改口径）：昵称进公开快照、
   **自己扫自己那张码当场 400 且一行不写**、别人拿同一张码转存照旧通并抄同一份字段、
   来源那一栏任何写接口都改不动、原笔记没了转存那篇照旧、撤掉之后那张码也转存不进东西、
   转存给作者结的那 1 分到账（这条以前在现网证不了）。
⑦ MIND（2026-10-01 改口径）：笔记不限量，所以这里断的是"五条入口都不再挂闸门"；
   接口形状、那两条部分唯一索引真在库里、自己转存自己那一趟一分都不结。
   现网只有 deploy-test 一个可写的号，"给别人转存结 1 分"那条真给钱的分支在这里证不了，
   由 backend/tests/test_quota_and_invite.py 的 Test转存加分 那 8 条守着。
"""
import json
import sys
import time
import traceback
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import or_

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

# 这一次建出来的笔记主键。收尾正常走真口删；这一列是**崩在半路时的兜底**（见 `sweep()`）。
CREATED = []

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))


def marked(db, user_id):
    """带着这一次标记的笔记行数。

    摘要那一栏也要搜：① 那一组的标题在中途被改成 `CLEAN_TITLE`（标记跟着没了），
    只按标题找就看不见它。10-24 就是这个洞——崩在半路的那一趟在现网留下一篇笔记、
    三行分享，其中一张码还开着（公开页当场 HTTP 200），而收尾那句"标记的笔记一条不留"是绿的。
    """
    return db.query(Note).filter(
        Note.user_id == str(user_id),
        or_(Note.title.like(f"%{MARK}%"), Note.summary.like(f"%{MARK}%"))).count()


def sweep(db):
    """崩在半路时按记下的主键把这一次的笔记收掉（正常收尾走真口，这里只兜崩的那一趟）。

    为什么不复用真口 DELETE：崩的时候手里那把票可能已经属于一个被删掉的临时账号，
    而这一趟的目的是"无论怎样都别在现网留东西"。配图那一栏不许默默放过：`delete_note`
    只删行，云上那个对象要客户端去删，所以这里一旦数到配图就停下来大声报。
    """
    from app.models.asset import Asset
    for nid in list(CREATED):
        row = db.query(Note).filter(Note.id == nid).first()
        if not row:
            continue
        n_asset = db.query(Asset).filter(Asset.note_id == nid).count()
        if n_asset:
            print(f"⚠ 补删停住：笔记 {nid} 名下还有 {n_asset} 行配图，云上对象删不掉，人工看")
            continue
        n_share = db.query(Share).filter(Share.note_id == nid).delete(synchronize_session=False)
        db.delete(row)
        db.commit()
        print(f"· 补删：这一次留下的笔记 {nid} 已删（连带 {n_share} 行分享）")


def main():
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("✗ 找不到 deploy-test 账号，探针不做任何写操作")
        return 1
    hdr = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    client = httpx.Client(base_url=BASE, timeout=30)

    def count_rows():
        return marked(db, user.id)

    check("起点干净：这次标记的行一条都没有", count_rows() == 0, f"标记={MARK}")
    # 这一条比上面那条有用：上面的标记是**这一次**的，抓不到上一次崩在半路留下的行。
    # 10-24 那篇漏网的笔记就是靠这个形状（摘要前缀）现量找出来的。
    shape = db.query(Note).filter(
        Note.user_id == str(user.id),
        or_(Note.summary.like("联系方式%"), Note.title.like("我的手机号是 1380000%"))).all()
    check("起点干净：历次探针形状的行一条都没留（崩在半路的兜不住就在这里露头）",
          not shape, f"还剩 {[x.id for x in shape]}")

    # 涉钱与归属的起点：收尾要把台账行数、deploy-test 的已到奖励、users 总数都核对回这三个数。
    inv_start = db.query(Invitation).count()
    users_start = db.query(User).count()
    bonus_start = int(db.get(User, user.id).quota_bonus or 0)
    print(f"起点：台账 {inv_start} 行 · users {users_start} · deploy-test bonus {bonus_start}")

    # ---- ① 快照必须跟着笔记走 ------------------------------------------------
    r = client.post("/api/notes/", headers=hdr,
                    json={"title": PHONE_TITLE, "summary": f"联系方式{MARK}"})
    check("建一条带手机号的笔记", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return finish(client, db, user, MARK)
    note_id = r.json()["id"]
    CREATED.append(note_id)

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

    # ---- ⑥ 作者署名与转存（10-24 那道自存闸把这一组的走法改了口径）------------
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

    # 站长 10-24「为什么自己可以转存自己的，这个不合理，要限制」⇒ 作者本人这一趟当场拒。
    rows_before = count_rows()
    r = client.post("/api/notes/from-share", headers=hdr, json={"token": tok6})
    check("⑥ 自己扫自己那张码：当场 400，屏上那句逐字对上",
          r.status_code == 400 and r.json().get("detail") == "这是你自己的笔记",
          f"HTTP {r.status_code} · {r.text[:80]}")
    db.expire_all()
    check("⑥ 被挡那一趟一行都不写（名下笔记数自 10-01 起没上限，只能靠这道闸）",
          count_rows() == rows_before, f"{rows_before} → {count_rows()}")

    # 「别人扫我的码存进来」是生产上真跑的那半条腿，现网只有一个可写号时变不出来 ⇒ 现造一个临时号，
    # 用完连它名下的行一起删（做法与 docs/工具/本地-造一个别人.py 同源：openid 不参与鉴权）。
    from app.models.account import Account, AccountIdentity
    from app.services import accounts, generation
    other = User(openid=f"probe-reader-{MARK}", language="zh")
    other.generation = generation.allocate(db)
    db.add(other)
    db.commit()
    db.refresh(other)
    other_acct = accounts.ensure_for_user(db, other)
    db.commit()
    hdr2 = {"Authorization": "Bearer " + _create_token(other.id, other.generation)}
    # 收尾要按"当场读下来的值"对账：对象删掉之后再读它的属性会炸（现网实测 ObjectDeletedError）。
    # 两枚主键类型不一样——users 是自增整数，accounts 是 UUID 串，所以这里**不套 int()**。
    other_id, other_acct_id = other.id, other_acct.id
    check("⑥ 临时转存者账号建出来了（收尾删净，见最后三条）", bool(other_id) and bool(other_acct_id),
          f"user={other_id} account={other_acct_id}")

    inv_before = db.query(Invitation).count()
    bonus_before = int(db.get(User, user.id).quota_bonus or 0)
    r = client.post("/api/notes/from-share", headers=hdr2, json={"token": tok6})
    copy = r.json()
    check("⑥ 别人拿同一张码转存：照旧 200（那道闸只挡作者本人）",
          r.status_code == 200 and bool(copy.get("id")), f"HTTP {r.status_code} · id={copy.get('id')}")
    copy_id = copy.get("id")
    if copy_id:
        CREATED.append(copy_id)
    fields = ("title", "summary", "tags", "key_points", "key_links", "source_url")
    diff = [f for f in fields if snap.get(f) != copy.get(f)]
    check("⑥ 整条抄：公开页那六个字段逐字一致", not diff, f"不一致：{diff}" if diff else "全等")
    src = copy.get("imported_from") or {}
    check("⑥ 来源钉在笔记上：作者、原笔记、时间都在",
          src.get("author_name") == AUTHOR and src.get("share_token") == tok6
          and bool(src.get("imported_at")) and src.get("title_at_import") == snap.get("title"),
          f"{ {k: src.get(k) for k in ('author_name', 'title_at_import', 'imported_at')} }")
    check("⑥ 来源类型标成转存，不是手写", copy.get("source_type") == "share_import", copy.get("source_type"))

    # ⚠ 转存带图那一条（他 10-24 拍的乙）此刻在现网**还读不出正样本**：这一把探针的原篇没有配图，
    #    所以 `copy_for_import` 一张都不该打网关。真正的"图跟过来了"要等云函数那只上了现网、
    #    再拿一篇带图的篇子验（账 §8.479，两条通道要一起上）。
    db.expire_all()
    from app.models.asset import Asset
    check("⑥ 原篇没有配图时，副本名下不该凭空多出 assets 行",
          db.query(Asset).filter(Asset.note_id == copy_id).count() == 0)

    r = client.put(f"/api/notes/{copy_id}", headers=hdr2,
                   json={"title": "改过的标题", "source_type": "manual",
                         "imported_from": {"author_name": "李鬼", "share_token": "伪造"}})
    after = client.get(f"/api/notes/{copy_id}", headers=hdr2).json()
    check("⑥ 正文改得动（这条已是转存者自己的笔记）", r.status_code == 200 and after.get("title") == "改过的标题",
          f"HTTP {r.status_code}")
    check("⑥ 来源那一栏改不动：伪造的字段整个被忽略",
          (after.get("imported_from") or {}).get("author_name") == AUTHOR
          and (after.get("imported_from") or {}).get("share_token") == tok6,
          f"改后={ {k: (after.get('imported_from') or {}).get(k) for k in ('author_name', 'share_token')} }")
    check("⑥ 来源类型也改不回手写", after.get("source_type") == "share_import", after.get("source_type"))
    check("⑥ 作者本人读不到转存者那篇（归属没串）",
          client.get(f"/api/notes/{copy_id}", headers=hdr).status_code == 404)
    db.expire_all()
    check("⑥ 转存不新增分享行：那篇副本没开过码",
          db.query(Share).filter(Share.note_id == copy_id).count() == 0)
    db.expire_all()
    check("⑥ 别人转存我这篇 ⇒ 给作者结到账（台账 +1 行、MIND +1）——这条以前在现网证不了",
          db.query(Invitation).count() == inv_before + 1
          and int(db.get(User, user.id).quota_bonus or 0) == bonus_before + 1,
          f"台账 {inv_before}→{db.query(Invitation).count()} · bonus {bonus_before}→"
          f"{int(db.get(User, user.id).quota_bonus or 0)}")

    client.post("/api/shares/revoke", headers=hdr, json={"note_id": note_id})
    r = client.post("/api/notes/from-share", headers=hdr2, json={"token": tok6})
    check("⑥ 撤掉分享之后，那张码也转存不进东西", r.status_code == 404, f"HTTP {r.status_code} {r.text[:70]}")
    r = client.delete(f"/api/notes/{note_id}", headers=hdr)
    check("⑥ 删掉原笔记", r.status_code in (200, 204), f"HTTP {r.status_code}")
    still = client.get(f"/api/notes/{copy_id}", headers=hdr2)
    check("⑥ 原笔记没了，转存那篇照旧读得到、来源照旧在",
          still.status_code == 200 and (still.json().get("imported_from") or {}).get("share_token") == tok6,
          f"HTTP {still.status_code}")

    # ---- ⑦ MIND 这一轮（2026-10-01 口径：笔记不限量 + 动笔 +10 + 转存按"这篇×人" +1）----
    # 「给别人转存结 1 分」这一条以前在现网证不了（只有一个可写号），10-24 起 ⑥ 现造了一个临时号，
    # 所以那一笔真给钱现在有线上读数了——它在 ⑥ 里断过，收尾按主键撤掉并核对回到进程起点。
    # 这里证的是：接口形状、五条入口都不再挂闸门、那两条部分唯一索引真在库里、
    # 以及「自己扫自己那张码」那一趟一行都不写、一分都不结（闸在 ⑥ 前半）。
    inv_before = db.query(Invitation).count()
    db.expire_all()
    bonus_before = int(db.get(User, user.id).quota_bonus or 0)

    r = client.get("/api/user/quota", headers=hdr)
    body = r.json() if r.status_code == 200 else {}
    want = ["base", "bonus", "categories", "import_each", "invites_rewarded",
            "limit", "mind", "remaining", "reward_each", "used"]
    check("⑦ /api/user/quota 回的就是界面要的那十个字段",
          r.status_code == 200 and sorted(body) == want, f"HTTP {r.status_code} · {sorted(body)}")
    check("⑦ 没有「还剩几次」这一档（带来几个人不限，回它就是假话）", "invites_left" not in body)
    check("⑦ mind = 100 基础 + 已到手的奖励（界面右下角那个大数字读的就是它）",
          body.get("mind") == body.get("base") + body.get("bonus"),
          f"mind={body.get('mind')} base={body.get('base')} bonus={body.get('bonus')}")
    check("⑦ 过渡字段 limit/remaining 仍与 base+bonus 自洽（闸门已撤，这两个数只喂线上 1.5.0，不再拦人）",
          body.get("limit") == body.get("base") + body.get("bonus")
          and body.get("remaining") == max(0, (body.get("limit") or 0) - (body.get("used") or 0)),
          f"used={body.get('used')} limit={body.get('limit')} bonus={body.get('bonus')}")
    check("⑦ 两档奖励就是 10 和 1",
          body.get("reward_each") == 10 and body.get("import_each") == 1,
          f"reward_each={body.get('reward_each')} import_each={body.get('import_each')}")

    from sqlalchemy import text as sa_text
    cols = [row[1] for row in db.execute(sa_text("pragma table_info(invitations)")).fetchall()]
    check("⑦ 台账有 source_note_id 这一列（转存那条要指名是哪篇带来的）", "source_note_id" in cols, f"{cols}")
    idx = {row[0]: (row[1] or "") for row in db.execute(sa_text(
        "select name, sql from sqlite_master where type='index' and tbl_name='invitations'"
    )).fetchall()}
    pair = idx.get("ux_invitations_import_once_per_pair", "")
    per_person = idx.get("ux_invitations_first_note_per_invitee", "")
    check("⑦ 转存那半边的部分唯一索引真在库里（同一个用户对同一篇只算一次，数据库挡）",
          "UNIQUE" in pair.upper() and "source_note_id IS NOT NULL" in pair
          and "invitee_id" in pair, pair or "索引不存在")
    check("⑦ 动笔那半边的部分唯一索引真在库里（一个人只成就一次，数据库挡）",
          "UNIQUE" in per_person.upper() and "source_note_id IS NULL" in per_person,
          per_person or "索引不存在")
    check("⑦ 老的 invitee_id 全局唯一已经撤掉（不撤的话动笔之后再也结不了转存）",
          "uq_invitations_invitee" not in " ".join(idx.values()), sorted(idx))

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
    still = [k for k, v in wired.items() if "require_note_room" in v or "quota_gate" in v]
    check("⑦ 五条入库入口都不再挂额度闸门（笔记不限量，2026-10-01 起）",
          len(wired) == 5 and not still,
          f"查到 {len(wired)} 条，还挂着闸门的：{still or '无'}")

    check("⑦ ⑥ 那一笔转存的台账行此刻还在（给作者结的那 1 分没被别的路径偷偷撤，收尾才按主键撤）",
          db.query(Invitation).filter(Invitation.invitee_id == other_id).count() == 1,
          f"临时转存者名下的台账行 {db.query(Invitation).filter(Invitation.invitee_id == other_id).count()} 行")
    r = client.post("/api/notes/", headers=hdr, json={"title": f"额度基线核对{MARK}"})
    check("⑦ 存一条笔记不影响已到手的奖励（额度这一轮没把钱乱发）",
          r.status_code == 200 and (db.query(Invitation).count() == inv_before) and
          int(db.get(User, user.id).quota_bonus or 0) == bonus_before,
          f"HTTP {r.status_code} · bonus={bonus_before}→{db.get(User, user.id).quota_bonus}")
    if r.status_code == 200:
        baseline_id = r.json()["id"]
        CREATED.append(baseline_id)
        client.delete(f"/api/notes/{baseline_id}", headers=hdr)

    # ---- 收尾：只清这一次建的东西（含那个临时转存号与它结走的那 1 分）----------

    check("收尾：原笔记在 ⑥ 里已经删掉了，此刻读是 404",
          client.get(f"/api/notes/{src_note_id}", headers=hdr).status_code == 404)
    r = client.delete(f"/api/notes/{copy_id}", headers=hdr2)
    check("收尾：删掉转存者那篇副本", r.status_code in (200, 204), f"HTTP {r.status_code}")
    check("收尾：撤掉过的码扫开仍然是 404（两张都测）",
          client.get(f"/api/shares/{new_token}").status_code == 404
          and client.get(f"/api/shares/{token}").status_code == 404)

    # 涉钱这一笔要闭环：⑥ 给作者结的那 1 分按主键撤掉，再核对台账与奖励回到**进程起点**。
    db.expire_all()
    credit_rows = db.query(Invitation).filter(Invitation.invitee_id == other_id).all()
    credit_ids = [x.id for x in credit_rows]
    for x in credit_rows:
        db.delete(x)
    user_row = db.get(User, user.id)
    user_row.quota_bonus = bonus_start
    db.commit()
    db.expire_all()
    check("收尾：那一笔转存的台账行按记下的主键删净",
          db.query(Invitation).filter(Invitation.id.in_(credit_ids)).count() == 0, f"ids={credit_ids}")
    check("收尾：MIND 台账行数与 deploy-test 的已到奖励都回到进程起点",
          db.query(Invitation).count() == inv_start
          and int(db.get(User, user.id).quota_bonus or 0) == bonus_start,
          f"台账 {inv_start}→{db.query(Invitation).count()} · bonus {bonus_start}→"
          f"{int(db.get(User, user.id).quota_bonus or 0)}")

    db.query(AccountIdentity).filter(AccountIdentity.account_id == other_acct_id).delete(
        synchronize_session=False)
    db.query(Account).filter(Account.id == other_acct_id).delete(synchronize_session=False)
    db.delete(other)
    db.commit()
    db.expire_all()
    check("收尾：临时转存号连它的账号行一并删净（别的账号一行都没碰）",
          db.query(User).filter(User.id == other_id).count() == 0
          and db.query(Account).filter(Account.id == other_acct_id).count() == 0,
          f"user={other_id} account={other_acct_id}")
    check("收尾：真人的行一条都没少（users 只比起点多 0）",
          db.query(User).count() == users_start, f"users {users_start}→{db.query(User).count()}")

    db.expire_all()
    check("收尾：这次标记的笔记一条不留", count_rows() == 0)
    check("收尾：两篇名下都没有孤儿分享行",
          db.query(Share).filter(Share.note_id.in_([copy_id, src_note_id])).count() == 0)
    return finish(client, db, user, MARK)


def finish(client, db, user, mark):
    client.close()
    db.expire_all()
    left = marked(db, user.id)
    check("收尾（失败路径）：标记行已清", left == 0, f"还剩 {left} 条")
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} 条通过")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name} — {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    try:
        code = main()
    except BaseException:
        # 崩在这里不吞：先把栈打出来，再补删这一次的笔记。10-24 那一趟崩在 ⑥ 之前，
        # 现网留下一笔记＋三行分享（一张码还开着），而收尾那句是绿的——因为它只按标题找。
        traceback.print_exc()
        code = 1
    bd = SessionLocal()
    try:
        sweep(bd)
    except Exception as exc:
        print(f"⚠ 补删这一趟没跑成：{type(exc).__name__}: {exc}")
    finally:
        bd.close()
    sys.exit(code)
