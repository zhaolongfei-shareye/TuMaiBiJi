#!/usr/bin/env python3
"""口令登录那条链的现网探针（11-13「去搞登录吧，免费的技术方案」）。

跑法：cd backend && env -u NO_PROXY -u no_proxy .venv/bin/python probes/password_live_probe.py
（`-u NO_PROXY` 不是可选的：本机 NO_PROXY 里那两条回环会让 httpx 当场抛 InvalidURL，
 那是环境红不是链路红，见 memory 里 local-dns-fake-ip-proxy 那一格。）

它量的是**现网真后端**，不是本机测试库。十三格逐条对应站长要的那件事："换设备登录还能看到我的笔记"。

收尾纪律（探针残留那一条）：造出来的两个账号在 finally 里都走 `/api/user/deactivate` 真删，
删完再读一次确认 401。半路崩了也会走到 finally；真删不掉会把话说出来，不许报绿。

限流账（按 IP，跑一趟用掉的额度）：register 2/3 每小时、password-login 6/10 每分钟、
recover 1/5、change-password 1/5、upgrade 1/5。**一小时内别连跑两趟**，第二趟 register 会 429。
"""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = "https://api.agentsbin.cn/wtsj"
PASS = 0
FAIL = 0
LINES = []


def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def _titles(r):
    """列表口回的是裸数组（`response_model=List[NoteListItem]`），不是 {items:[...]}。
    两种都收：这一枚以前写成 `(r or {}).get(...)`，裸数组当场 AttributeError，
    探针崩在半路 ⇒ 造出来的账号留在现网没人删（第一轮真撞过）。"""
    if isinstance(r, list):
        return [n.get("title") for n in r]
    if isinstance(r, dict):
        return [n.get("title") for n in r.get("items", [])]
    return []


