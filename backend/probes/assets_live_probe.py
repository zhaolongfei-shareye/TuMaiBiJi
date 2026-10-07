"""现网探针：图片第一次真的能跟着笔记留下来（2.0 那条 assets 链路）。

和 pytest 的分工同 private_gate_live_probe：459 条用例证明逻辑对不对，这里证明
**现网跑的就是这份字节**。这次尤其要跑：部署前那三个口是 404，部署后光是 200 还不够——
"接口在但配额算错"和"图能绑上但公开页看不见"这两类错，只有真打一次才看得见。

用法（在服务器上跑，读得到 .env、token 在进程内签，值不出命令行）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/assets_live_probe.py

只用 deploy-test 那一个账号（users.id=1）。名下的笔记、分享、assets 行结尾全部清掉，
最后回到"探针开始前那个数"。别人名下的行只读一次 id（用来验归属那道闸），一行都不碰。

fileID 是**假的**（`cloud://probe-…`）：这台后端删不掉云上的真对象，探针也不该去真传一张图，
它验的是"库里的归属、配额的口径、公开页露不露、删笔记时报给客户端的那份清单"。
真对象那半边由客户端真机那条链验（预览码）。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.asset import Asset
from app.models.note import Note
from app.models.share import Share
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
CAP = 9  # 与 app/models/asset.py 的 MAX_ASSETS_PER_NOTE 同值，这里现读靠那条超封顶判据兜住
SIZES = [120000, 340000, 700]
KEYS = [f"cloud://probe-{MARK}/img{i}-{s}.jpg" for i, s in enumerate(SIZES)]
# 补到满 9 张那六条（§9.5 用）。放在这里是因为 §10 收尾要拿"三 + 六"这一整份去比对回体，
# 中途红一次也不该留个没登记的键在库里没人记得。
FULL = [f"cloud://probe-{MARK}/full{i}.jpg" for i in range(6)]

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
    token = _create_token(user.id, user.generation)
    hdr = {"Authorization": f"Bearer {token}"}
    client = httpx.Client(base_url=BASE, timeout=30)

    def mine():
        db.expire_all()
        return db.query(Asset).filter(Asset.user_id == uid).count()

    def quota():
        r = client.get("/api/user/storage-quota", headers=hdr)
        return r

    # ---- 0. 起点 ----------------------------------------------------------------
    base_rows = mine()
    q0 = quota()
    check("配额口在（部署前这个口是 404）", q0.status_code == 200, f"HTTP {q0.status_code}")
    if q0.status_code != 200:
        return finish(client, db, user, None, base_rows)
    j0 = q0.json()
    check("回体六个字段一个不缺",
          set(j0) == {"user_bytes", "total_bytes", "cap_bytes", "used_ratio",
                      "user_count", "total_count"},
          f"实际 {sorted(j0)}")
    check("起点干净：这个账号名下没有遗留的配图行（上一次没收尾就别接着算）",
          base_rows == 0, f"库里有 {base_rows} 行，配额口报 user_count={j0['user_count']}")
    check("起点：配额口数的就是这张表（接口与库两个读数必须一致）",
          j0["user_count"] == base_rows, f"接口 {j0['user_count']} vs 库 {base_rows}")
    foreign = db.query(Note.id).filter(Note.user_id != uid).limit(1).scalar()

    # ---- 1. 建一篇笔记（走接口，不手插行）---------------------------------------
    r = client.post("/api/notes/", headers=hdr, json={
        "title": f"探针存图{MARK}",
        "summary": f"探针摘要{MARK}",
        "content": f"探针正文{MARK}",
    })
    check("建出这篇探针笔记", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    if r.status_code != 200:
        return finish(client, db, user, None, base_rows)
    note_id = r.json()["id"]

    # ---- 2. 绑三张 --------------------------------------------------------------
    items = [{"file_id": k, "size": s, "width": 1080, "height": 1440} for k, s in zip(KEYS, SIZES)]
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr, json={"items": items})
    rows = r.json() if r.status_code == 200 else []
    check("绑上三张（200 且回三行）", r.status_code == 200 and len(rows) == 3,
          f"HTTP {r.status_code} {r.text[:80]}")
    check("回体里 cloud_url 就是送进去那个 fileID（没被改写、没换成临时链接）",
          [x.get("cloud_url") for x in rows] == KEYS or
          {x.get("cloud_url") for x in rows} == set(KEYS),
          str([x.get("cloud_url") for x in rows])[:120])
    check("每行都带 id（客户端补绑要靠它）",
          all(isinstance(x.get("id"), int) for x in rows), str(rows)[:80])

    # ---- 3. 读回来：张数 + 顺序 --------------------------------------------------
    r = client.get(f"/api/notes/{note_id}/assets", headers=hdr)
    got = r.json()
    check("读一篇：三张都在", r.status_code == 200 and len(got) == 3, f"HTTP {r.status_code} {got}")
    check("读一篇：按绑定的先后排（详情页缩略图靠这个顺序和 9 张上限对齐）",
          [x["cloud_url"] for x in got] == [x["cloud_url"] for x in rows],
          str([x["cloud_url"] for x in got])[:120])
    check("读一篇：size/宽高原样回来（配额与裁切都吃这几个数）",
          all(g["size"] == s for g, s in zip(got, SIZES))
          and all(g["width"] == 1080 and g["height"] == 1440 for g in got),
          str([(g["size"], g["width"], g["height"]) for g in got]))

    # ---- 4. 幂等：同三条再绑一次 --------------------------------------------------
    q_before = quota().json()
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr, json={"items": items})
    q_after = quota().json()
    check("重复绑同一批不会多出行（补绑那条路每天都走）",
          r.status_code == 200 and len(client.get(f"/api/notes/{note_id}/assets", headers=hdr).json()) == 3,
          f"HTTP {r.status_code}")
    check("重复绑之后配额一格没动",
          (q_before["user_count"], q_before["user_bytes"]) == (q_after["user_count"], q_after["user_bytes"]),
          f"{q_before['user_count']}/{q_before['user_bytes']} → {q_after['user_count']}/{q_after['user_bytes']}")

    # ---- 5. 脏数据一律拦在门口，不静默丢 ------------------------------------------
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr,
                    json={"items": [{"file_id": "cloud://", "size": 1}]})
    check("光杆 `cloud://` 被拦（400）：那是一条指向空的地址，存进去前端只会拿到看不懂的错",
          r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr,
                    json={"items": [{"file_id": f"cloud://probe-{MARK}/有 空格.jpg", "size": 1}]})
    check("地址里带空格被拦（400）", r.status_code == 400, f"HTTP {r.status_code}")
    check("那两次脏请求一行都没写进去",
          len(client.get(f"/api/notes/{note_id}/assets", headers=hdr).json()) == 3)

    # ---- 6. 张数只卡一处：绑到第 10 张要拦，且不许部分写入 ------------------------
    extra = [{"file_id": f"cloud://probe-{MARK}/x{i}.jpg", "size": 1} for i in range(CAP + 1 - len(KEYS))]
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr, json={"items": extra})
    still = len(client.get(f"/api/notes/{note_id}/assets", headers=hdr).json())
    check(f"第 {CAP + 1} 张被拦（400）", r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")
    check("拦下来是一行都不写（不是写了一半再报错）", still == 3, f"库里还是 {still} 行")

    # ---- 7. 配额口径：算得进我这篇、也算得进全站 -----------------------------------
    q = quota().json()
    check("我的用量 == 这三张的字节之和",
          q["user_bytes"] == sum(SIZES) and q["user_count"] == 3,
          f"user_bytes={q['user_bytes']} 应为 {sum(SIZES)}，user_count={q['user_count']}")
    check("全站 >= 我的（这一格不是只数我自己）",
          q["total_bytes"] >= q["user_bytes"] and q["total_count"] >= q["user_count"],
          f"total={q['total_bytes']}/{q['total_count']}")
    check("未绑定的行也计入配额（对象已经占空间），但 ratio 落在 0~1",
          0 <= q["used_ratio"] <= 1 and q["cap_bytes"] > 0,
          f"ratio={q['used_ratio']} cap={q['cap_bytes']}")
    db.expire_all()
    check("库里这几行的 user_id 是我（不是笔记作者的 id 混了）",
          db.query(Asset).filter(Asset.note_id == note_id, Asset.user_id == uid).count() == 3)

    # ---- 8. 归属那道闸：别人的笔记，"不存在"与"不是你的"回同一个 404 ---------------
    if foreign:
        r = client.get(f"/api/notes/{foreign}/assets", headers=hdr)
        check(f"读别人那篇的配图 → 404（不是 403，不给探测器）",
              r.status_code == 404, f"HTTP {r.status_code} note_id={foreign}")
        r = client.post(f"/api/notes/{foreign}/assets", headers=hdr,
                        json={"items": [{"file_id": f"cloud://probe-{MARK}/偷.jpg", "size": 1}]})
        check(f"往别人那篇绑图 → 404", r.status_code == 404, f"HTTP {r.status_code}")
        db.expire_all()
        check("而且确实一行没落",
              db.query(Asset).filter(Asset.note_id == foreign).count() == 0)
    else:
        check("库里没有别人的笔记，这道闸今天验不了", False, "foreign=None")

    # ---- 9. 公开页露图（shares 表没有这一列，是读的那一刻现查的）-------------------
    r = client.post("/api/shares/", headers=hdr, json={"note_id": note_id, "author_name": f"探针{MARK}"})
    check("给这篇建一张分享码", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    if r.status_code == 200:
        tk = r.json()["token"]
        pub = httpx.get(f"{BASE}/api/shares/{tk}", timeout=30)
        pa = pub.json().get("assets") if pub.status_code == 200 else None
        check("匿名（不带 token）打公开页：三张图露得出来",
              pub.status_code == 200 and isinstance(pa, list) and len(pa) == 3,
              f"HTTP {pub.status_code} assets={str(pa)[:120]}")
        check("公开页只给一个能画出来的地址：id/size/user_id 都不从这一口出去",
              isinstance(pa, list) and all(set(x) == {"cloud_url"} for x in pa),
              str(pa)[:120])
        # 撤回这道门对图同样有效（方案 §3.1.7 那条口径的现网版）
        rc = client.post("/api/shares/revoke", headers=hdr, json={"note_id": note_id})
        pub2 = httpx.get(f"{BASE}/api/shares/{tk}", timeout=30)
        check("撤掉分享之后公开页整页读不到（图跟着一起收回来）",
              rc.status_code == 200 and pub2.status_code == 404,
              f"revoke={rc.status_code} 再读公开页={pub2.status_code}")

    # ---- 9.5 满 9 这一档现网真收得下（§6 只证了"第 10 条被拦"，边界另一侧一直没钉）----
    # 为什么单独跑这一趟：客户端一次 bind 最多送 9 条，而"一篇最多 9 张"这句在现网要是
    # 判成 8，症状是用户传九张只留八张、接口回 400 被 B 链咽掉（失败不阻断存笔记），
    # 谁都不会知道。上一轮只钉了上界那一侧（第 10 条拦下），这一条钉"第 9 条放过"。
    six = [{"file_id": k, "size": 1000 + i, "width": 1080, "height": 1440} for i, k in enumerate(FULL)]
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr, json={"items": six})
    got9 = client.get(f"/api/notes/{note_id}/assets", headers=hdr).json()
    check("补到满 9 张：接口收（200），库里就是 9 行",
          r.status_code == 200 and len(got9) == CAP,
          f"HTTP {r.status_code} 库里 {len(got9)} 行")
    check("九张的顺序就是绑定的先后（详情页那排缩略图与看大图那页码都吃这个顺序）",
          [x["cloud_url"] for x in got9] == KEYS + FULL, str([x["cloud_url"] for x in got9])[:120])
    q9 = quota().json()
    check("配额跟着算成 9 张、字节是三张之和加这六张",
          q9["user_count"] == CAP and q9["user_bytes"] == sum(SIZES) + sum(x["size"] for x in six),
          f"{q9['user_count']} 张 / {q9['user_bytes']} B")
    r = client.post(f"/api/notes/{note_id}/assets", headers=hdr,
                    json={"items": [{"file_id": f"cloud://probe-{MARK}/第十张.jpg", "size": 1}]})
    still9 = len(client.get(f"/api/notes/{note_id}/assets", headers=hdr).json())
    check("第十张仍被拦（400），库里还是 9 行（不是先写进去再报错）",
          r.status_code == 400 and still9 == CAP, f"HTTP {r.status_code} 库里 {still9} 行")

    # ---- 10. 删笔记：行归零，那份 fileID 清单必须回给客户端 ------------------------
    r = client.delete(f"/api/notes/{note_id}", headers=hdr)
    body = r.json() if r.status_code == 200 else {}
    check("删掉这篇（200）", r.status_code == 200, f"HTTP {r.status_code} {r.text[:80]}")
    check("回体里 file_ids 是这九个对象（这台后端删不掉云上的东西，清单是客户端唯一的出处）",
          set(body.get("file_ids") or []) == set(KEYS + FULL), str(body.get("file_ids"))[:140])
    q_end = quota().json()
    check("删完之后我的配额回到基线",
          (q_end["user_count"], q_end["user_bytes"]) == (j0["user_count"], j0["user_bytes"]),
          f"{q_end['user_count']}/{q_end['user_bytes']} vs 基线 {j0['user_count']}/{j0['user_bytes']}")
    check("全站字节数也回到基线（没给别人留下幽灵行）",
          q_end["total_bytes"] == j0["total_bytes"],
          f"total_bytes={q_end['total_bytes']} vs 基线 {j0['total_bytes']}")

    return finish(client, db, user, j0, base_rows)


def finish(client, db, user, q0, base_rows=0):
    """不管前面红到哪一步，收尾都要把探针名下那三样抹干净。"""
    uid = str(user.id)
    auth = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    ids = [n.id for n in db.query(Note).filter(Note.user_id == uid,
                                               Note.title.like(f"%{MARK}%")).all()]
    for i in ids:
        client.delete(f"/api/notes/{i}", headers=auth)
    db.expire_all()
    left_note = db.query(Note).filter(Note.user_id == uid, Note.title.like(f"%{MARK}%")).count()
    left_asset = db.query(Asset).filter(Asset.user_id == uid).count()
    left_share = db.query(Share).filter(Share.note_id.in_(ids or [0])).count()
    check("收尾：探针笔记一条不留", left_note == 0, f"还剩 {left_note}")
    check("收尾：探针配图行一条不留（删笔记那句 delete 真的在跑）",
          left_asset == base_rows, f"还剩 {left_asset}，起点 {base_rows}")
    check("收尾：探针名下没有孤儿分享行", left_share == 0, f"还剩 {left_share}")
    if q0:
        q = client.get("/api/user/storage-quota", headers=auth).json()
        check("收尾：配额数字回到开始前的值",
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
