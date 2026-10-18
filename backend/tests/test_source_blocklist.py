"""来源黑名单（规格 `docs/规格-来源黑名单.md` §六那九条）。

这批尺子分三档，按"红的时候哪一句是假话"排：

1. **计数那两条**（阈值边界／四类不计数）——这一条要是漏了，症状不是报错，是**把好站拉黑**。
   10-13 那次现网 `.env` 少三行、提炼静默降级一整天，就是这类故障的形状：那种一天能把所有站刷进名单。
   所以"不该涨的不涨"比"该涨的涨了"更难，也更要紧。
2. **命中不出网**——"省服务器资源"这一句只有这条抓得住，光看返回的那句话抓不到。
   判据是抓取替身的**调用次数等于 0**，不是它回了什么。
3. **表还没建出来时不许把所有提取一起判死**——丙那条路（只落码不部署）今天就是这个状态：
   代码可以先上、迁移后跑。让前置查询抛出去，症状是每一条链接提取一起红，
   而那条链本来好得很。这一条是 fail-open，所以它必须被钉住"大声记日志"那一半。

跑法：cd backend && .venv/bin/python -m pytest tests/test_source_blocklist.py -q
"""
import inspect
import re
import sys
from pathlib import Path

import httpx
import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.models.source_blocklist import AUTO_THRESHOLD, MAX_HOST_LEN, SOURCE_MANUAL, SourceBlocklist
from app.models.user import User
from app.services import source_blocklist
from app.services.scraper import SiteHttpError, UserError, _status_hint
from app.tasks import ingest_tasks

URL = "https://www.zhihu.com/question/1/answer/2"


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def statuses(monkeypatch):
    """set_task_status 要写 Redis，这里只记调用：断言的是"任务被怎么判的"，不是 Redis。"""
    calls = []
    monkeypatch.setattr(
        ingest_tasks, "set_task_status", lambda tid, st, res=None: calls.append((tid, st, res))
    )
    return calls


def _rows(db):
    db.expire_all()
    return {r.host: r for r in db.query(SourceBlocklist).all()}


def _note(db, url=URL, status=None, n=1):
    for _ in range(n):
        source_blocklist.note_site_failure(db, url, status)


# ---------------------------------------------------------------- 一、阈值与计数

class Test一_阈值边界:
    def test_两次不进名单第三次才进(self, db):
        """规格 §六第 1 条。钉的是数，不是话。"""
        _note(db, status=403, n=2)
        row = _rows(db)["www.zhihu.com"]
        assert row.fail_count == 2
        assert source_blocklist.row_is_blocked(row) is False
        assert source_blocklist.is_blocked_url(db, URL) is False

        _note(db, status=403)
        assert source_blocklist.is_blocked_url(db, URL) is True, "攒够 3 次就该拦，不等管理员点一下"

    def test_主机名原样计数不去子域(self, db):
        """§三②：`www.`／`zhuanlan.`／`m.` 各攒各的。合并就是拿一个子域的证据判整族。"""
        for host in ("www.zhihu.com", "zhuanlan.zhihu.com", "m.zhihu.com"):
            _note(db, f"https://{host}/a", 403, n=AUTO_THRESHOLD)
        rows = _rows(db)
        assert sorted(rows) == ["m.zhihu.com", "www.zhihu.com", "zhuanlan.zhihu.com"]
        assert all(r.fail_count == AUTO_THRESHOLD for r in rows.values())

    def test_大小写与尾点归一条(self, db):
        """`WWW.X.com` 与 `www.x.com.` 是同一个站；分成两行等于每台都要多攒 3 次才拦得住。"""
        _note(db, "https://WWW.ZHIHU.COM/A", 403)
        _note(db, "https://www.zhihu.com./b", 403)
        rows = _rows(db)
        assert list(rows) == ["www.zhihu.com"] and rows["www.zhihu.com"].fail_count == 2


