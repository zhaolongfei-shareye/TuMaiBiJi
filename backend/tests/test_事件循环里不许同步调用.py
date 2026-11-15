"""事件循环里不许跑同步调用 —— 10-25 第八轮审计 M2 那条的守门用例（纯静态＋一只假 Redis，不碰现网、不发版）。

要挡的事：一只 `async def` 的口里直接调**同步**的东西（查库／打 Redis／拼一份要查库的凭据）。
这种调用的症状不是"这一条请求慢"，是**整站一起排队**——uvicorn 的循环被一次同步 I/O 占住时，
连 `/health` 都得等它。同一族 10-22 在检图那条链上已经修过一次（`note_images.py` 那两处 `to_thread`），
M2 是本仓剩下的那几处：登录要同步查一次密钥库、取 token 也是、提炼每一发也是、三条录入口各打两趟 Redis。

⚠ SQLite 那一条把这族的代价放得很大：`database.py` 把 `busy_timeout` 钉成 5000ms（写事务撞锁时
驱动就在原地等），所以"循环里同步查库"最坏是把整站按住**五秒**，而不是我以为的几毫秒。

三条判据各管一段：
- **① 枚举**：现读 `app/**/*.py` 里所有 `async def`，出现名单上的同步名字就必须裹在
  `asyncio.to_thread(...)` 里；差集里每一条都得在豁免名单在册并写明归属，否则红。
  这一族的名单是**阻塞点的名字**，不是路由名——所以新加一只异步口调用同一个函数时它自动被看住。
- **② 牙**：拿两段合成代码正反各验一次（裸调 ⇒ 报出，裹 `to_thread` ⇒ 不报），
  外加"名单里那几只到现在仍然是同步函数"——哪天有人把 `resolve` 改成 `async def`，
  `to_thread(resolve, …)` 会回一个没人 await 的协程，**症状是静默不干活**，那条得当场红。
- **③ 连接复用**：`get_redis_conn()` 按 URL 复用，不是每次新建（新建那一下是 TCP＋握手，
  原本也压在循环上）。这一条是真跑的，拿一只假 `from_url` 数次数。

跑法：cd backend && .venv/bin/python -m pytest tests/test_事件循环里不许同步调用.py -v
"""
import ast
import asyncio
import inspect
import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tumaibiji_loop_pytest.db")
os.environ.setdefault("JWT_SECRET_KEY", "pytest-only-secret-not-a-real-one")
os.environ.setdefault("EXTRACT_PROVIDER", "none")
os.environ.setdefault("SEC_CHECK_ENABLED", "false")

import pytest

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"

# 名单里放两类：**自己就阻塞**的那几只（同步查库／真打 Redis），以及**同步壳子里再调阻塞函数**
# 的入口名（`_token_body` 内部就是 `resolve`）。AST 看不见跨函数调用，所以后者只能靠"把它一并登记"，
# 以后谁新加一枚同步 helper 而它在内部查库／出网，就得进这张名单——这正是这条判据要的动手处。
BLOCKING = {
    "resolve": "同步查密钥库（撞锁时最坏等满 busy_timeout 5000ms）",
    "_token_body": "壳子：里面那句 resolve 同步查库",
    "set_task_status": "两趟真打 Redis（读旧值＋写新值）",
    "get_task_status": "真打 Redis",
    "enqueue": "真打 Redis",
    "check_text": "同步 HTTP 送微信内容安全",
    "check_image": "同步 HTTP 送微信内容安全",
    "read_body": "同步读整份请求体＋逐张 b64decode",
    "SessionLocal": "同步建库连接",
    # 11-09 手机号登录那一发添的：`services/sms.py` 里那五枚同步 helper，
    # 全部挂在 `/v1/auth/sms`、`/v1/auth/login` 两只异步口上。不登记的话这一族就是假绿——
    # 判据按**被调函数名**匹配，名字不在名单里它根本不看。
    "_resolve_all": "壳子：里面五句 resolve 各同步查一次密钥库",
    "check_cooldown": "真打 Redis（TTL 一趟）",
    "store_code": "真打 Redis（SETEX 一趟）",
    "set_cooldown": "真打 Redis（SETEX 一趟）",
    "verify_code": "真打 Redis（GETDEL 或 pipeline 一趟）",
    # 11-16 Z4 那一刀添的：`services/passwords.py` 里那三枚**自己就跑 scrypt** 的函数
    # （几十毫秒、吃 16 MiB）。口令族五口 11-13 上现网时一枚都没裹，等于每一发登录／注册
    # 都把单进程循环按住几十毫秒，而且登录口匿名、只按 IP 限流 ⇒ 换 IP 叠发可放大成全站。
    "hash_password": "跑 scrypt（几十毫秒 CPU＋16 MiB）",
    "verify_password": "跑 scrypt（同上）",
    "dummy_verify": "壳子：里面那句 verify_password 跑 scrypt",
}