def ok(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        line = f"  ✓ {name}"
    else:
        FAIL += 1
        line = f"  ✗ {name}  {detail}"
    print(line, flush=True)
    LINES.append(line)


def main():
    tag = uuid.uuid4().hex[:10]
    login = f"probe-{tag}@example.com"
    pw = "probe-pass-" + tag
    pw2 = "probe-new-" + tag
    dev = "probe-dev-" + uuid.uuid4().hex
    made = []          # [(token, 说明)]，收尾按这个名单真删

    print(f"=== 口令登录现网探针 tag={tag} ===", flush=True)
    try:
        # ① 注册：回体必须带恢复码（库里只留 HMAC，这是唯一一次下发）
        s, r = call("POST", "/v1/auth/register", {"login": login, "password": pw})
        ok("① 注册 200", s == 200, f"{s} {r}")
        if s != 200:
            return
        tok = r["token"]
        code = r.get("recovery_code")
        made.append([tok, "注册号"])
        ok("① 回体带恢复码 16 位四段", bool(code) and len(code) == 19 and code.count("-") == 3, code)
        ok("① 回体 login 与填的一致", r.get("login") == login, r.get("login"))

        # ② legacy token 开得了 H5 那两扇门（这是"H5 能用口令登录"的地基）
        s, r = call("GET", "/v1/auth/session", token=tok)
        ok("② /v1/auth/session 200 且 providers 含 password",
           s == 200 and "password" in (r or {}).get("providers", []), f"{s} {r}")
        acct = (r or {}).get("account_id")
        s, _ = call("GET", "/api/user/profile", token=tok)
        ok("② legacy token 开 /api/user/profile", s == 200, s)

        # ③ 造一篇笔记，后面每一趟换票都要读回它
        title = "探针笔记-" + tag
        s, r = call("POST", "/api/notes/", {"title": title, "content": "探针正文"}, token=tok)
        ok("③ 建笔记 200", s in (200, 201), f"{s} {r}")
        s, r = call("GET", "/api/notes/", token=tok)
        titles = _titles(r)
        ok("③ 列表读得回那一篇", title in titles, titles)

        # ④ 密码错：一句话，不许透露"这个号存在"
        s, r = call("POST", "/v1/auth/password-login", {"login": login, "password": pw + "x"})
        ok("④ 错密码 400「登录名或密码不对」",
           s == 400 and (r or {}).get("detail") == "登录名或密码不对", f"{s} {r}")
        s2, r2 = call("POST", "/v1/auth/password-login", {"login": "nobody-" + tag + "@example.com", "password": pw})
        ok("④ 不存在的号回同一句话", s2 == 400 and (r2 or {}).get("detail") == (r or {}).get("detail"), f"{s2} {r2}")

        # ⑤ 正确登录：换一枚票，笔记还在；这一趟**不再**下发恢复码
        s, r = call("POST", "/v1/auth/password-login", {"login": login, "password": pw})
        ok("⑤ 登录 200", s == 200, f"{s} {r}")
        tok2 = (r or {}).get("token")
        ok("⑤ 登录那趟 recovery_code 为 null", (r or {}).get("recovery_code") is None, r)
        s, r = call("GET", "/api/notes/", token=tok2)
        titles = _titles(r)
        ok("⑤ 换票后笔记还在", title in titles, titles)

        # ⑥ 游客升级：另开一个设备游客号，给它设口令 ⇒ 必须是**同一个** account 逻辑（不新建人）
        s, r = call("POST", "/v1/auth/guest", {"device_id": dev})
        ok("⑥ 设备游客号 200", s == 200, f"{s} {r}")
        gtok = (r or {}).get("token")
        gi = len(made)
        made.append([gtok, "游客号"])
        gtitle = "游客升级前-" + tag
        call("POST", "/api/notes/", {"title": gtitle, "content": "升级前正文"}, token=gtok)
        s, r = call("GET", "/v1/auth/session", token=gtok)
        gacct = (r or {}).get("account_id")
        ok("⑥ 游客那趟 providers 不含 password",
           s == 200 and "password" not in (r or {}).get("providers", []), f"{s} {r}")
        glogin = f"probe-g-{tag}@example.com"
        s, r = call("POST", "/v1/auth/upgrade", {"login": glogin, "password": pw}, token=gtok)
        ok("⑥ 升级 200 且带恢复码", s == 200 and bool((r or {}).get("recovery_code")), f"{s} {r}")
        utok = (r or {}).get("token") or gtok
        made[gi][0] = utok
        s, r = call("GET", "/v1/auth/session", token=utok)
        ok("⑥ 升级后 account 没换人", (r or {}).get("account_id") == gacct, f"{gacct} → {(r or {}).get('account_id')}")
        s, r = call("GET", "/api/notes/", token=utok)
        titles = _titles(r)
        ok("⑥ 升级前那篇笔记没丢", gtitle in titles, titles)
        # 换设备：拿口令重新登一次，读到的还是那一篇
        s, r = call("POST", "/v1/auth/password-login", {"login": glogin, "password": pw})
        ok("⑥ 换设备用口令登得进", s == 200, f"{s} {r}")
        s, r = call("GET", "/api/notes/", token=(r or {}).get("token"))
        titles = _titles(r)
        ok("⑥ 换设备读到同一篇", gtitle in titles, titles)

        # ⑦ 找回：拿①那串恢复码重置 ⇒ 旧票立刻作废、旧恢复码立刻作废
        s, r = call("POST", "/v1/auth/recover", {"login": login, "recovery_code": code, "new_password": pw2})
        ok("⑦ 找回 200 且换发新恢复码", s == 200 and bool((r or {}).get("recovery_code")), f"{s} {r}")
        rtok = (r or {}).get("token")
        made[0][0] = rtok or tok
        s, _ = call("GET", "/api/user/profile", token=tok)
        ok("⑦ 旧票立刻 401", s == 401, s)
        s, r = call("POST", "/v1/auth/recover", {"login": login, "recovery_code": code, "new_password": pw2 + "z"})
        ok("⑦ 旧恢复码再用一次进不去", s == 400, f"{s} {r}")
        s, r = call("GET", "/api/notes/", token=rtok)
        titles = _titles(r)
        ok("⑦ 找回之后笔记没搬家", title in titles, titles)

        # ⑧ 改密：旧密码立刻不认，新密码认
        s, r = call("POST", "/v1/auth/change-password", {"old_password": pw2, "new_password": pw}, token=rtok)
        ok("⑧ 改密 200", s == 200, f"{s} {r}")
        ctok = (r or {}).get("token") or rtok
        made[0][0] = ctok
        s, r = call("POST", "/v1/auth/password-login", {"login": login, "password": pw2})
        ok("⑧ 旧密码登不进", s == 400, f"{s} {r}")
        s, r = call("POST", "/v1/auth/password-login", {"login": login, "password": pw})
        ok("⑧ 新密码登得进", s == 200, f"{s} {r}")
        made[0][0] = (r or {}).get("token") or ctok

        # ⑨ 抢名：别人拿同一个登录名注册必须 409，且不许覆盖原主
        s, r = call("POST", "/v1/auth/register", {"login": login, "password": "someone-else-123"})
        ok("⑨ 同名注册 409", s == 409, f"{s} {r}")
        s, r = call("POST", "/v1/auth/password-login", {"login": login, "password": pw})
        ok("⑨ 抢名之后原主密码没被改", s == 200, f"{s} {r}")
        made[0][0] = (r or {}).get("token") or made[0][0]
    finally:
        print("--- 收尾：造出来的账号真删 ---", flush=True)
        for tok, label in made:
            if not tok:
                continue
            s, r = call("POST", "/api/user/deactivate", {"confirm": True}, token=tok)
            if s == 401:
                print(f"  · {label} 已经不在了（401）", flush=True)
                continue
            ok(f"收尾 {label} 注销 200", s == 200, f"{s} {r}")
            if s == 200:
                ok(f"收尾 {label} deleted.passwords 在场",
                   "passwords" in (r or {}).get("deleted", {}), (r or {}).get("deleted"))
            s2, _ = call("GET", "/api/user/profile", token=tok)
            ok(f"收尾 {label} 旧票 401", s2 == 401, s2)

    print(f"\n=== {PASS} 过 / {FAIL} 红 ===", flush=True)
    return 1 if FAIL else 0


if __name__ == "__main__":
    t0 = time.time()
    rc = main()
    print(f"耗时 {time.time() - t0:.1f}s", flush=True)
    sys.exit(rc)