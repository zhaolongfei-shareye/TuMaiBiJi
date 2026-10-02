"""现网探针：列表那两样派生值真的从 https 那条路上发出来了（10-02 这批）。

和 pytest 的分工：单元用例证"逻辑对不对"，这一支证"部署到现网的那份字节真的是它"——
少传一个文件、重启错一个 unit，pytest 全绿也照样是旧行为（这条记录在案过不止一次）。

用法（服务器上跑，**必须先 cd 到项目目录**：家目录那份 .env 是另一个项目的）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/list_share_marks_live_probe.py

只用 deploy-test（users.id=1）名下**已经存在**的那三篇笔记，不建新笔记；
第②组会临时建一张真码、第③组当场撤掉，收尾断言回到起点。别的账号一行都不碰。

要看的四件事：
① 列表里每一行都带这两键，且 `has_active_share` 与库里 `is_active=1` 的行逐篇对得上
   （拿库当另一只眼，不让接口自己证明自己）。
② 码上带昵称的那一篇，列表里读出来的就是那个昵称。
③ 撤掉之后当场灭——它读的是状态量，不是"曾经分享过"。
④ 详情那条路由**不发**这两键：两处各发一份真相，早晚会出现"列表说已分享、详情说没有"。
"""
import sys
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
MARK = uuid.uuid4().hex[:6]
SIGN = f"探针署名{MARK}"

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

    mine = {n.id: n.title for n in db.query(Note).filter(Note.user_id == str(user.id)).all()}
    if not mine:
        print("✗ deploy-test 名下一篇笔记都没有，探针不现造数据")
        return 1

    def live_ids():
        db.expire_all()
        return {r[0] for r in db.query(Share.note_id).filter(
            Share.note_id.in_(list(mine)), Share.is_active == True).all()}  # noqa: E712

    def listing():
        r = client.get("/api/notes/", params={"limit": 50}, headers=hdr)
        assert r.status_code == 200, f"列表 HTTP {r.status_code} {r.text[:120]}"
        return {x["id"]: x for x in r.json() if x["id"] in mine}

    # ---- ① 每一行都带这两键，且和库里 is_active 逐篇对得上 --------------------
    base_live = live_ids()
    rows = listing()
    check("① 列表里 deploy-test 那几篇一行不少", set(rows) == set(mine),
          f"接口 {sorted(rows)} / 库 {sorted(mine)}")
    check("① 每一行都带着这两键", all("has_active_share" in x and "share_author_name" in x
                                    for x in rows.values()))
    mismatch = {i: (rows[i].get("has_active_share"), i in base_live)
                for i in rows if bool(rows[i].get("has_active_share")) != (i in base_live)}
    check("① has_active_share 与库里 is_active=1 的行逐篇一致", not mismatch,
          f"起点活码 {sorted(base_live)}；不一致 {mismatch}")

    # ---- ② 建一张带昵称的码，列表里就该读出那个昵称 --------------------------
    target = next((i for i in mine if i not in base_live), None)
    if target is None:
        check("② 找一篇当下没开码的笔记", False, "deploy-test 名下每篇都有活码，换一篇再跑")
        return finish(client, hdr, db)
    r = client.post("/api/shares/", headers=hdr,
                    json={"note_id": target, "author_name": SIGN})
    ok2 = r.status_code == 200
    check("② 建分享（昵称一起递上去）", ok2, f"HTTP {r.status_code} {r.text[:100]}")
    if ok2:
        row = listing().get(target, {})
        check("② 列表里那一篇亮起来了", row.get("has_active_share") is True,
              f"笔记 {target} → {row.get('has_active_share')}")
        check("② 昵称取的就是码上那一份", row.get("share_author_name") == SIGN,
              repr(row.get("share_author_name")))
        # ---- ③ 撤掉，当场灭 --------------------------------------------------
        rv = client.post("/api/shares/revoke", headers=hdr, json={"note_id": target})
        check("③ 撤回接口收下了", rv.status_code == 200 and rv.json().get("closed", 0) >= 1,
              rv.text[:100])
        row = listing().get(target, {})
        check("③ 撤完列表当场跟着灭", row.get("has_active_share") is False,
              f"笔记 {target} → {row.get('has_active_share')}")
        check("③ 码都撤了，那份昵称也不该再挂着", not row.get("share_author_name"),
              repr(row.get("share_author_name")))
    else:
        print("!! ②③ 没跑成：建分享被拦（多半是内容安全那道闸），这两组记未验，"
              "昵称那一条由 backend/tests/test_list_share_marks.py 守着")

    # ---- ④ 详情那条路由不发这两键 --------------------------------------------
    d = client.get(f"/api/notes/{target}", headers=hdr)
    check("④ 详情响应里没有这两键", d.status_code == 200
          and "has_active_share" not in d.json() and "share_author_name" not in d.json(),
          f"HTTP {d.status_code}，键 {[k for k in d.json() if 'share' in k]}")

    return finish(client, hdr, db)


def finish(client, hdr, db):
    """收尾：回到起点，别留一张**开着**的探针码。"""
    db.expire_all()
    open_ones = {r[0] for r in db.query(Share.note_id).filter(
        Share.author_name == SIGN, Share.is_active == True).all()}  # noqa: E712
    # 撤回是"关而不删"（token 留着事后对账），所以这里判的是开没开，不是行还在不在。
    archived = db.query(Share).filter(Share.author_name == SIGN).count()
    check("收尾：探针那张码不再对外", not open_ones, f"还开着的 {open_ones}")
    check("收尾：留档那几行确实还在（关而不删这条语义没被顺手改掉）", archived >= 1,
          f"署名探针的行 {archived} 条")
    bad = client.get("/api/notes/", params={"limit": 50}, headers=None)
    check("收尾：免鉴权打列表仍然 401（没把这道门碰开）", bad.status_code == 401,
          f"HTTP {bad.status_code}")
    n = sum(1 for _, ok, _ in results if ok)
    print(f"\n{'✗ ' + str(len(results) - n) + ' 条不过' if n != len(results) else ''}"
          f"现网探针（列表分享标记）：{n}/{len(results)} 过")
    return 0 if n == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
