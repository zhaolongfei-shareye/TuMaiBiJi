"""额度 / 邀请 / 自助注销的集成探针：起一个真 HTTP 服务，按线上那条建表路径走完全链。

和 pytest 的分工：单元测试用 TestClient + create_all 验"逻辑对不对"，这里验
"三件事凑在一起还成不成立"——库由 alembic 从初始版本升到 head（线上就是这么建的）、
请求真的过一遍网络栈、断言落在 SQL 读数上而不是函数返回值上。篇数这条尤其需要：
2026-09-24 取消了 100 篇上限，"多少条都存得进来"这种断言只有真铺一百二十条才算数。

用法（本地或服务器都行，凭据一律不读）：

    cd backend && .venv/bin/python probes/quota_integration.py [--keep]

它自己建临时库、自己起 uvicorn（127.0.0.1:8123）、自己收尾。全程 SEC_CHECK_ENABLED=false
且 EXTRACT_PROVIDER=none，不发任何出网请求；也不碰现网那个库。退出码 0=全过。

闸门已经拆掉，所以采集那几条只断言"不回 403"：链接入口真出队之后的事属于 worker 链路，
现网部署后另跑。
"""
import argparse
import atexit
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx
import jwt

BACKEND = Path(__file__).resolve().parents[1]
DB_FILE = Path("/tmp/tumaibiji_integration.db")
PORT = 8123
BASE = f"http://127.0.0.1:{PORT}"
SECRET = "integration-only-secret-not-a-real-one"

ENV = dict(
    os.environ,
    DATABASE_URL=f"sqlite:///{DB_FILE}",
    JWT_SECRET_KEY=SECRET,
    EXTRACT_PROVIDER="none",
    HUNYUAN_CF_URL="",
    HUNYUAN_CF_KEY="",
    WECHAT_APP_ID="integration-fake-appid",
    WECHAT_APP_SECRET="integration-fake-secret",
    SEC_CHECK_ENABLED="false",
    REDIS_URL="redis://127.0.0.1:6399",  # 故意指到没开的端口：出队必须失败，才能证明拦在它之前
)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  · {detail}" if detail != "" else ""))


def sql(statement, args=(), fetch=None):
    conn = sqlite3.connect(DB_FILE)
    try:
        cur = conn.execute(statement, args)
        if fetch == "one":
            out = cur.fetchone()
        elif fetch == "all":
            out = cur.fetchall()
        else:
            out = None
        conn.commit()
        return out
    finally:
        conn.close()


def add_user(openid, invited_by=None, generation=1):
    sql(
        "insert into users (openid, language, wallpaper, quota_bonus, invited_by, generation, created_at)"
        " values (?, 'zh', 'default', 0, ?, ?, CURRENT_TIMESTAMP)",
        (openid, invited_by, generation),
    )
    return sql("select id from users where openid=?", (openid,), fetch="one")[0]


def token(uid, generation=1):
    return {
        "Authorization": "Bearer " + jwt.encode(
            {"sub": str(uid), "gen": generation, "exp": int(time.time()) + 3600, "jti": uuid.uuid4().hex},
            SECRET,
            algorithm="HS256",
        )
    }


def count(table, uid):
    return sql(f"select count(*) from {table} where user_id=?", (str(uid),), fetch="one")[0]


def bonus(uid):
    return sql("select quota_bonus from users where id=?", (uid,), fetch="one")[0]


def rewarded(uid):
    return sql("select count(*) from invitations where inviter_id=?", (uid,), fetch="one")[0]


