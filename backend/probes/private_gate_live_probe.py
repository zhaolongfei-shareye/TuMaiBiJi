"""现网探针：私密这道闸在服务端真的落下了（17c492c 那批 + private-password/reset）。

和 pytest 的分工同 share_live_probe：单元用例证明逻辑对不对，这里证明"现网跑的就是这份字节"。
本地 342 条全绿也挡不住"忘了部署"这一种错——09-30 那次就是这样：客户端已经改成
"没解锁不进编辑器"，而现网还没有闸门，结果编辑私密笔记被自己的守卫弹回去。

用法（在服务器上跑，读得到 .env、token 在进程内签，值不出命令行）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/private_gate_live_probe.py

只用 deploy-test 那一个账号（user_id=1），建出来的分类/笔记/分享结尾全部清掉，
密码那一列最后 reset 回 NULL。别的账号一行都不碰。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.category import Category
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
PIN_A = "135790"
PIN_B = "246801"
PRIVATE_CAT = "私密"
# 五个被裁的字段，与 app/core/private_access.py 的 LOCKED_DROP_DETAIL 一一对应
DROPPED = ("summary", "key_points", "key_links", "content", "original_content")

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
    if user.private_password_hash is not None:
        print("✗ deploy-test 已经设过私密密码，先人工确认再跑（探针会把它 reset 掉）")
        return 1
    token = _create_token(user.id, user.generation)
    hdr = {"Authorization": f"Bearer {token}"}
    client = httpx.Client(base_url=BASE, timeout=30)

    def marked():
        db.expire_all()
        return db.query(Note).filter(Note.user_id == str(user.id),
                                     Note.title.like(f"%{MARK}%")).count()

    check("起点干净：这次标记的笔记一条没有", marked() == 0, f"标记={MARK}")

    # ---- 前置：设密码（那一格私密应当跟着出现）+ 一篇带全五个字段的笔记 --------
    # 09-30 站长真机撞到的就是这一步：密码设完了，界面上既看不到「私密」分类，
    # 写笔记时也选不到——判据是分类名，可全项目没有一处会造出这一格。现在由服务端补。
    cats0 = [c["name"] for c in client.get("/api/categories/", headers=hdr).json()]
    check("起点：这个账号名下本来没有「私密」那一格（否则测不出是不是密码给补上的）",
          PRIVATE_CAT not in cats0, f"本来就有：{cats0}")
    r = client.put("/api/user/private-password", headers=hdr, json={"password": PIN_A})
    check("设上私密密码", r.status_code == 200, f"HTTP {r.status_code}")
    r = client.get("/api/user/private-password", headers=hdr)
    check("状态接口如实报「已设置」", r.json().get("is_set") is True, r.text[:60])

    cats = client.get("/api/categories/", headers=hdr).json()
    cat_id = next((c["id"] for c in cats if c["name"] == PRIVATE_CAT), None)
    check("设完密码，分类接口里就有「私密」那一格了（录入页选得到）",
          cat_id is not None, f"现在是 {[c['name'] for c in cats]}")
    if cat_id is None:
        return finish(client, db, user)
    r = client.put("/api/user/private-password", headers=hdr, json={"password": PIN_B})
    cats2 = [c["name"] for c in client.get("/api/categories/", headers=hdr).json()]
    check("再设一次不会造出第二格", cats2.count(PRIVATE_CAT) == 1, f"{cats2}")
    r = client.put("/api/user/private-password", headers=hdr, json={"password": PIN_A})

    body = {
        "title": f"探针私密{MARK}",
        "summary": f"概要只在解锁后可见{MARK}",
        "key_points": [f"要点甲{MARK}", "要点乙"],
        "key_links": [f"https://example.com/k/{MARK}"],
        "content": f"正文内容{MARK}",
        "original_content": f"原文内容{MARK}",
        "category_id": cat_id,
    }
    r = client.post("/api/notes/", headers=hdr, json=body)
    check("在私密分类下建一条笔记", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    if r.status_code != 200:
        return finish(client, db, user)
    priv_id = r.json()["id"]

    # ---- ① 不带凭证：详情回 200 但五个字段裁空 --------------------------------
    d = client.get(f"/api/notes/{priv_id}", headers=hdr)
    j = d.json()
    check("① 不带凭证打详情：回的是 200 而不是 403（详情页要靠形状判断该弹哪层）",
          d.status_code == 200, f"HTTP {d.status_code}")
    check("① is_private 如实带着", j.get("is_private") is True, str(j.get("is_private")))
    leaked = [k for k in DROPPED if j.get(k) not in (None, [], {}, "")]
    check("① 五个正文字段一个都没漏", not leaked, f"漏了：{leaked}" if leaked else "全空")
    check("① 标题和 id 照旧给（不然列表里这一行会消失）",
          j.get("title") == body["title"] and j.get("id") == priv_id, str(j.get("title")))

    # ---- ② 列表这一路：概要跟着裁 --------------------------------------------
    rows = client.get("/api/notes/", headers=hdr, params={"limit": 100}).json()
    row = next((n for n in rows if n.get("id") == priv_id), None)
    check("② 列表里这一行还在", row is not None)
    check("② 列表里的 summary 也裁掉了（原来这条一直漏着）",
          row is not None and row.get("summary") in (None, ""), f"summary={row and row.get('summary')!r}")
    check("② 整份列表响应里搜不到那句概要", f"概要只在解锁后可见{MARK}" not in str(rows))

    # ---- ③ 锁着的时候只有标题参与搜索 ----------------------------------------
    hit_summary = client.get("/api/notes/", headers=hdr,
                             params={"search": f"概要只在解锁后可见{MARK}", "limit": 100}).json()
    check("③ 拿概要里的词搜不到这一行（搜索不再是正文的旁漏）",
          all(n.get("id") != priv_id for n in hit_summary), f"命中 {len(hit_summary)} 行")
    hit_title = client.get("/api/notes/", headers=hdr,
                           params={"search": f"探针私密{MARK}", "limit": 100}).json()
    check("③ 拿标题搜仍然命中（标题不算正文，列表本来就露着）",
          any(n.get("id") == priv_id for n in hit_title), f"命中 {len(hit_title)} 行")
    # 未分类的 category_id 是 NULL，`NULL NOT IN (…)` 判的是 NULL：漏了显式并 NULL，
    # 普通笔记会在搜索结果里凭空消失。这里造一条普通笔记专门钉这一条。
    r = client.post("/api/notes/", headers=hdr, json={"title": f"探针普通{MARK}",
                                                     "summary": f"公开概要{MARK}"})
    norm_id = r.json().get("id") if r.status_code == 200 else None
    hit_norm = client.get("/api/notes/", headers=hdr,
                          params={"search": f"公开概要{MARK}", "limit": 100}).json()
    check("③ 没有私密分类，普通笔记的搜索不受影响（NULL 那一支没被 and 掉）",
          norm_id is not None and any(n.get("id") == norm_id for n in hit_norm),
          f"命中 {len(hit_norm)} 行")

    # ---- ④ 验密码：错的不发凭证，对的发 --------------------------------------
    r = client.post("/api/user/private-password/verify", headers=hdr, json={"password": "000000"})
    check("④ 密码错 → 403 且响应里没有凭证",
          r.status_code == 403 and "unlock_token" not in r.text, f"HTTP {r.status_code}")
    r = client.post("/api/user/private-password/verify", headers=hdr, json={"password": PIN_A})
    unlock = r.json().get("unlock_token", "") if r.status_code == 200 else ""
    check("④ 密码对 → 拿到服务端签的解锁凭证",
          r.status_code == 200 and bool(unlock), f"HTTP {r.status_code}")

    uh = dict(hdr, **{"X-Private-Token": unlock})
    d = client.get(f"/api/notes/{priv_id}", headers=uh)
    j = d.json()
    check("⑤ 带着凭证打详情：五个字段原样回来",
          all(j.get(k) for k in DROPPED), f"summary={j.get('summary')!r} content={j.get('content')!r}")
    check("⑤ 正文是原文，不是占位", j.get("content") == f"正文内容{MARK}", str(j.get("content")))
    rows = client.get("/api/notes/", headers=uh, params={"limit": 100}).json()
    row = next((n for n in rows if n.get("id") == priv_id), None)
    check("⑤ 带着凭证时列表里的概要也回来了",
          row is not None and row.get("summary") == body["summary"], f"summary={row and row.get('summary')!r}")
    other = client.get("/api/user/quota", headers={"Authorization": f"Bearer {unlock}"})
    check("⑤ 凭证只认这一条链路：拿它当登录 token 打别的接口不成立",
          other.status_code == 401, f"HTTP {other.status_code} {other.text[:60]}")

    # ---- ⑥ 私密笔记开不出分享 ------------------------------------------------
    r = client.post("/api/shares/", headers=uh, json={"note_id": priv_id})
    check("⑥ 私密笔记 POST /api/shares 被服务端拦住",
          r.status_code == 400 and "私密" in r.text, f"HTTP {r.status_code} {r.text[:60]}")

    # ---- ⑦ 一篇已经分享出去的笔记改判私密：旧码当场关掉 ----------------------
    r = client.post("/api/shares/", headers=hdr, json={"note_id": norm_id})
    share_token = r.json().get("token", "")
    check("⑦ 先给普通笔记开一张码", r.status_code == 200 and bool(share_token), f"HTTP {r.status_code}")
    check("⑦ 这张码此刻扫得开", client.get(f"/api/shares/{share_token}").status_code == 200)
    r = client.put(f"/api/notes/{norm_id}", headers=hdr, json={"category_id": cat_id})
    check("⑦ 把它挪进私密分类", r.status_code == 200, f"HTTP {r.status_code} {r.text[:60]}")
    check("⑦ 旧码当场 404（界面上「撤掉分享」那枚对私密笔记不渲染，不关就没有第二个入口）",
          client.get(f"/api/shares/{share_token}").status_code == 404,
          f"HTTP {client.get(f'/api/shares/{share_token}').status_code}")
    db.expire_all()
    check("⑦ 库里这篇名下没有活着的分享行",
          db.query(Share).filter(Share.note_id == norm_id, Share.is_active == True).count() == 0)

    # ---- ⑧ 改密 / 重置：旧凭证当场作废 ----------------------------------------
    r = client.put("/api/user/private-password", headers=hdr, json={"password": PIN_B})
    check("⑧ 换成另一个密码", r.status_code == 200, f"HTTP {r.status_code}")
    d = client.get(f"/api/notes/{priv_id}", headers=uh)
    check("⑧ 旧凭证立刻不顶用：详情又变回裁过的（凭证绑的是旧密码摘要的指纹）",
          d.status_code == 200 and d.json().get("content") is None,
          f"content={d.json().get('content')!r}")
    r = client.post("/api/user/private-password/verify", headers=hdr, json={"password": PIN_A})
    check("⑧ 旧密码验不过（403）", r.status_code == 403, f"HTTP {r.status_code}")
    r = client.post("/api/user/private-password/verify", headers=hdr, json={"password": PIN_B})
    unlock2 = r.json().get("unlock_token", "") if r.status_code == 200 else ""
    check("⑧ 新密码验得过并拿到新凭证", bool(unlock2), f"HTTP {r.status_code}")

    # ---- ⑨ reset 这条接口现在真的在（1.8.1 传了、后端一直没上） --------------
    r = client.post("/api/user/private-password/reset", headers=hdr, json={})
    check("⑨ POST /api/user/private-password/reset 通了（不再是 404/405）",
          r.status_code == 200 and r.json().get("is_set") is False, f"HTTP {r.status_code} {r.text[:60]}")
    d = client.get(f"/api/notes/{priv_id}", headers=dict(hdr, **{"X-Private-Token": unlock2}))
    check("⑨ 重置之后手上那条凭证当场作废（没设过密码的账号不该有有效凭证）",
          d.json().get("content") is None, f"content={d.json().get('content')!r}")
    db.expire_all()
    check("⑨ 密码那一列确实清空了，笔记和分类一个字没动",
          db.get(User, user.id).private_password_hash is None
          and db.get(Note, priv_id) is not None, "hash=NULL 且笔记还在")

    # ---- ⑩ 「私密」那一格不许被静默删掉 --------------------------------------
    # 删分类的通用逻辑会把名下笔记的 category_id 置空——对别的分类那叫取消归类，
    # 对这一格等于把一批笔记静默解锁（判据就是分类名）。
    r = client.delete(f"/api/categories/{cat_id}", headers=hdr)
    check("⑩ 格里还有笔记时删不掉，并且把原因说清楚",
          r.status_code == 400 and "挪走" in r.text, f"HTTP {r.status_code} {r.text[:70]}")
    still = [c["id"] for c in client.get("/api/categories/", headers=hdr).json()
             if c["id"] == cat_id]
    check("⑩ 拦下了那一格就还在", still == [cat_id], f"{still}")
    d2 = client.get(f"/api/notes/{priv_id}", headers=hdr)
    check("⑩ 那篇笔记仍然判为私密（没被这一趟删格动作解掉锁）",
          d2.json().get("is_private") is True, str(d2.json().get("is_private")))

    return finish(client, db, user, cat_id=cat_id)


def finish(client, db, user, cat_id=None):
    auth = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    # 不管前面走到哪一步红了，密码这一列都要抹回去：deploy-test 留着私密密码，
    # 下一次跑探针会在入口直接拒绝，看起来像"探针坏了"而不是"上一次没收尾"。
    client.post("/api/user/private-password/reset", headers=auth, json={})
    ids = [n.id for n in db.query(Note).filter(Note.user_id == str(user.id),
                                               Note.title.like(f"%{MARK}%")).all()]
    for i in ids:
        client.delete(f"/api/notes/{i}", headers=auth)
    db.expire_all()
    left = db.query(Note).filter(Note.user_id == str(user.id), Note.title.like(f"%{MARK}%")).count()
    check("收尾：标记的笔记一条不留", left == 0, f"还剩 {left} 条")
    if cat_id:
        # 上面那条"格里有笔记删不掉"的闸此时已经放行——标记的笔记刚被清完，这一格是空的。
        # 顺手也证了一次：空的一格照旧删得掉，那道闸没有把人锁死。
        dr = client.delete(f"/api/categories/{cat_id}", headers=auth)
        db.expire_all()
        check("收尾：探针那格私密分类删掉了（现网不该留一个空的）",
              dr.status_code == 200
              and db.query(Category).filter(Category.id == cat_id).count() == 0,
              f"HTTP {dr.status_code} {dr.text[:60]}")
    db.expire_all()
    u = db.get(User, user.id)
    check("收尾：deploy-test 的私密密码回到未设置", u.private_password_hash is None)
    check("收尾：探针名下没有孤儿分享行",
          db.query(Share).filter(Share.note_id.in_(ids or [0])).count() == 0)
    client.close()
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} 条通过")
    for name, ok, detail in results:
        if not ok:
            print(f"  ✗ {name} — {detail}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