# 现读到的、**本轮不动**的阻塞点，逐条写清归谁。名单只许变短不许变长。
EXEMPT = {
    "app/api/routes/roammark.py:spot_draft_create:read_body":
        "归另一路（RoamMark 那条线，文件仍未入库、现网 404）；正本 M2 修法原话是"
        "「改动可以跟第一趟 RoamMark 部署并成一刀」，由他们那一刀收，本刀不代改别人的文件",
}
# 长度**硬写**：2026-10-25 这一趟落码后现数是 1 条。不许写成 `len(EXEMPT)`——那样加一行它也跟着涨。
EXEMPT_SIZE = 1

# 11-16 Z3 那一刀用的**按函数**名单：`core/auth.login_or_register` 里"一碰库就同步"的那几枚调用。
# 为什么不并进上面的 `BLOCKING`（审计原话是"把上述函数名补进守门名单"）：这五枚名字现在还被
# `app/api/routes/v1_auth.py` 里另一串异步口裸调（`apple_login`／`guest_login`／`phone_login`／
# `email_login`／口令族五口），并进 `BLOCKING` 会当场挂出十几条红，而豁免名单只许变短不许变长
# （`EXEMPT_SIZE` 是硬写的）。那些口各归 Z4 与后面的刀，收一处并一处；这一条先把**现网小程序登录
# 主路**（`/api/auth/wechat` 与 `/v1/auth/wechat` 都转调 `login_or_register`）钉住。
# `query`／`add`／`commit`／`refresh`／`rollback` 是 SQLAlchemy 会话上的方法名，故意算进来：
# 只在这一只函数里查，不在全文查，所以敢用这么通用的名字。
LOGIN_DB_CALLS = {
    "query", "add", "commit", "refresh", "rollback",
    "allocate", "ensure_for_user", "attribute_inviter",
    "seed_default_categories", "seed_note_for_new_user",
}


def _call_name(node: ast.Call) -> str | None:
    """`service_secrets.resolve(...)` → `resolve`；`q.enqueue(...)` → `enqueue`；`get_queue().enqueue` → `enqueue`。"""
    return getattr(node.func, "attr", None) or getattr(node.func, "id", None)


def _thread_wrapped_ids(fn) -> set[int]:
    """`asyncio.to_thread(f, ...)` 里第一个实参（那个真正要跑的函数）**以及它内部的表达式**都算已挪出循环。

    把 `get_queue().enqueue` 整棵子树都记上，是因为 `get_queue()` 这一次就在同一趟线程里跑——
    按 id 记而不是按名字记，避免"某枚名字在别处裸调也被免检"。
    """
    wrapped = set()
    for n in ast.walk(fn):
        if not isinstance(n, ast.Call):
            continue
        base = getattr(n.func, "attr", None) or getattr(n.func, "id", None)
        if base == "to_thread" and len(n.args) >= 2:
            for m in ast.walk(n.args[1]):
                if isinstance(m, (ast.Call, ast.Attribute)):
                    wrapped.add(id(m))
    return wrapped