def alembic_head():
    """迁移头版本号让 alembic 自己报。之前写死成一个具体 revision，97ff254 加了新迁移
    之后这条就一直红——而红会被当成"探针坏了"，于是没人再看它。"""
    r = subprocess.run(
        [sys.executable, "-m", "alembic", "heads"],
        cwd=str(BACKEND), env=ENV, capture_output=True, text=True,
    )
    # 输出形如 "b7d2f4a9c316 (head)"，取第一段
    return r.stdout.strip().splitlines()[-1].split()[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="跑完留着临时库和服务进程，便于手查")
    args = ap.parse_args()

    DB_FILE.unlink(missing_ok=True)

    # 限流器活着才叫集成环境：现网有 Redis，这里就得起一个（端口 6399，只服务这一趟，
    # 不落盘）。ENV 里那个 REDIS_URL 故意指到它——之前没起时被打到限流的接口直接 500，
    # 看着像注销坏了，其实是环境缺一块。
    redis = None
    if shutil.which("redis-server"):
        redis = subprocess.Popen(
            ["redis-server", "--port", "6399", "--save", "", "--appendonly", "no", "--daemonize", "no"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        atexit.register(lambda: redis.terminate())
        for _ in range(40):
            probe = subprocess.run(["redis-cli", "-p", "6399", "ping"], capture_output=True, text=True)
            if "PONG" in probe.stdout:
                break
            time.sleep(0.2)
        else:
            print("redis-server 起了但没就绪，限流相关断言会失真")
            return 1
    else:
        print("本机没有 redis-server：带限流的接口会 500，先补上再起（现网是有 Redis 的）")
        return 1
    check("限流用的 Redis 起来了", True, "127.0.0.1:6399")

    # ---- 1. 建表走线上那条路：alembic 从初始版本升到 head，且重复执行是 no-op ----
    for step, target in (("初始版本", "ba59ebc2e110"), ("升到 head", "head"), ("再跑一次", "head")):
        r = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", target],
            cwd=str(BACKEND), env=ENV, capture_output=True, text=True,
        )
        check(f"alembic {step}", r.returncode == 0, (r.stderr.strip().splitlines() or [""])[-1][:90])
    ver = sql("select version_num from alembic_version", fetch="one")[0]
    check("版本号停在 head", ver == alembic_head(), ver)
    cols = {c[1] for c in sql("pragma table_info(users)", fetch="all")}
    tables = {t[0] for t in sql("select name from sqlite_master where type='table'", fetch="all")}
    ddl = sql("select sql from sqlite_master where name='invitations'", fetch="one")[0]
    check("users 两列 + invitations 表都在", {"quota_bonus", "invited_by"} <= cols and "invitations" in tables)
    check("invitee 上是数据库级唯一约束", "UNIQUE (invitee_id)" in ddl.replace("\n", " ").replace("  ", " ") or "UNIQUE (invitee_id)" in ddl, ddl.split("UNIQUE")[-1].strip()[:40])
    check("库里没有别的多余表", tables == {"alembic_version", "users", "notes", "categories", "assets", "jobs", "shares", "invitations"}, sorted(tables))

    # ---- 2. 起服务 ----
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
        cwd=str(BACKEND), env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )
    for _ in range(60):
        try:
            if httpx.get(f"{BASE}/health", timeout=1).status_code == 200:
                break
        except Exception:
            time.sleep(0.5)
    else:
        print("服务没起来，终止")
        proc.kill()
        return 1
    check("服务起来了", True, BASE)

    c = httpx.Client(timeout=20)
    try:
        run_http(c)
    finally:
        c.close()
        if not args.keep:
            proc.terminate()
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
    return finish()


