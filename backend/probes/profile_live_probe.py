"""现网探针：名片与亮度档那条链在服务器上真的跑着（2.1 第一条）。

分工与 `card_live_probe` 一样：pytest 证明逻辑对，这里证明**现网跑的就是这份字节**——
这条链的症状恰好是"界面上看着正常，换台手机才发现名片是空的"，不打一次真接口谁都不知道
那张表长没长出来、那两个口通不通。

用法（在服务器上跑，读得到 .env、token 在进程内签，值不出命令行）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/profile_live_probe.py

只用 deploy-test 那一个账号。结尾把它自己写的那一行删掉（**这一条与卡片探针不同**：
名片没有 DELETE 口，界面上"清空名片"就是 PUT 一份空的，所以探针收尾只能直接撤那一行——
它撤的是自己刚建的那一行，且只按 `user_id=deploy-test` 筛）。

fileID 是假的（`cloud://probe-profile-…`）：这台后端删不掉云上真对象，探针也不该真传图，
它验的是"库里那一行、归属那道闸、换下来时回给客户端的那份清单"。真对象那半边由真机验。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from sqlalchemy import text

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.asset import Asset
from app.models.user import User
from app.models.user_profile import UserProfile

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:8]
FID_A = f"cloud://probe-profile-{MARK}/a.jpg"
FID_B = f"cloud://probe-profile-{MARK}/b.jpg"
FID_C = f"cloud://probe-profile-{MARK}/c.jpg"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'✓' if ok else '✗'} {name}" + (f"  · {detail}" if detail else ""))


def slot(fid, card=False, bg=False, **kw):
    return dict({"file_id": fid, "card": card, "bg": bg}, **kw)


def main():
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("✗ 找不到 deploy-test 账号，探针不做任何写操作")
        return 1
    uid = str(user.id)
    hdr = {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}
    client = httpx.Client(base_url=BASE, timeout=30)

    def mine():
        db.expire_all()
        return db.query(UserProfile).filter(UserProfile.user_id == uid).count()

    def getp():
        return client.get("/api/user/profile", headers=hdr)

    def putp(body):
        return client.put("/api/user/profile", json=body, headers=hdr)

    # ---- 0. 地基：迁移真的跑过了，表和那条唯一索引都在 --------------------------------
    head = db.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    check("alembic 头是名片那条（现读，不是推定）", "a9d3e5c7f218" in head, str(head))
    tables = set(db.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).scalars().all())
    check("user_profiles 表在现网库里", "user_profiles" in tables)
    if "user_profiles" not in tables:
        return finish(client)
    cols = {c["name"] for c in db.execute(text("PRAGMA table_info(user_profiles)")).mappings().all()}
    check("五栏齐（user_id/name/slogan/slots/bg_dim）",
          {"user_id", "name", "slogan", "slots", "bg_dim"} <= cols, str(sorted(cols)))
    idx = db.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name='ix_user_profiles_user_id'"
    )).scalar()
    check("「一人一份」那条唯一索引真的建上了", bool(idx) and "UNIQUE" in (idx or "").upper(), str(idx)[:90])
    check("起点干净：这个账号名下零行", mine() == 0, f"{mine()} 行")

    # ---- 1. 没登记过时读的是"全空"，不是 404 ------------------------------------------
    r = getp()
    check("没登记过时 GET 回 200（不是 404：那会把'第一次用'和'读不到'混成一个）",
          r.status_code == 200, f"HTTP {r.status_code}")
    b = r.json() if r.status_code == 200 else {}
    check("回体四栏齐且都是空", b.get("name") is None and b.get("slots") is None
          and b.get("bg_dim") is None and b.get("updated_at") is None, str(b)[:120])

    # ---- 2. 写进去读回一字不差，且只有一行 --------------------------------------------
    r = putp({"name": "探针名片", "slogan": "把图文，提炼成有用的干货", "bg_dim": 2})
    check("PUT 名称/一句话/亮度档（200）", r.status_code == 200, f"HTTP {r.status_code} {r.text[:90]}")
    b = getp().json()
    check("读回与写进去的一字不差", b.get("name") == "探针名片" and b.get("slogan") == "把图文，提炼成有用的干货"
          and b.get("bg_dim") == 2, str(b)[:140])
    check("库里只有一行（一人一份）", mine() == 1, f"{mine()} 行")

    # ---- 3. 补丁语义：只改亮度那一档，名称与一句话一个字都不许动 ------------------------
    r = putp({"bg_dim": 0})
    check("只提交亮度档那一趟（200）", r.status_code == 200, f"HTTP {r.status_code}")
    b = getp().json()
    check("亮度档换成 0 而名称还在（写口是补丁不是整份覆盖）",
          b.get("bg_dim") == 0 and b.get("name") == "探针名片" and b.get("slogan"), str(b)[:140])

    # ---- 3b. 模板那一栏：服务端不抄名单（「不走发版」那条承诺） --------------------------
    r = putp({"tpl": "某套服务端从没见过的模板id"})
    check("一个服务端没见过的模板 id 也收（这里不抄白名单）", r.status_code == 200,
          f"HTTP {r.status_code} {r.text[:80]}")
    check("模板读回一字不差而名称那栏没被动", getp().json().get("tpl") == "某套服务端从没见过的模板id"
          and getp().json().get("name") == "探针名片", str(getp().json())[:120])

    # ---- 4. 四格：补齐、顺序、角色单选 --------------------------------------------------
    r = putp({"slots": [None, slot(FID_A, card=True, bg=True)]})
    b = getp().json()
    s = b.get("slots") or []
    check("存两格读回四格、空位是 null 而不是少一项", len(s) == 4 and s[0] is None
          and s[1] and s[1]["file_id"] == FID_A, str(s)[:150])
    check("角色跟着这一格走（card 与 bg 都在第二格上）",
          bool(s[1]["card"]) and bool(s[1]["bg"]) and not s[0], str(s[1])[:120])
    r = putp({"slots": [slot(FID_A, card=True), slot(FID_B, card=True)]})
    check("两格都勾「卡片」被拒（400）", r.status_code == 400, f"HTTP {r.status_code} {r.text[:80]}")
    r = putp({"slots": [slot("http://not-cloud/x.jpg")]})
    check("非 cloud:// 的地址被拒（400）", r.status_code == 400, f"HTTP {r.status_code} {r.text[:80]}")
    b = getp().json()
    check("两趟被拒之后库里那一格没被动过", (b.get("slots") or [None, {}])[1].get("file_id") == FID_A,
          str(b.get("slots"))[:140])

    # ---- 5. 归属那道闸：别人名下的地址不许挂到自己名片上 --------------------------------
    other = db.query(Asset).filter(Asset.user_id != uid).first()
    if other:
        r = putp({"slots": [slot(other.object_key, card=True)]})
        check("别人配图那一条的地址挂进来被拒（400，不回 500 也不回 403）",
              r.status_code == 400, f"HTTP {r.status_code} {r.text[:80]}")
    else:
        check("别人名下的地址这一趟没法验（现网除 deploy-test 外没有 assets 行）", True, "跳过")

    # ---- 6. 换下来那份清单：键名 file_ids、去重、换回原张不许列它 ------------------------
    r = putp({"slots": [slot(FID_C, card=True, bg=True), None, None, None]})
    body = r.json() if r.status_code == 200 else {}
    check("换格时回体带的是同一个 file_ids 键、里面是旧那张",
          body.get("file_ids") == [FID_A], f"HTTP {r.status_code} {str(body)[:120]}")
    r = putp({"slots": [slot(FID_B, card=True, bg=True), None, None, None]})
    r = putp({"slots": [slot(FID_A, card=True, bg=True), None, None, None]})
    body = r.json() if r.status_code == 200 else {}
    check("换回原来那张时，那张不许被当成「换下的」交回去（否则客户端会删掉正在用的）",
          body.get("file_ids") == [FID_B], str(body)[:120])
    b = getp().json()
    check("换回来之后库里那一格确实是 A", (b.get("slots") or [{}])[0].get("file_id") == FID_A,
          str(b.get("slots"))[:120])

    # ---- 7. 名片那一格不进任何配额口（口径不许被顺手扩） --------------------------------
    q0 = client.get("/api/user/storage-quota", headers=hdr).json()
    putp({"slots": [slot(FID_B, card=True, bg=True), None, None, None]})
    q1 = client.get("/api/user/storage-quota", headers=hdr).json()
    check("登记名片图之后，配图那个配额口一个字都没变（卡片、配图、名片是三笔账）",
          (q1.get("user_count"), q1.get("user_bytes"), q1.get("total_bytes"))
          == (q0.get("user_count"), q0.get("user_bytes"), q0.get("total_bytes")),
          f"{q1.get('user_count')}/{q1.get('user_bytes')} vs {q0.get('user_count')}/{q0.get('user_bytes')}")

    # ---- 8. 没带票读不到、也不许写 ------------------------------------------------------
    r = client.get("/api/user/profile")
    check("没带票读不到那一份（401/403）", r.status_code in (401, 403), f"HTTP {r.status_code}")
    r = client.put("/api/user/profile", json={"name": "没票想写就写"})
    check("没带票写不进去", r.status_code in (401, 403), f"HTTP {r.status_code}")
    check("那一趟没顺手长出第二行", mine() == 1, f"{mine()} 行")

    return finish(client, db, uid)


def finish(client, db=None, uid=None):
    if db is not None:
        # 名片没有 DELETE 口（界面上的"清空"就是 PUT 一份空的），所以探针自己收尾撤那一行。
        n = db.query(UserProfile).filter(UserProfile.user_id == uid).delete()
        db.commit()
        check("收尾：deploy-test 名下那一行已撤", n == 1, f"撤了 {n} 行")
    bad = [n for n, ok, _ in results if not ok]
    print(f"\n现网探针：{len(results) - len(bad)}/{len(results)} 过"
          + (f"，红 {len(bad)} 条：{'、'.join(bad)}" if bad else ""))
    client.close()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