class Test二_那四类一条都不计:
    """四类各自喂进去，`fail_count` 必须一动不动。少钉一条，将来就是那一类被算到网站头上。"""

    def _run(self, db, statuses, url=URL):
        ingest_tasks.process_url_task("t1", "1", url, 1)
        return _rows(db)

    def test_连不上与超时不计数(self, db, statuses, monkeypatch):
        async def boom(url):
            raise httpx.ConnectTimeout("timed out")

        monkeypatch.setattr(ingest_tasks, "scrape_url", boom)
        assert self._run(db, statuses) == {}
        assert statuses[-1][2]["error"] == ingest_tasks.GENERIC_TASK_ERROR

    def test_闸门拒的链接不计数(self, db, statuses, monkeypatch):
        """内网／解析不出——那是我们的闸门，不是那个站的失败。"""
        async def gated(url):
            raise UserError("这个链接我们打不开，换一个试试")

        monkeypatch.setattr(ingest_tasks, "scrape_url", gated)
        assert self._run(db, statuses) == {}

    def test_提炼失败不计数(self, db, statuses, monkeypatch):
        """页抓到了、字也有了，是我们自己的模型那一步坏了。10-13 那次就是这一型。"""
        async def ok(url):
            return {"content": "正文有的", "title": "T", "source_type": "web_article", "status_code": 200}

        async def broken(text, fallback_title=None, translate=None):
            raise RuntimeError("hunyuan 额度打光")

        monkeypatch.setattr(ingest_tasks, "scrape_url", ok)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", broken)
        assert self._run(db, statuses) == {}, "提炼坏了记到网站头上，一天能把全网拉黑"

    def test_落库那一趟坏了不计数(self, db, statuses, monkeypatch):
        """worker 侧的故障（这里是账号已注销）：抓取成功、正文非空，失败在我们这一头。"""
        async def ok(url):
            return {"content": "正文有的", "title": "T", "source_type": "web_article", "status_code": 200}

        async def quiet(text, fallback_title=None, translate=None):
            return {"title": "T", "summary": "", "key_points": [], "tags": [], "degraded": False}

        monkeypatch.setattr(ingest_tasks, "scrape_url", ok)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", quiet)
        ingest_tasks.process_url_task("t1", "1", URL, 1)   # users 表里没这个人
        assert _rows(db) == {}

    def test_贴图那一路压根没有第二个调用点(self):
        """§六第 6 条的代码化：一张图被原作者删掉不代表整站读不到，两条链互不喂数。

        贴图那一路（方案-公众号贴图随笔记存档）还没落码，所以这里只能静态钉调用点。
        钉两层，少一层都会漏：
        ① **服务层那一枚出口**（`source_blocklist.note_site_failure(`）全仓只有一个调用文件、一次调用
           ——将来谁给贴图那条链也接一枚记账，红在这一句上；
        ② worker 里那枚包装函数 `_note_site_failure` 出现 3 次：一次定义＋**恰好两处**调用。
           数到第四处就是有人新接了一个落点，而规格 §三① 那张表只有两行。

        （第一版这里直接数 `note_site_failure(` 子串，量出来是 4：包装函数名本身就带着这一段。
        判据数错了不等于代码错了——按 10-17 那条规矩改判据，不动代码迁就它。）
        """
        texts = {p.relative_to(BACKEND).as_posix(): p.read_text(encoding="utf-8")
                 for p in BACKEND.joinpath("app").rglob("*.py")}
        entry = [(p, t.count("source_blocklist.note_site_failure(")) for p, t in texts.items()]
        entry = [(p, n) for p, n in entry if n]
        assert entry == [("app/tasks/ingest_tasks.py", 1)], f"记账出口多了调用点：{entry}"
        wrapped = [(p, t.count("_note_site_failure(")) for p, t in texts.items()]
        wrapped = [(p, n) for p, n in wrapped if n]
        assert wrapped == [("app/tasks/ingest_tasks.py", 3)], f"那两个落点变了：{wrapped}"

    def test_计入的两型各记一条(self, db, statuses, monkeypatch):
        """反向对照：这一型**要**涨，否则上面那五条全绿只是因为什么都没记。"""
        calls = []

        def fake_note(url, status_code):
            calls.append((url, status_code))

        monkeypatch.setattr(ingest_tasks, "_note_site_failure", fake_note)

        async def http403(url):
            raise SiteHttpError(_status_hint(403), 403)

        monkeypatch.setattr(ingest_tasks, "scrape_url", http403)
        ingest_tasks.process_url_task("t1", "1", URL, 1)
        assert calls == [(URL, 403)], "4xx 那一型没记"

        calls.clear()

        async def empty(url):
            return {"content": "   ", "title": "T", "source_type": "web_article", "status_code": 200}

        monkeypatch.setattr(ingest_tasks, "scrape_url", empty)
        ingest_tasks.process_url_task("t2", "1", URL, 1)
        assert calls == [(URL, 200)], "200 且正文 0 字那一型没记（微博壳页的形状）"


