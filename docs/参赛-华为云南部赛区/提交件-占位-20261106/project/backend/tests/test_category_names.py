"""分类名的两档显示值、默认四格、删格问话里那个篇数（站长 10-17 那一轮）。

六条不变量：
① `name` 仍是身份：建格与改名都**不许**把译文写回 `name`。
② 词表命中就当场填两列（零出网）；没命中那一列留 NULL，客户端回落到 `name`——
   这就是他那句"如果翻译不了，就维持原文"在数据层的形状。
③ 改名要把旧译名冲掉：留着旧值，英文界面会把「读书」那一格显示成上一个名字的 "Reading"
   之外的东西，比如 "Travel"。
④ 新用户四格：灵感／生活／工作／学习，两列写死、`sort_order` 依次排；幂等，不重复种。
⑤ 这一整套**不许发出出网请求**：10-19 他拍甲之后，出网那一半整个删掉了——
   这里钉的是"模块里没有异步口、两个写接口没挂后台任务"，红了就说明那一半又长回来。
⑥ 删格那句二次确认要报的篇数由 GET 一趟 GROUP BY 给齐；POST／PUT 没算过它，
   那一档就是 `None`，不许落一个假的 0。
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.category import Category
from app.models.user import User
from app.services import category_names


@pytest.fixture()
def client():
    app.state.limiter.enabled = False
    with TestClient(app) as c:
        yield c
    app.state.limiter.enabled = True


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


def hdr(user):
    return {"Authorization": f"Bearer {_create_token(user.id, user.generation)}"}


def new_user(db, tag):
    u = User(openid=f"cat-{tag}-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


class Test词表:
    def test_中文词查得到英文那一档(self):
        assert category_names.pair_from_glossary("旅行") == (None, "Travel")
        assert category_names.pair_from_glossary("学习") == (None, "Study")

    def test_英文词查得到中文那一档(self):
        assert category_names.pair_from_glossary("Work") == ("工作", None)
        assert category_names.pair_from_glossary("study") == ("学习", None)

    def test_一个英文词对应多个中文写法时反查表里不许有它(self):
        """旅行／旅游都译 Travel。反查回去只能猜一个，猜出来的那个名字他没起过——
        所以这种词**不进反查表**，宁可留空显示原文。"""
        assert "Travel" in set(category_names.GLOSSARY_ZH_EN.values())
        assert "Travel" not in category_names.GLOSSARY_EN_ZH
        assert category_names.pair_from_glossary("Travel") == (None, None)

    def test_拍定那四个词在整张表里各自唯一(self):
        """反查能不能成，全看这四个英文词有没有被别的中文词共用。
        今天往表里加一个"想法 → Ideas"，明天英文界面打 "Ideas" 就查不回中文了——
        而且红的是反查，正查一切照绿，看不出来。"""
        used: dict[str, list[str]] = {}
        for zh, en in category_names.GLOSSARY_ZH_EN.items():
            used.setdefault(en, []).append(zh)
        for zh, en in category_names.DEFAULT_CATEGORIES:
            assert used[en] == [zh], f"{en} 被 {used[en]} 共用，{zh} 的反查就没了"

    def test_表外与混合串一律两档都查不到(self):
        assert category_names.pair_from_glossary("噶玛噶举") == (None, None)
        assert category_names.pair_from_glossary("AI 笔记") == (None, None)
        assert category_names.pair_from_glossary("") == (None, None)

    def test_四格那四个词中英文互查都得到(self):
        for zh, en in category_names.DEFAULT_CATEGORIES:
            assert category_names.GLOSSARY_ZH_EN[zh] == en
            assert category_names.GLOSSARY_EN_ZH[en] == zh


class Test建格与改名往两列写什么:
    def _by_name(self, client, u, name):
        rows = client.get("/api/categories/", headers=hdr(u)).json()
        return next(r for r in rows if r["name"] == name)

    def test_表内中文词两列一次填齐(self, client, db):
        u = new_user(db, "g1")
        r = client.post("/api/categories/", json={"name": "旅行"}, headers=hdr(u))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "旅行", "译文不许写回身份那一列"
        assert body["name_zh"] == "旅行" and body["name_en"] == "Travel"
        assert self._by_name(client, u, "旅行")["name_en"] == "Travel", "GET 那趟要带得出两档"

    def test_表内英文词中文那一档补上(self, client, db):
        u = new_user(db, "g2")
        body = client.post("/api/categories/", json={"name": "Coffee"}, headers=hdr(u)).json()
        assert body["name"] == "Coffee"
        assert body["name_en"] == "Coffee", "他自己打的那一档原样落进对应列"
        assert body["name_zh"] == "咖啡"

    def test_表外那一档留空而不是空字符串(self, client, db):
        u = new_user(db, "g3")
        body = client.post("/api/categories/", json={"name": "噶玛噶举"}, headers=hdr(u)).json()
        assert body["name_zh"] == "噶玛噶举"
        assert body["name_en"] is None, "NULL 才是「没有这一档」；空串会让界面出现一个空标签"

    def test_改名把旧译名冲掉换成新名字的(self, client, db):
        u = new_user(db, "g4")
        first = client.post("/api/categories/", json={"name": "旅行"}, headers=hdr(u)).json()
        r = client.put(f"/api/categories/{first['id']}", json={"name": "读书"}, headers=hdr(u))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "读书"
        assert body["name_en"] == "Reading", "留着 Travel 就是拿上一个名字的译名糊新名字"
        assert "Travel" not in str(body)

    def test_改名改成表外的词两档回落到原文(self, client, db):
        u = new_user(db, "g5")
        first = client.post("/api/categories/", json={"name": "工作"}, headers=hdr(u)).json()
        body = client.put(f"/api/categories/{first['id']}", json={"name": "噶玛噶举"},
                          headers=hdr(u)).json()
        assert body["name_zh"] == "噶玛噶举"
        assert body["name_en"] is None

    def test_只改颜色不动两列(self, client, db):
        u = new_user(db, "g6")
        first = client.post("/api/categories/", json={"name": "生活"}, headers=hdr(u)).json()
        body = client.put(f"/api/categories/{first['id']}", json={"color": "#D2683F"},
                          headers=hdr(u)).json()
        assert body["name_zh"] == "生活" and body["name_en"] == "Life"


class Test新用户默认四格:
    def test_种下去就是那四个词(self, db):
        u = new_user(db, "s1")
        made = category_names.seed_default_categories(db, str(u.id))
        db.commit()
        assert made == 4
        rows = (db.query(Category).filter(Category.user_id == str(u.id))
                .order_by(Category.sort_order.asc()).all())
        assert [r.name for r in rows] == ["灵感", "生活", "工作", "学习"]
        assert [r.sort_order for r in rows] == [0, 1, 2, 3]
        assert [r.name_en for r in rows] == ["Ideas", "Life", "Work", "Study"], "站长挑的是乙"
        assert [r.name_zh for r in rows] == ["灵感", "生活", "工作", "学习"]

    def test_再叫一次不会种出第二套(self, db):
        u = new_user(db, "s2")
        category_names.seed_default_categories(db, str(u.id))
        db.commit()
        again = category_names.seed_default_categories(db, str(u.id))
        db.commit()
        assert again == 0
        assert db.query(Category).filter(Category.user_id == str(u.id)).count() == 4

    def test_他自己删过某一格再种也不补回来(self, db):
        """幂等按"名下已有那个名字"判，删掉的就是删掉了——每次登录又补一套，
        等于他的删除从来不算数（与预置笔记那条判据同一个理由）。"""
        u = new_user(db, "s3")
        category_names.seed_default_categories(db, str(u.id))
        db.commit()
        db.query(Category).filter(Category.user_id == str(u.id),
                                 Category.name == "灵感").delete()
        db.commit()
        assert db.query(Category).filter(Category.user_id == str(u.id)).count() == 3
        # 这一条只钉"删掉的那一格不会因为又调一次而凭空回来"：
        # 补种是登录那一路按 is_new_user 挡的，不靠这里现算。
        row = db.query(Category).filter(Category.user_id == str(u.id),
                                        Category.name == "灵感").first()
        assert row is None

    def test_四格与私密那一格互不挡路(self, client, db):
        u = new_user(db, "s5")
        category_names.seed_default_categories(db, str(u.id))
        db.commit()
        client.put("/api/user/private-password", json={"password": "246813"}, headers=hdr(u))
        names = [c["name"] for c in client.get("/api/categories/", headers=hdr(u)).json()]
        assert names[:4] == ["灵感", "生活", "工作", "学习"]
        assert "私密" in names, "私密那一格排在四格之后（它是跟着密码长出来的）"


class Test删格那句问话里的篇数:
    """站长 10-17「删除要二次确认」，问话要报"这一格里 N 篇会归到未分类"。
    这个 N 只能服务端给——客户端手上只有已经加载的那几十篇，拿它当 N 是假话。
    报小了最坏：人以为没几篇，删完一整格的归类全散了，而没有撤销口。"""

    def _mk(self, client, db, name, n):
        u = new_user(db, f"cnt-{name}-{n}")
        r = client.post("/api/categories/", json={"name": name}, headers=hdr(u))
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        for i in range(n):
            r = client.post("/api/notes/", headers=hdr(u),
                            json={"title": f"第{i}篇", "category_id": cid})
            assert r.status_code == 200, r.text
        return u, cid

    def _row(self, client, u, cid):
        rows = client.get("/api/categories/", headers=hdr(u)).json()
        return next(r for r in rows if r["id"] == cid)

    def test_格里有几篇就报几篇(self, client, db):
        u, cid = self._mk(client, db, "读书", 3)
        assert self._row(client, u, cid)["note_count"] == 3

    def test_空的格子报零(self, client, db):
        u, cid = self._mk(client, db, "旅行", 0)
        assert self._row(client, u, cid)["note_count"] == 0

    def test_不数别人家的也不数没归类的(self, client, db):
        u, cid = self._mk(client, db, "育儿", 2)
        other = new_user(db, "cnt-other")
        ocid = client.post("/api/categories/", json={"name": "读书"},
                           headers=hdr(other)).json()["id"]
        for i in range(3):
            client.post("/api/notes/", headers=hdr(other),
                        json={"title": f"别{i}", "category_id": ocid})
        client.post("/api/notes/", headers=hdr(u), json={"title": "没归类"})
        assert self._row(client, u, cid)["note_count"] == 2

    def test_新建与改名的响应里这个数是空而不是零(self, client, db):
        """GROUP BY 只在 GET 那一趟跑，POST／PUT 的响应里没算过它。
        写 0 就是"这一格一篇也没有"——改名那一格明明有，客户端照着 0 说话就成了假话。"""
        u = new_user(db, "cnt-none")
        cid = client.post("/api/categories/", json={"name": "笔记"}, headers=hdr(u)).json()["id"]
        client.post("/api/notes/", headers=hdr(u), json={"title": "一篇", "category_id": cid})
        body = client.put(f"/api/categories/{cid}", json={"name": "摘抄"}, headers=hdr(u)).json()
        assert body["note_count"] is None
        assert self._row(client, u, cid)["note_count"] == 1


class Test表外那一档绝不出网:
    """站长 10-17 拍的通道是"先查词表，表里没有才叫混元"；10-19 他把后半句撤了（甲）。
    撤的理由是现网实测（台账 §8.344「第四十七次部署」那一条）：这里复用的是**提炼**那一只云函数，它的回体固定成笔记那四栏，
    `items` 不在契约里、会被丢掉——那一趟永远回空表，每次还多烧一次调用与一次冷启动。
    所以这一类钉的是"表外那档就停在那里"＋"出网那一半不许再长回来"。"""

    ODD = "噶玛噶举"  # 词表里没有的一个真实专名：拿它当怪词，比造一串乱码更像他实际会起的名字

    def test_表外的中文名只落中文那一档(self, client, db):
        u = new_user(db, "odd-zh")
        body = client.post("/api/categories/", json={"name": self.ODD}, headers=hdr(u)).json()
        assert body["name_zh"] == self.ODD, "中文那一档原样落他打的字，客户端不需要回落"
        assert body["name_en"] is None, "表里没有 ⇒ 英文那一档就是没有，不许猜一个填进去"

    def test_表外的英文名只落英文那一档(self, client, db):
        u = new_user(db, "odd-en")
        body = client.post("/api/categories/", json={"name": "Karma Kagyu"}, headers=hdr(u)).json()
        assert body["name_en"] == "Karma Kagyu", "他自己打的那一档原样落进对应列"
        assert body["name_zh"] is None, "表里没有 ⇒ 中文那一档留 NULL，屏上仍显示他打的那几个字"

    def test_改名成表外的词两档跟着停住(self, client, db):
        """旧译名不属于新名字，必须清掉；清完不许再等谁补——甲之后没有第二趟。"""
        u = new_user(db, "odd-rename")
        cid = client.post("/api/categories/", json={"name": "旅行"}, headers=hdr(u)).json()["id"]
        body = client.put(f"/api/categories/{cid}", json={"name": self.ODD}, headers=hdr(u)).json()
        assert body["name"] == self.ODD
        assert body["name_zh"] == self.ODD, f"旧译名没换过来，实读 {body['name_zh']!r}"
        assert body["name_en"] is None, '旧的 "Travel" 必须清干净，留着就是替他的分类编一个他没起过的英文名'

    def test_格子不会因为没译名就没建出来(self, client, db):
        u = new_user(db, "odd-keep")
        r = client.post("/api/categories/", json={"name": self.ODD}, headers=hdr(u))
        assert r.status_code == 200, r.text
        rows = client.get("/api/categories/", headers=hdr(u)).json()
        assert [x["name"] for x in rows] == [self.ODD], "身份那一列不许被译文改写"

    def test_模块里没有出网那一半(self):
        gone = [n for n in ("call_model", "fill_missing", "fill_from_glossary", "display_names")
                if hasattr(category_names, n)]
        assert gone == [], f"这些名字又长回来了（{gone}）——甲撤的就是这一整半"
        assert not hasattr(category_names, "httpx"), "这一条链上不该绑任何一只 HTTP 客户端"
        assert not hasattr(category_names, "settings"), "不该再去读云函数的地址与凭据"

    def test_两个写接口不挂后台任务(self):
        import inspect

        from app.api.routes.categories import create_category, update_category

        for fn in (create_category, update_category):
            params = inspect.signature(fn).parameters
            assert "background" not in params, (
                f"{fn.__name__} 又接了 BackgroundTasks——建格那一下不该在响应之后再出一趟"
            )
        coros = [n for n, v in vars(category_names).items() if inspect.iscoroutinefunction(v)]
        assert coros == [], f"词表那一档是同步查表，不该有异步口（{coros}）"