def _violations(tree: ast.AST, rel: str) -> list[tuple[str, str, int, str]]:
    out = []
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.AsyncFunctionDef):
            continue
        wrapped = _thread_wrapped_ids(fn)
        for n in ast.walk(fn):
            if not isinstance(n, ast.Call) or id(n) in wrapped:
                continue
            name = _call_name(n)
            if name in BLOCKING:
                out.append((rel, fn.name, n.lineno, name))
    return out


def _scan_app() -> list[tuple[str, str, int, str]]:
    hits = []
    for path in sorted(APP.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        hits += _violations(tree, str(path.relative_to(BACKEND)))
    return hits


def _keys(hits) -> set[str]:
    return {f"{f}:{fn}:{name}" for f, fn, _line, name in hits}


def _fn_body(tree: ast.AST, name: str):
    """按名字取函数体，回（节点，是不是协程）。重名不管——这几只名字在本仓唯一。"""
    for n in ast.walk(tree):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == name:
            return n, isinstance(n, ast.AsyncFunctionDef)
    return None, None


def _to_thread_count(fn) -> int:
    return sum(1 for c in ast.walk(fn)
               if isinstance(c, ast.Call)
               and (getattr(c.func, "attr", None) or getattr(c.func, "id", None)) == "to_thread")


# ── ① 枚举 ────────────────────────────────────────────────────────────────
def test_async口里不许直接调名单上那些同步东西():
    hits = _scan_app()
    unregistered = sorted(_keys(hits) - set(EXEMPT))
    assert not unregistered, (
        f"这些调用还在事件循环上：{unregistered}\n"
        f"要么裹 `await asyncio.to_thread(...)`，要么在 EXEMPT 里写明归属与为什么不裹"
    )


def test_豁免名单只许变短而且条条还活着():
    assert len(EXEMPT) == EXEMPT_SIZE, (
        f"豁免名单现数 {len(EXEMPT)} 条、钉的是 {EXEMPT_SIZE} 条——"
        f"挂了新豁免就要先把那一处真修掉，别把名单当垃圾桶")
    live = _keys(_scan_app())
    stale = sorted(set(EXEMPT) - live)
    assert not stale, f"这些豁免条目已经没有对应的红了（那一处修完了／改名了）：{stale}，删掉这一行"


# ── ② 牙 ─────────────────────────────────────────────────────────────────
def test_尺子自己看得见():
    """正反各一次：没跑过就不许说"这条有牙"。"""
    bare = ast.parse(
        "import asyncio\n"
        "async def route():\n"
        "    k = service_secrets.resolve('X', 'y')\n"
        "    q.enqueue('t', k)\n"
    )
    got = _violations(bare, "x.py")
    assert [name for _f, _fn, _l, name in got] == ["resolve", "enqueue"], got

    wrapped = ast.parse(
        "import asyncio\n"
        "async def route():\n"
        "    k = await asyncio.to_thread(service_secrets.resolve, 'X', 'y')\n"
        "    await asyncio.to_thread(get_queue().enqueue, 't', k, job_id='j')\n"
    )
    assert _violations(wrapped, "x.py") == [], "裹了 to_thread 还在报＝这条尺子只会喊狼"


def test_名单里那几只到现在仍然真是同步函数():
    """哪天有人把 `resolve` 改成 `async def`，`to_thread(resolve, …)` 会回一枚**没人 await 的协程**：
    不抛错、不查库，屏上只是"那一步没生效"。这一条把"名单＝同步函数"这个前提钉住。"""
    from app.services import llm, passwords, queue as queue_service, service_secrets, wechat  # noqa: F401
    for fn in (service_secrets.resolve, queue_service.set_task_status,
               queue_service.get_task_status, wechat.check_text,
               wechat.check_image, wechat._token_body,
               passwords.hash_password, passwords.verify_password, passwords.dummy_verify):
        assert not inspect.iscoroutinefunction(fn), (
            f"{fn.__module__}.{fn.__name__} 变成协程了——那它上面所有 "
            f"`asyncio.to_thread(...)` 都得改回直接 await，名单也要撤掉这一行")


def test_那三条录入口两次Redis往返都真的挪出了循环():
    """M2 落码处：`/url`、`/text`、`/screenshots/process` 各要两趟 Redis（登记＋入队）。

    数的是**每一口至少两枚 `to_thread`**，而不是数全文总数：一口漏了裹（比如只挪登记没挪入队），
    全文总数照样是 6，看不出来。
    """
    src = (APP / "api" / "routes" / "ingest.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    wanted = {"ingest_url", "ingest_text", "process_screenshots"}
    seen = {}
    for fn in ast.walk(tree):
        if isinstance(fn, ast.AsyncFunctionDef) and fn.name in wanted:
            n = 0
            for c in ast.walk(fn):
                if isinstance(c, ast.Call):
                    base = getattr(c.func, "attr", None) or getattr(c.func, "id", None)
                    if base == "to_thread":
                        n += 1
            seen[fn.name] = n
    assert set(seen) == wanted, f"这三只口改名或没了，判据要跟着改口径：{sorted(seen)}"
    for name, count in seen.items():
        assert count >= 2, f"{name} 只有 {count} 枚 to_thread：登记与入队是两趟网络，少一枚就是还有一趟在循环上"


def test_微信登录主路那几段库活真的挪出了循环():
    """Z3 落码处：`core/auth.login_or_register` 是现网小程序登录唯一那条路（`/api/auth/wechat`
    与 `/v1/auth/wechat` 都转调它），它下面**一句同步库调用都不许留在事件循环上**。

    为什么单独一条、不复用上面①：①按**被调函数名**在全仓查，而 `query`／`commit` 这些名字
    还被 `v1_auth.py` 里另一串异步口裸调（那些口归 Z4 与后面的刀），并进 `BLOCKING` 会一次挂出
    十几条红、逼着豁免名单变长。这一条按**函数**查，只盯这一只口，收一处并一处。

    三段各挡一种失效：
    - ①本体出现未裹 `to_thread` 的名单内调用 ⇒ 红（就是审计要挡的那个症状：单进程 uvicorn
      撞 worker 写锁时驱动原地等 `busy_timeout` 5000ms，这五秒里含 `/health` 整站排队）。
    - 助手 `_bootstrap_user` 不在了／改名了 ⇒ 红。这条必须有，否则"把整段删了"也算修好了。
    - 助手必须是**同步** `def` 而且真装着那些库调用 ⇒ 红。哪天有人给它加 `async`，
      `await asyncio.to_thread(协程)` 回一枚没人 await 的协程：**不抛错、不查库、屏上只是登录没反应**。
    """
    tree = ast.parse((APP / "core" / "auth.py").read_text(encoding="utf-8"))

    fn, is_coro = _fn_body(tree, "login_or_register")
    assert fn is not None and is_coro, "`login_or_register` 改名、没了或变成同步函数了，判据要跟着改口径"
    wrapped = _thread_wrapped_ids(fn)
    bare = [(c.lineno, _call_name(c)) for c in ast.walk(fn)
            if isinstance(c, ast.Call) and id(c) not in wrapped and _call_name(c) in LOGIN_DB_CALLS]
    assert not bare, (f"这些还在事件循环上：{sorted(bare)}——"
                      f"整段搬进一只同步 helper，调用处写 `await asyncio.to_thread(helper, db, ...)`")
    assert _to_thread_count(fn) >= 1, "`login_or_register` 里一枚 `to_thread` 都没有＝那段库活还在循环上"

    helper, helper_is_coro = _fn_body(tree, "_bootstrap_user")
    assert helper is not None, "`_bootstrap_user` 不在了或改了名——上面那条『未裹 to_thread 的调用』也一起失明"
    assert not helper_is_coro, "`_bootstrap_user` 变成协程了，`to_thread` 会回一枚没人 await 的协程：静默不干活"
    inside = {_call_name(c) for c in ast.walk(helper) if isinstance(c, ast.Call)}
    missing = sorted({"query", "commit", "allocate", "ensure_for_user", "attribute_inviter"} - inside)
    assert not missing, f"这些库活没在那只 helper 里（说明还留在循环上的某处）：{missing}"

    from app.core import auth
    assert not inspect.iscoroutinefunction(auth._bootstrap_user), "同上：静态判据与运行时得一致"
    assert inspect.iscoroutinefunction(auth.login_or_register)


def test_口令服务层那两只不许自己跑scrypt():
    """Z4 的分工：scrypt 在**路由**那一层挪出循环，`passwords.create`／`set_password` 只管行的形状、
    吃调用方算好的哈希（`create(db, account, await asyncio.to_thread(hash_password, pw))`）。

    为什么这一条必须有：判据①按**被调函数名**查，`create`／`set_password` 不在名单里（它们是
    "行的形状"，不是阻塞点）。哪天有人把 `hash_password` 收回这两只函数内部——那是最自然的
    顺手一改，签名短一个 await——路由里那句裸 `create(db, account, password)` 就又是一枚压在
    循环上的 scrypt，而①一个字都看不见。这一条把"这一层不碰 CPU 重活"这句分工钉死。
    """
    tree = ast.parse((APP / "services" / "passwords.py").read_text(encoding="utf-8"))
    for name in ("create", "set_password"):
        fn, is_coro = _fn_body(tree, name)
        assert fn is not None and not is_coro, f"`passwords.{name}` 没了或变成协程了，判据要跟着改口径"
        inside = {_call_name(c) for c in ast.walk(fn) if isinstance(c, ast.Call)}
        scrypt = sorted(inside & {"hash_password", "verify_password", "dummy_verify"})
        assert not scrypt, (
            f"`passwords.{name}` 里又出现了 {scrypt}＝scrypt 回到了这一层，"
            f"而调用它的那些异步路由只裹了 `hash_password` 那一枚：这一发又压回循环上了")


# ── ③ 连接复用 ────────────────────────────────────────────────────────────
def test_连接按URL复用而不是每次新建(monkeypatch):
    """`redis.from_url` 每调一次就新建一个 ConnectionPool（TCP＋握手），原来三处录入各付一次。

    数的是"建了几次连接"，不是"连得对不对"——真 Redis 在这台机上没有，这条也不该要它。
    按 URL 分键而不是只存一枚：粘住第一枚的话，改了 `REDIS_URL` 会读到另一台库的连接。
    """
    from app.core.config import settings
    from app.services import queue as queue_service

    built = []

    class FakeRedis:
        def __init__(self, url):
            self.url = url

    def fake_from_url(url):
        built.append(url)
        return FakeRedis(url)

    monkeypatch.setattr(queue_service.redis, "from_url", fake_from_url)
    monkeypatch.setattr(queue_service, "_conns", {})
    monkeypatch.setattr(settings, "REDIS_URL", "redis://probe-a:6379/0", raising=False)
    first = queue_service.get_redis_conn()
    again = queue_service.get_redis_conn()
    assert first is again, "同一个 URL 每次都新建连接＝M2 那一处没修"
    assert len(built) == 1, built

    monkeypatch.setattr(settings, "REDIS_URL", "redis://probe-b:6379/0", raising=False)
    other = queue_service.get_redis_conn()
    assert other is not first, "换了 REDIS_URL 还发旧连接，等于连到另一台库上"
    assert len(built) == 2, built