class Test三_命中不出网:
    def test_进了名单之后抓取一次都不许调(self, db, statuses, monkeypatch):
        """§六第 3 条：这条才是"省服务器资源"的落地。看返回话抓不到它。"""
        _note(db, status=403, n=AUTO_THRESHOLD)
        seen = []

        async def must_not_run(url):
            seen.append(url)
            raise AssertionError("命中黑名单还去抓＝这条没生效")

        monkeypatch.setattr(ingest_tasks, "scrape_url", must_not_run)
        ingest_tasks.process_url_task("t1", "1", URL, 1)

        assert seen == [], f"命中了还是出了网：{seen}"
        assert statuses[-1][1] == "failed"
        assert statuses[-1][2]["error"] == source_blocklist.BLOCKED_HINT

    def test_给用户的这句话不越toast那两行(self):
        """§二第 3 条：`UserError`/任务 `error` 直接进 toast，只两行、约 30 汉字。"""
        assert len(source_blocklist.BLOCKED_HINT) <= 30, source_blocklist.BLOCKED_HINT
        assert "自动恢复" not in source_blocklist.BLOCKED_HINT, "不许承诺会放回去（§四那条）"
        assert "暂不支持" not in source_blocklist.BLOCKED_HINT, "那三个字他打过回"

    def test_名单只管链接提取(self):
        """截图／拍照／亲自撰写那三条路一个字都不查这张表（§四最后一句）。

        判的是**那两只函数的源码里没有黑名单**，不是"跑一遍看它生不生效"——
        那三条路上没有 URL 可查，跑十遍也量不出"没查"。
        """
        for fn in ("process_screenshots_task", "process_manual_text_task"):
            src = inspect.getsource(getattr(ingest_tasks, fn))
            assert "block" not in src and "blocklist" not in src, f"{fn} 里出现了黑名单"


class Test四_手工那一格:
    def test_手工加的不要求先攒够三次(self, db):
        """§六第 5 条：否则他没法立刻拉黑一个新站——那一格就成了摆设。"""
        out = source_blocklist.add_manual(db, "https://weibo.com/1649679354/5353881820204840")
        db.expire_all()
        assert out["source"] == SOURCE_MANUAL and out["fail_count"] == 0
        assert out["blocked"] is True
        assert source_blocklist.is_blocked_url(db, "https://weibo.com/a") is True

    def test_手工移出之后当场放行(self, db):
        """§六第 4 条钉的是反向：不许出现"移出还被拦"。"""
        _note(db, status=403, n=AUTO_THRESHOLD)
        assert source_blocklist.is_blocked_url(db, URL) is True
        source_blocklist.remove(db, "www.zhihu.com")
        assert source_blocklist.is_blocked_url(db, URL) is False, "移出了还拦着＝那一枚按钮是假的"
        assert _rows(db) == {}, "移出要连账一起删，留着下一次就还是 blocked"

    def test_同一台主机不许有两行(self, db):
        """先自动攒 2 次、再手工加：改的是那一行的身份，不是再插一行（唯一索引也不同意）。"""
        _note(db, status=403, n=2)
        source_blocklist.add_manual(db, "www.zhihu.com")
        source_blocklist.add_manual(db, "www.zhihu.com")
        rows = _rows(db)
        assert list(rows) == ["www.zhihu.com"] and rows["www.zhihu.com"].fail_count == 2
        assert rows["www.zhihu.com"].source == SOURCE_MANUAL

    @pytest.mark.parametrize("坏字", ["", "  ", "localhost", "http://", "带空格的 主机",
                                      "www.example.com:8080", "*.example.com", "a@b.com"])
    def test_形状不对的手工加句整条退回(self, 坏字):
        """为什么要有这一道：带空格／端口／通配符的值**永远匹配不上任何真实链接**
        （`host_of` 取出来的从来不含它们），存进去就是后台里一行"看着拉黑了、谁都拦不住"的假条目。"""
        with pytest.raises(UserError):
            source_blocklist.clean_host(坏字)

    @pytest.mark.parametrize("写法,期望", [
        ("www.example.com", "www.example.com"),
        ("  WWW.Example.COM  ", "www.example.com"),
        ("https://www.example.com/a/b?c=1", "www.example.com"),
        ("//www.example.com/", "www.example.com"),
        ("www.example.com.", "www.example.com"),
    ])
    def test_三种手滑都容忍(self, 写法, 期望):
        assert source_blocklist.clean_host(写法) == 期望


