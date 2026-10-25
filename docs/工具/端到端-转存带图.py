"""现网端到端：转存到底带不带得来图（站长 10-24 拍乙＝真复制一份到自己名下；10-25 随第六十六次上现网，§8.481）。

跑法（在**现网那台机**上跑，因为它要读库里那些行；服务器上没有 `docs/`，所以照 `对账-现网那四目录.py`
那一条老规矩**把这只脚本从标准输入递过去**，不在服务器盘上留第二副本）。
⚠ 这一只的路径是中文，`<` 重定向在 zsh 里会散成乱码（10-16 踩过），所以**先 cp 成 ASCII 名再递**：
    cd /Users/zlfmac/Documents/TuMaiBiJi
    cp "docs/工具/端到端-转存带图.py" /tmp/e2eimg66.py
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - 3 91' < /tmp/e2eimg66.py
默认 `3 91`（最便宜的一趟，只证机制）；他那句「很多笔记，图比文字重要」对应的现实形状是 `9 512000`
（九张、每张压到客户端那把尺子的上限 500 KB）。

它证三件事，逐件给读数，不许互相代：
 ① **库里逐张落账**——副本名下每一行都在、张数／字节／先后／状态都对；
 ② **桶里真多对象**——每一行的地址都与源**不同**（＝真复制，不是共用 fileID），且**从桶里把新对象下载回来、
    md5 与手里那份原字节逐字相同**；⚠ 这一条的通道键名是 `file_list`（写成 `fileid_list` 回 47001，见 §8.481），
    所以"逐字相同"不需要任何人报数；
 ③ **屏上真露图**——公开页匿名读到源那排、转存者自己的 `/assets` 口读到副本那排。

只碰 deploy-test 那一个号 ＋ 一个当场造的临时"别人"。收尾四步一步不许省：笔记走真口删（回体 `file_ids` 并进待删名单）→
临时号连 `invitations`／`account_identities`／`accounts` 按**当场读下来的主键**删 → 桶里对象 `batchdeletefile` →
**逐个复读确认读不到**，最后拿起点那五个总数逐格对账。口令、access_token、fileID 的值都不进打印、不进 argv。
"""
import base64
import hashlib
import io
import json
import sys
import time
import uuid

import httpx
from PIL import Image

from app.core.config import settings
from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.account import Account, AccountIdentity
from app.models.asset import Asset
from app.models.invitation import Invitation
from app.models.note import Note
from app.models.share import Share
from app.models.user import User
from app.services import accounts as accounts_svc
from app.services import generation as generation_svc

ENV = "cloudbase-d6gzh0i0tff02943a"
BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
ONE = int(sys.argv[2]) if len(sys.argv) > 2 else 91
RED = []
RUN = []
# 一趟满跑该有 3N+26 条判据：主链 3N+15 条（每张各三条：进桶／源下载／新对象逐字，加 15 条单发）
# ＋ 收尾 11 条（两篇删笔记、删临时号、删桶、桶侧复查、五个总数、零残留）。
# 下限只钉到 3N+20：满跑少掉 6 条以内不算新红（前置红而提前 return 那些型本来就记红了），
# 而这一版真出过的事故——退分数一抛、把删桶＋复查＋五个对账＋零残留整段带走——少的正好是 8 条。
# 为什么要这个下限：崩在半路那一趟往往一条判据都没跑成，RED 是空的，
# 调用方读到的仍是"红 0 条 · 退出码 0"——这正是 10-25 审计 M21 那枚假绿灯的形状。
MIN_CHECKS = 3 * N + 20


def check(what, ok, detail=""):
    RUN.append(what)
    print("%s %s%s" % ("✓" if ok else "✗", what, (" · " + detail) if detail else ""))
    if not ok:
        RED.append(what)


def wx_api(name, body, tok):
    r = httpx.post("https://api.weixin.qq.com/tcb/%s?access_token=%s" % (name, tok),
                   json=dict(body, env=ENV), timeout=120)
    return r.status_code, r.json()


def dl(fileid, tok):
    """从桶里下真字节。⚠ 键名是 `file_list`，与 `batchdeletefile` 那个 `fileid_list` 不一样。"""
    code, j = wx_api("batchdownloadfile", {"file_list": [{"fileid": fileid, "max_age": 600}]}, tok)
    if j.get("errcode") != 0:
        return None, "errcode=%s %s" % (j.get("errcode"), j.get("errmsg"))
    lst = j.get("file_list") or []
    url = lst[0].get("download_url") if lst else None
    if not url:
        return None, "file_list 里没有下载地址：%s" % json.dumps(lst)[:100]
    got = httpx.get(url, timeout=180).content
    return got, "%d 字节" % len(got)


