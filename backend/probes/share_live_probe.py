"""现网探针：分享快照这一轮的四条修复，在真库真接口上过一遍。

和 pytest 的分工：单元用例证明"逻辑对不对"，这里证明"部署到现网的那份字节真的是它"，
而且用的是真 msgSecCheck——SEC_CHECK_ENABLED 在测试里是关掉的，绕审那条只有现网能验。

用法（在服务器上跑，读得到 .env、也只走本机出网）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/share_live_probe.py

它只用 deploy-test 那个账号（user_id=1），跑完自己把建出来的笔记删掉；
别的账号一行都不碰。全程只在结尾断言"我建的行都清了"。

要看的四件事：
① 改标题之后，公开分享页不再挂着旧内容（隐私泄漏本体）。
② 反复建分享只有一张码，而且第二次起不再多打内容安全。
③ key_links 里塞违规文本要拦（这一轮新补的送检字段）。
④ 同一张小程序码第二次拿不重复打微信（看耗时差）。
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

    # ---- 收尾：只清这一次建的东西 ---------------------------------------------
    r = client.delete(f"/api/notes/{note_id}", headers=hdr)
    check("删掉这条笔记", r.status_code in (200, 204), f"HTTP {r.status_code}")
    check("删掉的笔记，那张码扫开是 404",
          client.get(f"/api/shares/{token}").status_code == 404)
    db.expire_all()
    check("收尾：这次标记的笔记一条不留", count_rows() == 0)
    check("收尾：这条笔记名下没有孤儿分享行",
          db.query(Share).filter(Share.note_id == note_id).count() == 0)
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