class Test五_那三类不计数之外的事实:
    def test_状态码记下来了(self, db):
        """后台那一栏六列里有两列就是这个数与那个时间；记不下来就等于少两列。"""
        _note(db, status=403)
        _note(db, status=200, n=2)
        row = _rows(db)["www.zhihu.com"]
        assert row.last_status == 200 and row.last_failed_at is not None
        assert source_blocklist.describe(row)["last_failed_at"]

    def test_抓回来的页没有那一枚数也不炸(self, db):
        """fake 出来的抓取回体没有 `status_code`（现网那几把尺子就是这种形状）：
        缺它只能退成"这个数不知道"，不许把一次抓取判成别的。"""
        _note(db, status=None)
        assert _rows(db)["www.zhihu.com"].last_status is None

    def test_表还没建出来时按没拦处理而不是全体失败(self, db, statuses, monkeypatch):
        """丙那条路今天的状态：代码可以先上、迁移后跑。这一句是 fail-open，必须钉住。"""
        def 打不开(*a, **k):
            raise RuntimeError("(sqlite3.OperationalError) no such table: source_blocklist")

        monkeypatch.setattr(source_blocklist, "is_blocked_url", 打不开)
        done = []

        async def ok(url):
            done.append(url)
            return {"content": "正文", "title": "T", "source_type": "web_article", "status_code": 200}

        async def quiet(text, fallback_title=None, translate=None):
            return {"title": "T", "summary": "", "key_points": [], "tags": [], "degraded": False}

        monkeypatch.setattr(ingest_tasks, "scrape_url", ok)
        monkeypatch.setattr(ingest_tasks, "extract_knowledge", quiet)
        u = User(openid="bl-ok", generation=1)
        db.add(u)
        db.commit()
        ingest_tasks.process_url_task("t1", str(u.id), URL, u.generation)

        assert done == [URL], "黑名单读不出来把整条提取链一起判死了"
        assert statuses[-1][1] == "completed"

    def test_记账自己坏了不改那一句给用户的话(self, db, statuses, monkeypatch):
        async def empty(url):
            return {"content": "", "title": "T", "source_type": "web_article", "status_code": 200}

        def 抛(*a, **k):
            raise RuntimeError("库锁了")

        monkeypatch.setattr(ingest_tasks, "scrape_url", empty)
        monkeypatch.setattr(ingest_tasks.source_blocklist, "note_site_failure", 抛)
        ingest_tasks.process_url_task("t1", "1", URL, 1)
        assert statuses[-1][2]["error"] == "未能从 URL 提取到有效内容"