def counts(db):
    return {"notes": db.query(Note).count(), "users": db.query(User).count(),
            "assets": db.query(Asset).count(), "shares": db.query(Share).count(),
            "invitations": db.query(Invitation).count()}


def main():
    if N > 9 or ONE < 1:
        # 一篇最多 9 张这条上限在绑图那个口上（`MAX_ASSETS_PER_NOTE`），超了它这一趟会红在一半、
        # 还会留下删不净的东西；张数与字节都得是正数才有意义。
        print("张数只能在 1–9 之间（一篇的上限就是 9 张），每张字节要 >0；本次参数：张数=%s 字节=%s" % (N, ONE))
        return 1
    from app.services.wechat import _access_token_sync
    tok = _access_token_sync()
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("找不到 deploy-test，不做任何写操作")
        return 1
    uid = str(user.id)
    hdr = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    client = httpx.Client(base_url=BASE, timeout=180)
    cf_hdr = {"Authorization": "Bearer " + settings.IMAGE_STORE_CF_KEY.strip()}

    start = counts(db)
    bonus_start = int(db.get(User, user.id).quota_bonus or 0)
    print("跑法：%d 张 × %d 字节 · 标记 %s（值不进打印，收尾按它复查）" % (N, ONE, MARK))
    print("起点：", start, "· deploy-test 名下 %d 篇 · bonus %d" % (
        db.query(Note).filter(Note.user_id == uid).count(), bonus_start))

    srcs, copy_ids, note_ids, other_ref = [], [], [], {}
    try:
        for i in range(N):
            buf = io.BytesIO()
            Image.new("RGB", (64, 64), ((i * 53) % 256, (i * 97) % 256, (i * 151) % 256)).save(buf, format="PNG")
            raw = buf.getvalue().ljust(ONE, b"\n")[:ONE]   # 撑到他那把尺子那一档，内容仍逐张不同
            md5 = hashlib.md5(raw).hexdigest()
            t = time.time()
            r = httpx.post(settings.IMAGE_STORE_CF_URL.strip(), headers=cf_hdr,
                           json={"cloud_path": "images/%s/e2eimg66/%s-%d.png" % (uid, MARK, i),
                                 "data": base64.b64encode(raw).decode()}, timeout=180)
            fid = (r.json() or {}).get("fileID") if r.headers.get("content-type", "").startswith("application/json") else None
            check("① 第 %d 张第一型进桶" % (i + 1), bool(fid),
                  "HTTP %s · %dms · 手里 %d 字节 · 函数报 bytes=%s" %
                  (r.status_code, int((time.time() - t) * 1000), len(raw), (r.json() or {}).get("bytes")))
            if not fid:
                print("   回体：", str(r.text)[:180])
                return 1
            srcs.append((raw, md5, fid))
            copy_ids.append(fid)
        for i, (raw, md5, fid) in enumerate(srcs):
            got, note = dl(fid, tok)
            check("① 源第 %d 张下载回来与手里那份逐字相同" % (i + 1),
                  got is not None and hashlib.md5(got).hexdigest() == md5, note)

        r = client.post("/api/notes/", headers=hdr,
                        json={"title": "端到端转存带图%s" % MARK, "summary": "转存带图%s" % MARK})
        note_id = r.json().get("id")
        check("② 建源笔记", r.status_code == 200 and bool(note_id), "HTTP %s · note=%s" % (r.status_code, note_id))
        note_ids.append((note_id, hdr))
        r = client.post("/api/notes/%s/assets" % note_id, headers=hdr,
                        json={"items": [{"file_id": fid, "size": len(raw), "width": 64, "height": 64}
                                         for raw, _, fid in srcs]})
        check("② 登记 %d 张配图" % N, len(r.json() or []) == N, "HTTP %s · 回 %d 行" % (r.status_code, len(r.json() or [])))

        r = client.post("/api/shares/", headers=hdr, json={"note_id": note_id})
        token = r.json().get("token")
        check("③ 建分享", bool(token), "HTTP %s · token 长 %d" % (r.status_code, len(token or "")))
        r = client.get("/api/shares/%s" % token)
        pub = (r.json() or {}).get("assets") or []
        check("③ 公开页匿名读到 %d 排图（屏上那一排现读原篇 assets）" % N,
              r.status_code == 200 and len(pub) == N and all(bool(x.get("cloud_url")) for x in pub),
              "HTTP %s · %d 行" % (r.status_code, len(pub)))

        other = User(openid="e2eimg66-reader-%s" % MARK, language="zh")
        other.generation = generation_svc.allocate(db)
        db.add(other)
        db.commit()
        db.refresh(other)
        acct = accounts_svc.ensure_for_user(db, other)
        db.commit()
        other_ref["user_id"], other_ref["acct_id"] = other.id, acct.id
        hdr2 = {"Authorization": "Bearer " + _create_token(other.id, other.generation)}
        check("④ 临时转存者账号建出来了（收尾删净）", bool(other.id) and bool(acct.id), "user=%s" % other.id)

        r = client.post("/api/notes/from-share", headers=hdr, json={"token": token})
        check("⑤ 作者自己扫自己的码：当场 400（10-24 那一刀）", r.status_code == 400,
              "HTTP %s · 回的是「%s」" % (r.status_code, str(r.json().get("detail"))[:40]))

        t = time.time()
        r = client.post("/api/notes/from-share", headers=hdr2, json={"token": token})
        ms = int((time.time() - t) * 1000)
        copy_note = (r.json() or {}).get("id") if r.status_code == 200 else None
        if copy_note:
            note_ids.append((copy_note, hdr2))
        check("⑥ 别人转存：200 且当场回新笔记（这 %dms 就是他点完那枚按钮要等的段）" % ms,
              r.status_code == 200 and bool(copy_note), "HTTP %s · 新笔记=%s" % (r.status_code, copy_note))

        db.expire_all()
        rows = db.query(Asset).filter(Asset.note_id == copy_note).order_by(Asset.sort_order).all()
        src_fids = [fid for _, _, fid in srcs]
        check("⑥ 库里逐张落账：%d 行都在" % N, len(rows) == N, "%d 行" % len(rows))
        check("⑥ 先后保序（sort_order 递增不重）",
              [x.sort_order for x in rows] == sorted(set(x.sort_order for x in rows)),
              "sort_order=%s" % [x.sort_order for x in rows])
        check("⑥ 真复制：每一行的地址都与源不同", all(x.object_key not in src_fids for x in rows),
              "与源重合 %d 行" % sum(1 for x in rows if x.object_key in src_fids))
        check("⑥ 账上字节＝手里那份真字节", [int(x.file_size or 0) for x in rows] == [len(raw) for raw, _, _ in srcs],
              "行里 %s" % sorted(set(int(x.file_size or 0) for x in rows)))
        check("⑥ 每一行记成 uploaded", all(x.backup_status == "uploaded" for x in rows),
              "状态=%s" % sorted(set(x.backup_status for x in rows)))
        check("⑥ 每一行归属跟着转存者（不是源作者）",
              all(x.user_id == str(other_ref["user_id"]) for x in rows), "%d 行" % len(rows))
        for x in rows:
            copy_ids.append(x.object_key)
        for i, x in enumerate(rows):
            got, note = dl(x.object_key, tok)
            check("⑥ 桶里第 %d 张**新**对象逐字等于源第 %d 张" % (i + 1, i + 1),
                  got is not None and hashlib.md5(got).hexdigest() == srcs[i][1], note)
        r = client.get("/api/notes/%s/assets" % copy_note, headers=hdr2)
        api_rows = r.json() or []
        check("⑥ 转存者自己的配图口读到 %d 行、每行带地址（屏上那一排读的就是这个口）" % N,
              r.status_code == 200 and len(api_rows) == N and all(bool(y.get("cloud_url")) for y in api_rows),
              "HTTP %s · %d 行" % (r.status_code, len(api_rows)))
        q = client.get("/api/user/storage-quota", headers=hdr2).json()
        check("⑥ 转存者名下配额跟着涨", int(q.get("user_count") or 0) == N,
              "user_count=%s · user_bytes=%s" % (q.get("user_count"), q.get("user_bytes")))
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print("⚠ 中途出了没预期的错：%s: %s" % (type(exc).__name__, exc))
        # 崩在半路必须自己记一条红：只打印的话这一趟在调用方眼里仍是"红 0 条 · 退出码 0"，
        # 而那恰好是它最该说话的时刻（10-25 审计 M21）。真跑端到端时没人盯着满屏日志。
        check("整条链崩在半路（%s）" % type(exc).__name__, False, str(exc)[:160])
    finally:
        print("---- 收尾 ----")
        for nid, h in [x for x in note_ids if x[0]]:
            try:
                r = client.delete("/api/notes/%s" % nid, headers=h)
                j = r.json() if isinstance(r.json(), dict) else {}
                for fid in (j.get("file_ids") or []):
                    if fid not in copy_ids:
                        copy_ids.append(fid)
                check("删笔记 %s（真口）" % nid, r.status_code == 200, "回交 %d 个地址" % len(j.get("file_ids") or []))
            except Exception as exc:
                check("删笔记 %s（真口）" % nid, False, str(exc)[:120])
        if other_ref.get("user_id"):
            try:
                db.query(Invitation).filter(Invitation.invitee_id == other_ref["user_id"]).delete(synchronize_session=False)
                n2 = db.query(AccountIdentity).filter(AccountIdentity.account_id == other_ref["acct_id"]).delete(synchronize_session=False)
                db.query(Account).filter(Account.id == other_ref["acct_id"]).delete(synchronize_session=False)
                o = db.get(User, other_ref["user_id"])
                if o:
                    db.delete(o)
                db.commit()
                check("临时转存号连邀请账、账号身份一并删净", True, "identities %d" % n2)
            except Exception as exc:
                check("临时转存号连邀请账、账号身份一并删净", False, str(exc)[:120])
        # 删桶对象排在退分数之前：退分数只动本机那一行账面，删桶动的是共享 5 GB 那口桶。
        # 上一版这两句的次序反了，而它俩都不设防——退分数一抛，桶里那一串新对象就永久没人认领了。
        try:
            for i in range(0, len(copy_ids), 20):
                chunk = copy_ids[i:i + 20]
                code, j = wx_api("batchdeletefile", {"fileid_list": chunk}, tok)
                bad = [x for x in (j.get("file_list") or []) if x.get("status") not in (0, None)]
                check("桶里那 %d 个对象 batchdeletefile" % len(chunk), j.get("errcode") == 0 and not bad,
                      "HTTP %s · errcode=%s · 没删成 %d" % (code, j.get("errcode"), len(bad)))
            alive = [fid for fid in copy_ids if dl(fid, tok)[0] is not None]
            check("收尾复查：桶里还能读到字节的 0 个", not alive, "还剩 %d 个" % len(alive))
        except Exception as exc:
            check("收尾删桶对象与桶侧复查", False, "%s: %s" % (type(exc).__name__, str(exc)[:120]))
        try:
            u = db.get(User, user.id)
            u.quota_bonus = bonus_start
            db.commit()
        except Exception as exc:
            # 包一层是为了后面那五项总数对账：分数回不回得起是账面事，对账才是这一趟唯一的外部证据。
            check("退分数回到起点（bonus %s）" % bonus_start, False, "%s: %s" % (type(exc).__name__, str(exc)[:120]))
        db.expire_all()
        end = counts(db)
        left = db.query(Note).filter(Note.summary.like("转存带图%s%%" % MARK)).count()
        lu = db.query(User).filter(User.openid.like("e2eimg66-reader-%s%%" % MARK)).count()
        bonus_now = int(db.get(User, user.id).quota_bonus or 0)
        print("终点：", end, "· bonus", bonus_now)
        for k in start:
            check("总数回到起点：%s" % k, end[k] == start[k], "%s → %s" % (start[k], end[k]))
        check("零残留：标记笔记 0 · 临时号 0 · bonus 回起点", left == 0 and lu == 0 and bonus_now == bonus_start,
              "笔记 %d · 临时号 %d · bonus %s→%s" % (left, lu, bonus_start, bonus_now))
        client.close()
        db.close()
    # 条数下限这一关放在最后：它认的不是"哪一条红"，而是"这一趟配不配让人读它的红"。
    # 崩在半路或收尾整段被跳过的那一趟，RED 完全可能是空的——那种"红 0 条"必须是红。
    if len(RUN) < MIN_CHECKS:
        check("这一趟跑够了判据（应 ≥ %d 条，实跑 %d 条）" % (MIN_CHECKS, len(RUN)), False,
              "少掉的那几条是崩在半路时被跳过的，这份账单不能当绿灯读")
    print("\n判据 %d 条（下限 %d）· 红 %d 条%s" % (len(RUN), MIN_CHECKS, len(RED),
                                              ("：" + "；".join(RED)) if RED else ""))
    return 1 if RED else 0


if __name__ == "__main__":
    raise SystemExit(main())