def run_http(c):
    # ---- 3. 邀请链：归因写在库里，台账由"存下第一篇"触发，不再兑换额度 ----
    inviter = add_user("it-inviter")
    invitee = add_user("it-invitee", invited_by=inviter)
    bystander = add_user("it-bystander")
    lonely = add_user("it-lonely")

    q = c.get(f"{BASE}/api/user/quota", headers=token(inviter)).json()
    check("额度接口只回两个数", q == {"used": 0, "categories": 0}, q)

    r = c.post(f"{BASE}/api/notes/", headers=token(invitee), json={"title": "被邀请人的第一篇", "source_type": "manual"})
    check("被邀请人存下第一篇 200", r.status_code == 200, r.status_code)
    check("台账落一行且不再记奖励数", sql("select count(*), coalesce(sum(reward),-1) from invitations where invitee_id=?", (invitee,), fetch="one") == (1, 0))
    check("邀请人额度一动不动（这列已停用）", bonus(inviter) == 0, bonus(inviter))
    q2 = c.get(f"{BASE}/api/user/quota", headers=token(inviter)).json()
    check("接口里没有上限类字段", set(q2) == {"used", "categories"}, q2)

    c.post(f"{BASE}/api/notes/", headers=token(invitee), json={"title": "第二篇", "source_type": "manual"})
    check("第二篇不重复记账", rewarded(inviter) == 1, rewarded(inviter))

    # 邀请多少个都只记账：不再有"最多记 5 次"这种收益上限
    for i in range(2, 9):
        u = add_user(f"it-invitee-{i}", invited_by=inviter)
        c.post(f"{BASE}/api/notes/", headers=token(u), json={"title": f"第{i}个人的第一篇", "source_type": "manual"})
    check("第八个也照样记账（不限笔数）", rewarded(inviter) == 8, rewarded(inviter))
    check("记了八笔也没人涨额度", bonus(inviter) == 0, bonus(inviter))

    # 三种不该记的状态：没归因、自己邀自己、指向不存在的号
    lonely_note = c.post(f"{BASE}/api/notes/", headers=token(lonely), json={"title": "自己写的", "source_type": "manual"})
    # ---- 4. 真 120 篇一路放行（2026-09-24 取消篇数上限）----
    gate = add_user("it-gate")
    ids = []
    for i in range(120):
        rr = c.post(f"{BASE}/api/notes/", headers=token(gate), json={"title": f"第{i+1}篇", "source_type": "manual"})
        if rr.status_code != 200:
            check("铺到 120 篇一路 200", False, f"第 {i+1} 篇 → {rr.status_code} {rr.text[:80]}")
            break
        ids.append(rr.json()["id"])
    else:
        check("铺到 120 篇一路 200", True, f"{len(ids)} 篇")
    qg = c.get(f"{BASE}/api/user/quota", headers=token(gate)).json()
    check("额度读数就是 120", qg["used"] == 120, qg)
    over_resp = c.post(f"{BASE}/api/notes/", headers=token(gate), json={"title": "第121篇", "source_type": "manual"})
    check("第 121 篇照样存得进来", over_resp.status_code == 200, f"{over_resp.status_code} {over_resp.text[:80]}")
    check("库里真的进了 121 篇", count("notes", gate) == 121, count("notes", gate))
    url_resp = c.post(f"{BASE}/api/ingest/url", headers=token(gate), data={"url": "https://example.com/a"})
    check("链接入口不回 403", url_resp.status_code != 403, url_resp.status_code)
    st = c.post(f"{BASE}/api/ingest/screenshots/stage", headers=token(gate),
                files={"images": ("a.png", b"\x89PNG\r\n\x1a\nfake", "image/png")})
    check("截图暂存不回 403", st.status_code != 403, st.status_code)
    pr = c.post(f"{BASE}/api/ingest/screenshots/process", headers=token(gate), data={"batch_id": "nope"})
    check("截图提交不回 403（批次不存在该是 404）", pr.status_code == 404, pr.status_code)
    del_resp = c.delete(f"{BASE}/api/notes/{ids[0]}", headers=token(gate))
    again = c.post(f"{BASE}/api/notes/", headers=token(gate), json={"title": "删完再存一篇", "source_type": "manual"})
    check("删一篇之后仍然存得进来", del_resp.status_code == 200 and again.status_code == 200, (del_resp.status_code, again.status_code))

    # ---- 5. 时间戳口径没被这批改动带坏（今天刚修的时区那条）----
    created = again.json()["created_at"]
    check("created_at 仍带 Z", created.endswith("Z"), created)

    # ---- 6. 分享：建得成、免鉴权读得到 ----
    note_id = again.json()["id"]
    share = c.post(f"{BASE}/api/shares/", headers=token(gate), json={"note_id": note_id})
    token_str = share.json().get("token") if share.status_code == 200 else None
    public = c.get(f"{BASE}/api/shares/{token_str}") if token_str else None
    check("分享创建 + 免鉴权可读", share.status_code == 200 and public is not None and public.status_code == 200, (share.status_code, public and public.status_code))

    # 越权：别人拿不到你的笔记
    check("越权读别人的笔记 404", c.get(f"{BASE}/api/notes/{note_id}", headers=token(bystander)).status_code == 404)

    # ---- 7. 自助注销 ----
    victim = add_user("it-victim", invited_by=inviter)
    follower = add_user("it-follower", invited_by=victim)
    vh = token(victim)
    sql("insert into categories (user_id,name,color,sort_order,created_at) values (?,?,?,0,CURRENT_TIMESTAMP)", (str(victim), "旅行", "#F6C445"))
    cat_id = sql("select id from categories where user_id=? limit 1", (str(victim),), fetch="one")[0]
    for i in range(3):
        c.post(f"{BASE}/api/notes/", headers=vh, json={"title": f"要消失的{i}", "source_type": "manual", "category_id": cat_id})
    vnote = sql("select id from notes where user_id=? limit 1", (str(victim),), fetch="one")[0]
    vshare = c.post(f"{BASE}/api/shares/", headers=vh, json={"note_id": vnote}).json()["token"]
    c.post(f"{BASE}/api/notes/", headers=token(bystander), json={"title": "路人的一条", "source_type": "manual"})

    no_confirm = c.post(f"{BASE}/api/user/deactivate", headers=vh, json={"confirm": False})
    missing = c.post(f"{BASE}/api/user/deactivate", headers=vh, json={})
    anon = c.post(f"{BASE}/api/user/deactivate", json={"confirm": True})
    check("没确认/缺字段/没登录都不动手", (no_confirm.status_code, missing.status_code, anon.status_code) == (400, 422, 401), (no_confirm.status_code, missing.status_code, anon.status_code))
    check("没确认时数据一条没少", count("notes", victim) == 3 and count("categories", victim) == 1)

    resp = c.post(f"{BASE}/api/user/deactivate", headers=vh, json={"confirm": True})
    check("注销 200 且回报真实条数", resp.status_code == 200 and resp.json()["deleted"] == {"notes": 3, "categories": 1, "shares": 1, "jobs": 0, "assets": 0}, resp.json() if resp.status_code == 200 else resp.status_code)
    check("五类数据与账号本身都清空", all(count(t, victim) == 0 for t in ("notes", "categories", "shares", "jobs", "assets")) and sql("select count(*) from users where id=?", (victim,), fetch="one")[0] == 0)
    check("邀请台账两个方向都跟着删", sql("select count(*) from invitations where invitee_id=? or inviter_id=?", (victim, victim), fetch="one")[0] == 0)
    check("别人指向他的归因被清空", sql("select invited_by from users where id=?", (follower,), fetch="one")[0] is None)
    check("注销不动邀请人那一列（已停用）", bonus(inviter) == 0, bonus(inviter))
    check("路人的数据不受影响", count("notes", bystander) == 1 and sql("select count(*) from users where id=?", (bystander,), fetch="one")[0] == 1)
    check("发出去的分享页扫不开", c.get(f"{BASE}/api/shares/{vshare}").status_code == 404)
    codes = {
        "notes": c.get(f"{BASE}/api/notes/", headers=vh).status_code,
        "quota": c.get(f"{BASE}/api/user/quota", headers=vh).status_code,
        "create": c.post(f"{BASE}/api/notes/", headers=vh, json={"title": "x"}).status_code,
        "ingest": c.post(f"{BASE}/api/ingest/url", headers=vh, data={"url": "https://a.b/c"}).status_code,
        "wallpaper": c.put(f"{BASE}/api/user/wallpaper", headers=vh, json={"wallpaper": "default"}).status_code,
        "delete": c.delete(f"{BASE}/api/notes/{vnote}", headers=vh).status_code,
    }
    check("旧 token 打六个端点全 401", set(codes.values()) == {401}, codes)
    body = c.get(f"{BASE}/api/notes/", headers=vh).json()
    detail = body.get("detail", "") if isinstance(body, dict) else str(body)
    check("401 说的是中文（让用户重新进小程序）", "重新登录" in detail, detail)

    # 同一个 openid 重新注册：SQLite 会复用 rowid，所以断的是"底下干净"而不是"号是新的"
    new_id = add_user("it-victim")
    nq = c.get(f"{BASE}/api/user/quota", headers=token(new_id)).json()
    check("同 openid 重注册是个空号", nq == {"used": 0, "categories": 0}, nq)
    check("新号读不到旧笔记", c.get(f"{BASE}/api/notes/{vnote}", headers=token(new_id)).status_code == 404)
    check("新号没带着旧归因", sql("select invited_by from users where id=?", (new_id,), fetch="one")[0] is None)

    # ---- 8. 账号代数：id 被复用之后，旧 token 不能冒充新号 ----
    # 上面那条"同 openid 重注册"是 add_user 直接插的，两个号 generation 都是 1，所以它
    # 测不到这一层。这里按线上真实的样子摆：老号 gen=1 被删，新号拿到同一个 id 但 gen=2。
    reuse_old = add_user("it-reuse-old", generation=1)
    stale_tok = token(reuse_old, generation=1)
    check("代数对得上时 token 可用", c.get(f"{BASE}/api/user/quota", headers=stale_tok).status_code == 200)
    sql("delete from users where id=?", (reuse_old,))
    reuse_new = add_user("it-reuse-new", generation=2)
    check("新号确实复用了同一个 id", reuse_new == reuse_old, f"old={reuse_old} new={reuse_new}")
    stale = c.get(f"{BASE}/api/user/quota", headers=stale_tok)
    check("旧 token 打复用后的 id 被拒 401", stale.status_code == 401, stale.status_code)
    stale_detail = stale.json().get("detail", "") if stale.status_code == 401 else ""
    check("拒的理由是'已失效'（不是'不存在'）", "失效" in stale_detail, stale_detail)
    check("旧 token 连写操作一起被拒", c.post(f"{BASE}/api/notes/", headers=stale_tok, json={"title": "x", "source_type": "manual"}).status_code == 401)
    check("新号自己的 token 照常可用", c.get(f"{BASE}/api/user/quota", headers=token(reuse_new, generation=2)).status_code == 200)
    check("没带 gen 的老格式 token 仍按第 1 代处理", c.get(f"{BASE}/api/user/quota", headers={
        "Authorization": "Bearer " + jwt.encode(
            {"sub": str(reuse_old), "exp": int(time.time()) + 3600, "jti": uuid.uuid4().hex},
            SECRET, algorithm="HS256",
        )
    }).status_code == 401)

    # ---- 9. 反复"注册小号 → 写一篇 → 注销"：台账会清，但谁也不涨额度 ----
    farmer = add_user("it-farmer")
    throwaway = add_user("it-throwaway", invited_by=farmer)
    r = c.post(f"{BASE}/api/notes/", headers=token(throwaway), json={"title": "成就一次", "source_type": "manual"})
    check("小号写下第一篇，台账落一行", r.status_code == 200 and rewarded(farmer) == 1, rewarded(farmer))
    dresp = c.post(f"{BASE}/api/user/deactivate", headers=token(throwaway), json={"confirm": True})
    check("小号注销 200", dresp.status_code == 200, dresp.status_code)
    check("台账跟着清空", rewarded(farmer) == 0, rewarded(farmer))
    check("注销不追回任何东西（没有额度可退）", bonus(farmer) == 0, bonus(farmer))
    throwaway2 = add_user("it-throwaway2", invited_by=farmer)
    c.post(f"{BASE}/api/notes/", headers=token(throwaway2), json={"title": "再来一次", "source_type": "manual"})
    c.post(f"{BASE}/api/user/deactivate", headers=token(throwaway2), json={"confirm": True})
    check("刷两轮之后 farmer 的读数里仍然没有上限字段",
          set(c.get(f"{BASE}/api/user/quota", headers=token(farmer)).json()) == {"used", "categories"})

    # ---- 10. 热启动补报邀请人：已登录的人从分享卡片进来那条路 ----
    late_inviter = add_user("it-late-inviter")
    late = add_user("it-late")
    lr = c.post(f"{BASE}/api/user/inviter", headers=token(late), json={"inviter": late_inviter})
    check("补报邀请人 200 且如实回报已认", lr.status_code == 200 and lr.json()["applied"] is True, lr.text[:80])
    check("归因落到账号上", sql("select invited_by from users where id=?", (late,), fetch="one")[0] == late_inviter)
    c.post(f"{BASE}/api/notes/", headers=token(late), json={"title": "补报之后的第一篇", "source_type": "manual"})
    check("补报过的归因照样记上台账", rewarded(late_inviter) == 1, rewarded(late_inviter))
    again = c.post(f"{BASE}/api/user/inviter", headers=token(late), json={"inviter": bystander})
    check("已有归属时改不动，且如实回报未认", again.status_code == 200 and again.json()["applied"] is False, again.text[:80])
    check("归属没被改写", sql("select invited_by from users where id=?", (late,), fetch="one")[0] == late_inviter)
    self_inv = c.post(f"{BASE}/api/user/inviter", headers=token(late), json={"inviter": late})
    check("自己邀自己不认", self_inv.json()["applied"] is False)
    check("没登录时补报 401", c.post(f"{BASE}/api/user/inviter", json={"inviter": 1}).status_code == 401)
    check("inviter 不是整数时 422", c.post(f"{BASE}/api/user/inviter", headers=token(late), json={"inviter": "abc"}).status_code == 422)


def finish():
    bad = [n for n, ok in results if not ok]
    print(f"\n合计 {len(results)} 条，失败 {len(bad)} 条")
    for n in bad:
        print("  ✗ " + n)
    if DB_FILE.exists() and not os.environ.get("KEEP_IT_DB"):
        DB_FILE.unlink()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