class Test六_现网那两句话没被合并:
    def test_旧的两句原样(self, db, statuses, monkeypatch):
        """§六第 9 条：黑名单那句是**新增的一型**，不许把老的两句并进它。"""
        assert _status_hint(403) == "该网页需要登录，无法读取"

        async def http403(url):
            raise SiteHttpError(_status_hint(403), 403)

        monkeypatch.setattr(ingest_tasks, "scrape_url", http403)
        ingest_tasks.process_url_task("t1", "1", URL, 1)
        assert statuses[-1][2]["error"] == "该网页需要登录，无法读取"
        assert statuses[-1][2]["error"] != source_blocklist.BLOCKED_HINT

        async def empty(url):
            return {"content": "", "title": "T", "source_type": "web_article", "status_code": 200}

        monkeypatch.setattr(ingest_tasks, "scrape_url", empty)
        ingest_tasks.process_url_task("t2", "1", URL, 1)
        assert statuses[-1][2]["error"] == "未能从 URL 提取到有效内容"

    def test_带状态码那一支仍是UserError(self):
        """`scrape_url` 的 `except UserError: raise` 与 `failure_message()` 判的都是 UserError；
        换成另一支基类，用户那句话会当场变成通用中文——那是悄悄改口。"""
        exc = SiteHttpError(_status_hint(404), 404)
        assert isinstance(exc, UserError)
        assert str(exc) == "网页不存在或已被删除"
        assert ingest_tasks.failure_message(exc) == "网页不存在或已被删除"
        assert exc.status_code == 404


class Test七_后台那三个口:
    PATH = "/api/admin/source-blocklist"
    ADMIN_PW = "pytest-admin-token-not-a-real-one-32"

    def _hdr(self, client):
        """换票那三行在五条用例里各写一遍，会变成"哪条的键名写错了"这种假红。

        ⚠ 10-19 现网探针第一趟就栽在这一句上：`/api/admin/login` 回体的键叫 **`session`**，
        我照常规写了 `token`，于是拿到空串、后面每一句 `Bearer ` 全 401——**22 条一起红，
        红的不是产品，是量具自己没开门**。
        """
        tok = client.post("/api/admin/login", json={"token": self.ADMIN_PW}).json()["session"]
        return {"Authorization": f"Bearer {tok}"}

    @pytest.fixture()
    def client(self):
        from fastapi.testclient import TestClient

        from app.main import app

        app.state.limiter.enabled = False
        with TestClient(app) as c:
            yield c
        app.state.limiter.enabled = True

    @pytest.fixture()
    def admin_pw(self, monkeypatch):
        monkeypatch.setattr(settings, "ADMIN_TOKEN", self.ADMIN_PW)

    def test_没票的三个口一律401(self, client, admin_pw):
        """§六第 7 条：不许读到主机名列表。那一列里躺着用户提交过的链接的站点。"""
        assert client.get(self.PATH).status_code == 401
        assert client.post(self.PATH, json={"host": "www.zhihu.com"}).status_code == 401
        assert client.delete(f"{self.PATH}/www.zhihu.com").status_code == 401

    def test_错票也不给读(self, client, admin_pw):
        # 全 ASCII：Authorization 头带非 ASCII 会被 httpx 当场抛 UnicodeEncodeError，
        # 那是传输层的错，量不到"这把票开不开得开门"。
        h = {"Authorization": "Bearer not.a.real.admin.session.token"}
        assert client.get(self.PATH, headers=h).status_code == 401
        assert client.post(self.PATH, json={"host": "www.zhihu.com"}, headers=h).status_code == 401

    def test_口令没配时是503不是放行(self, client, monkeypatch):
        """与其余那几个管理口同一条纪律：没配是"这个功能不可用"，不是"门槛消失"。

        显式把 `ADMIN_TOKEN` 清掉再判：本机 `.env` 里这一行是**有值的**（后台那一页早就上线了），
        拿"环境里恰好没配"当这条用例的前提，它会在别人机器上假红、在这里假绿。
        """
        monkeypatch.setattr(settings, "ADMIN_TOKEN", "")
        assert client.get(self.PATH).status_code == 503
        assert client.post(self.PATH, json={"host": "www.zhihu.com"}).status_code == 503
        assert client.delete(f"{self.PATH}/www.zhihu.com").status_code == 503

    def test_登录之后三个口都走得通(self, client, admin_pw, db):
        """加 → 列 → 移 → 列。钉的是这一栏真能管，不是只有 401 那一半。"""
        tok = client.post("/api/admin/login", json={"token": self.ADMIN_PW}).json()["session"]
        h = {"Authorization": f"Bearer {tok}"}
        assert client.post(self.PATH, json={"host": "https://weibo.com/1649679354/5353"}, headers=h).status_code == 200
        body = client.get(self.PATH, headers=h).json()
        assert [r["host"] for r in body["rows"]] == ["weibo.com"]
        assert body["rows"][0]["blocked"] is True and body["threshold"] == AUTO_THRESHOLD
        assert client.delete(f"{self.PATH}/weibo.com", headers=h).status_code == 200
        assert client.get(self.PATH, headers=h).json()["rows"] == []

    def test_坏形状的手工加句回400且回中文(self, client, admin_pw, db):
        tok = client.post("/api/admin/login", json={"token": self.ADMIN_PW}).json()["session"]
        r = client.post(self.PATH, json={"host": "localhost"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400 and re.search(r"[\u4e00-\u9fff]", r.json()["detail"])
        assert client.get(self.PATH, headers={"Authorization": f"Bearer {tok}"}).json()["rows"] == []

    def test_留空点加入回的是设计好那一句中文(self, client, admin_pw, db):
        """10-19 现网探针撞出来的，不是推演：`Field(min_length=1)` 抢在 `clean_host` 之前响，

        屏上出现的是「host不能为空」——操作者不认识那个英文词，而 `clean_host` 里那句
        「要填一个主机名，例如 www.example.com」在 HTTP 这一路**永远走不到**（只有用例读得到）。
        所以这一条钉的是"谁先响"，不是"有没有报错"：两者都返回错误，只有一个是人话。
        """
        h = self._hdr(client)
        r = client.post(self.PATH, json={"host": ""}, headers=h)
        assert r.status_code == 400, r.json()
        assert r.json()["detail"] == "要填一个主机名，例如 www.example.com"
        assert "host" not in r.json()["detail"]

    def test_缺那个键时屏上也不许漏出英文字段名(self, client, admin_pw, db):
        """钉的是"操作者看得懂"，不是"必然带字段名"。

        ⚠ 第一趟我把它写成"这句里要出现『主机名』"，红在判据上：`main.py` 那个 422 翻译里认的
        type 叫 `value_error.missing`，那是 **Pydantic v1 的名字**，v2 发的是 `missing`
        （现读日志 `{'loc': ['body','host'], 'type': 'missing'}`）⇒ 缺任何必填键时屏上永远是
        那句兜底话。今天这句是安全的（不含 `host`），但 `_FIELD_LABELS` 对"缺键"这一路**一个字节都没生效**，
        这是整仓的旧账、不只这一栏，已记进台账等他点，不由我给 `BlockIn` 单独加一枚取不到的标签。
        """
        r = client.post(self.PATH, json={}, headers=self._hdr(client))
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert "host" not in detail and re.search(r"[一-鿿]", detail), detail

    def test_长度这个数只许有一处(self, client, admin_pw, db):
        """`max_length=500` 那种"顺手加一道"就是第二份真相：它念 500、`clean_host` 念 253，

        改一边那天屏上那个数就是假的。这一条把上限钉回唯一出处 `MAX_HOST_LEN`。
        """
        r = client.post(self.PATH, json={"host": "z" * 300 + ".com"}, headers=self._hdr(client))
        assert r.status_code == 400, r.json()
        assert str(MAX_HOST_LEN) in r.json()["detail"], r.json()["detail"]


class Test八_迁移接在那一头之后:
    """真正的"库和模型一字不差"由 `test_quota_and_invite.py::Test迁移与模型对齐` 兜（它真跑一遍
    `alembic upgrade head`）。这里只钉链：这条新迁移**必须**接在现网头 `c7d1e4a9f380` 之后，
    而那条与 `b4e8a1c7d205` 是不是要一起跑，是规格 §七 那三选一，不由这条代码替他点。"""

    def test_新迁移的父级与列形状(self):
        path = BACKEND / "alembic" / "versions" / "f0a3b9c6d172_source_blocklist.py"
        src = path.read_text(encoding="utf-8")
        assert "revision: str = 'f0a3b9c6d172'" in src
        assert "down_revision: Union[str, Sequence[str], None] = 'c7d1e4a9f380'" in src, \
            "父级挪了就是往那条没批的链上又加一格"
        assert "op.create_table(" in src and "ux_source_blocklist_host" in src
        assert "sa.Column('fail_count', sa.Integer(), server_default='0', nullable=False)" in src

    def test_整条链只有一个头(self):
        """多头会让 `alembic upgrade head` 直接报"重复"，而那一趟是在现网跑的。"""
        heads = set()
        seen = {}
        for f in (BACKEND / "alembic" / "versions").glob("*.py"):
            text = f.read_text(encoding="utf-8")
            rev = re.search(r"^revision: str = ['\"]([^'\"]+)", text, re.M)
            down = re.search(r"^down_revision.*= ['\"]([^'\"]+)", text, re.M)
            if rev:
                seen[rev.group(1)] = down.group(1) if down else None
        parents = {p for p in seen.values() if p}
        heads = {r for r in seen if r not in parents}
        assert heads == {"f0a3b9c6d172"}, f"链上不止一个头（或这条没挂上）：{heads}"


class Test九_那一页真有这一栏:
    """接口绿了不等于屏上有这一栏——`render()` 里少一行调用，站长看到的就是"这功能没做"。
    与「卡片模板」／「数据」那两栏同一条判据的写法。"""

    def test_页面接线(self):
        body = (BACKEND / "app" / "api" / "routes" / "ops_page.py").read_text(encoding="utf-8").split("_PAGE", 1)[1]
        assert "function renderBlocklist" in body and "function loadBlocklist" in body
        assert "{ label: '来源黑名单', view: 'config', key: 'block:list' }" in body, "左栏那组里没这一条"
        assert 'id="block"' in body and "$('block')" in body
        assert "api('api/admin/source-blocklist')" in body, "读口没接上"
        assert "api('api/admin/source-blocklist', {" in body, "手工加那一句没接上"
        assert "api('api/admin/source-blocklist/' + encodeURIComponent(r.host), { method: 'DELETE' })" in body
        # 登录那一趟要把它一起拉（第三个读口；两处旧判据的锚已改前缀，这里补全串）
        assert "Promise.all([loadStats(), loadTemplates(), loadBlocklist()])" in body

    def test_卡真的挂进了那一格(self):
        """10-19 本机真点抓出来的那条：`renderBlocklist` 一路只往 `card` 自己身上挂，
        漏一句 `box.appendChild(card)` 的症状是"函数跑了、一个字没抛、屏上一片空"。
        静态钉子量不出"没挂"——所以这一条只算第二道，真判据是那支浏览器 harness 第一条。"""
        seg = self._page().split("function renderBlocklist", 1)[1].split("function blockRow", 1)[0]
        assert "box.appendChild(card)" in seg, "那一格永远是空的，而且不报错"

    def test_六个数一个都不省(self):
        """§五那张表逐列对：少一列管理员就少一个判断依据，而那正是「能管理」与「能看」的分别。"""
        body = self._page()
        for col in ("主机名", "失败次数", "最后一次 HTTP", "最后一次失败", "进名单方式", "移出"):
            assert col in body, f"那一栏少了「{col}」这一列"
        assert "r.source === 'manual'" in body and "还差 " in body, "自动／手工与「拦住了没」没一起说"

    def test_判拦不读页面里的那份比较(self):
        """`blocked` 读服务端回体；页面自己拿 `fail_count` 与阈值比就等于第二份判据。
        阈值哪天改一次，页面那句比较会变成一个**看着像真的**的假话。"""
        seg = self._page().split("function renderBlocklist", 1)[1].split("function blockRow", 1)[0]
        assert "r.blocked" in seg and "fail_count >= " not in seg

    def test_这一栏也守全页那条零innerHTML的纪律(self):
        seg = self._page().split("function renderBlocklist", 1)[1].split("function loadBlocklist", 1)[0]
        assert seg, "renderBlocklist 与 loadBlocklist 之间那段取空了，判据就空转了"
        for banned in ("innerHTML", "insertAdjacentHTML", "document.write"):
            assert banned not in seg

    @staticmethod
    def _page():
        src = (BACKEND / "app" / "api" / "routes" / "ops_page.py").read_text(encoding="utf-8")
        return src.split("_PAGE", 1)[1]
