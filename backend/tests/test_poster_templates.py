"""卡片模板配方这条链路：名单对齐、种子校验、下发筛选、幂等与并发那条约束。

为什么这把尺子长得像"两边都查"：客户端那份解释器和后端这份校验器是同一套闭集的两份抄本，
中间只要漂一格，结果不是报错，而是"服务端放行了、客户端画不出来 → 整条退回包内那份"——
那种退回是静默的，站长会以为新模板生效了，实际用户看到的还是老卡片。所以第 1、3 两条
是整套里最要紧的：它们钉的是"两份真相其实是一份"。

跑法：cd backend && python -m pytest tests/test_poster_templates.py -q
"""
import json
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_poster.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.poster_template import PosterTemplate
from app.models.user import User
from app.services.poster_recipe import LIMITS, canonical_json, _depth, _nodes, validate_recipe, recipe_whitelist
from app.services.poster_templates import content_hash_of, seed_poster_templates, seed_rows

SEED_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed", "poster_whitelist.json")


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


@pytest.fixture()
def me(db):
    u = User(openid=f"poster-{int(time.time() * 1000)}")
    db.add(u)
    db.commit()
    return u


def good_recipe():
    """能画出东西的最小配方。每条"故意写坏"的用例都是从它改一个地方来的——
    不然一条坏配方红得可能是因为另一处本来就写错了，那这条判据就没牙了。"""
    return {
        "id": "t",
        "min_version": 1,
        "steps": [
            {"let": "s", "value": {"prim": "scheme", "args": {"name": "pop", "categoryId": 1}}},
            {"let": "lines", "value": {"prim": "fitLines", "args": {"text": {"var": "note.title"}, "maxW": 600, "n": 2, "size": 40}}},
            {"emit": {"k": "fill", "x": 0, "y": 0, "w": 750, "h": 900, "color": {"var": "s.bg"}}},
            {"emit": {"k": "text", "x": 40, "y": 120, "lines": {"var": "lines"}, "size": 40}},
            {"emit": {"k": "grad", "x": 0, "y": 0, "w": 750, "h": 400, "c1": {"var": "s.c1"}, "c2": {"var": "s.c2"},
                      "stops": [{"obj": {"at": 0, "color": {"var": "s.c1"}}}, {"obj": {"at": 1, "color": {"var": "s.c2"}}}]}},
            {"let": "height", "value": 900},
        ],
    }


def break_it(mutate):
    r = good_recipe()
    mutate(r)
    return r


# ---------------------------------------------------------------- 一、两份名单其实是一份

def test_python_名单与生成的种子白名单逐键相等():
    with open(SEED_JSON, encoding="utf-8") as f:
        js = json.load(f)
    mine = recipe_whitelist()
    assert set(js) == set(mine), f"键就对不上：只有 js 有 {set(js) - set(mine)} / 只有 python 有 {set(mine) - set(js)}"
    diffs = [k for k in js if json.dumps(js[k], sort_keys=True) != json.dumps(mine[k], sort_keys=True)]
    assert not diffs, f"这两个键两边不一致：{diffs}"


def test_种子白名单不是空壳():
    # 抽查：读回来一份"两边都空"的名单会让上面那条永真，所以这里单独钉一次内容有料。
    with open(SEED_JSON, encoding="utf-8") as f:
        js = json.load(f)
    assert len(js["op_keys"]) == 10
    assert len(js["prim_keys"]) == 30
    assert "vpunct" in js["op_keys"]["text"] and "tint" in js["op_keys"]["image"]
    assert js["prim_keys"]["signRow"] == ["x", "y", "maxW", "size", "avatarD", "onDark", "hasAvatar"]


# ---------------------------------------------------------------- 二、包内十套配方服务端也认

def test_种子十套全部通过校验():
    rows = seed_rows()
    assert len(rows) == 10, f"种子应当是十套，读到 {len(rows)}"
    bad = [(r["template_id"], validate_recipe(r["recipe"])) for r in rows]
    bad = [x for x in bad if x[1]]
    assert not bad, f"这几套在服务器这份校验里过不去：{bad}"


def test_hash两边算出来是同一个串():
    # 客户端"号没变就不重解析"靠这个串。两边算法对不上的话失效是静默的——只是缓存永远不命中。
    for r in seed_rows():
        assert content_hash_of(r["recipe"]) == r["content_hash"], f"{r['template_id']} 的 hash 两边不一致"


# ---------------------------------------------------------------- 三、坏配方逐条要拦

CASES = [
    ("未知 op", break_it(lambda r: r["steps"][2]["emit"].__setitem__("k", "notAnOp"))),
    ("未知字段", break_it(lambda r: r["steps"][2]["emit"].__setitem__("radius", 8))),
    ("未知原语", break_it(lambda r: r["steps"][0].__setitem__("value", {"prim": "noSuchPrim", "args": {}}))),
    ("原语参数名写错", break_it(lambda r: r["steps"][0]["value"]["args"].__setitem__("style", "pop"))),
    ("未知算子", break_it(lambda r: r["steps"][5].__setitem__("value", {"pow": [2, 3]}))),
    ("变长算子空参数", break_it(lambda r: r["steps"][5].__setitem__("value", {"+": []}))),
    ("定长算子多给一个", break_it(lambda r: r["steps"][5].__setitem__("value", {"/": [1, 2, 3]}))),
    ("没 let height", break_it(lambda r: r["steps"].pop(5))),
    ("解释器版本太新", break_it(lambda r: r.__setitem__("min_version", 99))),
    ("步型不认识", break_it(lambda r: r["steps"].append({"repeat": {"times": 3, "do": []}}))),
    ("多键的一步", break_it(lambda r: r["steps"].append({"emit": {"k": "fill"}, "let": "x"}))),
    ("each 少了 as", break_it(lambda r: r["steps"].append({"each": {"over": {"var": "lines"}, "do": []}}))),
    ("死 else 分支里藏坏 op", break_it(lambda r: r["steps"].append(
        {"if": {"cond": {"truthy": False}, "then": [], "else": [{"emit": {"k": "ghost", "x": 0}}]}}))),
    ("obj 给的是数组", break_it(lambda r: r["steps"][4]["emit"].__setitem__("stops", [{"obj": [0, 1]}]))),
    ("obj 值里藏未知算子", break_it(lambda r: r["steps"][4]["emit"].__setitem__("stops",
        [{"obj": {"at": 0, "color": {"nope": 1}}}]))),
    ("prim 那一项多带一个键", break_it(lambda r: r["steps"][0].__setitem__("value",
        {"prim": "blockName", "args": {}, "extra": 1}))),
    ("var 不是名字", break_it(lambda r: r["steps"][3]["emit"].__setitem__("lines", {"var": 7}))),
    ("配方不是对象", {"id": "t", "min_version": 1, "steps": "不是数组"}),
    ("emit 没写 k", break_it(lambda r: r["steps"][2]["emit"].pop("k"))),
]


@pytest.mark.parametrize("名字,配方", CASES, ids=[c[0] for c in CASES])
def test_坏配方逐条拦得住(名字, 配方):
    assert validate_recipe(配方), f"「{名字}」这条居然放行了"


def test_改一个数字之后照样是好的():
    # 反向对照：上面那一堆红必须是"名单拦的"，不是"这份最小配方本来就不通"。
    r = good_recipe()
    assert validate_recipe(r) == []
    r["steps"][2]["emit"]["w"] = 700
    assert validate_recipe(r) == []


def test_超过字节上限要拦():
    r = good_recipe()
    r["steps"][3]["emit"]["lines"] = ["很长的一段文字" * 3000]
    assert len(json.dumps(r, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()) > LIMITS["max_bytes"]
    assert any("字节" in e for e in validate_recipe(r))


def test_超过嵌套深度要拦():
    r = good_recipe()
    deep = 1
    term = {"var": "note.title"}
    for _ in range(LIMITS["max_depth"]):
        term = {"abs": [term]}
        deep += 1
    r["steps"].append({"let": "deep", "value": term})
    assert any("嵌套" in e for e in validate_recipe(r))


def test_超过节点上限要拦():
    # 探针只越"节点"这一条线：字节和深度都留在界内，否则红了不知道是哪条咬的。
    r = good_recipe()
    r["steps"].append({"let": "many", "value": {"lit": [1] * (LIMITS["max_nodes"] + 50)}})
    assert _nodes(r) > LIMITS["max_nodes"]
    assert _depth(r) <= LIMITS["max_depth"]
    assert len(canonical_json(r).encode("utf-8")) <= LIMITS["max_bytes"]
    hits = [e for e in validate_recipe(r) if "上限" in e]
    assert len(hits) == 1 and "节点" in hits[0], hits


def test_数法锚定_那份夹具三个数与客户端一致():
    # 同一份夹具在 docs/工具/验-模板配方可执行.js 里钉的是同样的三个数。
    # 两边任一处改了数法（代理对数成 6 字节、空对象算成 0 层……）就有一头红——
    # 数法不一致＝同一份配方服务端放行、客户端却整条丢掉，画面静默退回包内那一份。
    fixture = json.loads(
        '{"id":"锚","min_version":1,"steps":['
        '{"let":"height","value":{"+":[1,{"*":[2,{"lit":[]}]}]}},'
        '{"emit":{"k":"text","text":{"lit":"麦 🌾"},"box":{"obj":{}}}}]}'
    )
    assert len(canonical_json(fixture).encode("utf-8")) == 159
    assert _depth(fixture) == 9
    assert _nodes(fixture) == 20


def test_包内十套都没撞上那三条上界():
    # 上界是照这十套量出来的（方案 §五）。这条钉的是"现在还没把自己发的东西挡在门外"。
    for r in seed_rows():
        body = r["recipe"]
        assert len(canonical_json(body).encode("utf-8")) <= LIMITS["max_bytes"], r["template_id"]
        assert _depth(body) <= LIMITS["max_depth"], r["template_id"]
        assert _nodes(body) <= LIMITS["max_nodes"], r["template_id"]


# ---------------------------------------------------------------- 四、下发只给 live

def _seed(db):
    return seed_poster_templates(db)


def test_未登录拿不到模板(db, client, me):
    assert client.get("/api/poster/templates/").status_code == 401


def test_下发的只有live(db, client, me):
    _seed(db)
    assert db.query(PosterTemplate).filter(PosterTemplate.status == "live").count() == 10
    # 改一条 status → 秒级收回来，不发版（这就是那两个把手里的第二个）
    row = db.query(PosterTemplate).filter(PosterTemplate.template_id == "quote").first()
    row.status = "archived"
    db.commit()
    body = client.get("/api/poster/templates/", headers={"Authorization": f"Bearer {_create_token(me.id, me.generation)}"}).json()
    ids = [x["template_id"] for x in body]
    assert "quote" not in ids and len(ids) == 9
    # draft 根本不该出场
    db.add(PosterTemplate(template_id="newone", label="新", label_en="New", group_key="bold",
                          sort_order=5, recipe=good_recipe(), status="draft",
                          min_app_version="9.9.9", content_hash="0" * 64))
    db.commit()
    body = client.get("/api/poster/templates/", headers={"Authorization": f"Bearer {_create_token(me.id, me.generation)}"}).json()
    assert "newone" not in [x["template_id"] for x in body]


def test_响应里带配方与hash且按sort_order排(db, client, me):
    _seed(db)
    body = client.get("/api/poster/templates/", headers={"Authorization": f"Bearer {_create_token(me.id, me.generation)}"}).json()
    assert [x["sort_order"] for x in body] == sorted(x["sort_order"] for x in body)
    first = body[0]
    assert set(first) == {"template_id", "label", "label_en", "group_key", "sort_order",
                          "min_app_version", "content_hash", "recipe"}
    assert first["recipe"]["steps"] and isinstance(first["content_hash"], str) and len(first["content_hash"]) == 64


def test_灌两次不会多出行(db):
    a = _seed(db)
    assert a["inserted"] == 10 and a["archived"] == 0
    b = _seed(db)
    # 第二次应当一条都不新增：幂等靠的就是 content_hash 相等，而不是"按 id 覆盖一遍"
    assert b["inserted"] == 0, f"第二次还在插新行：{b}"
    assert b["unchanged"] == 10
    assert db.query(PosterTemplate).count() == 10


def test_内容变了就新增一版并把旧的收档(db):
    _seed(db)
    rows = seed_rows()
    target = [r for r in rows if r["template_id"] == "quote"][0]
    target["recipe"]["steps"].append({"let": "unused", "value": 1})
    target["content_hash"] = content_hash_of(target["recipe"])
    path = "/tmp/seed_changed.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    rep = seed_poster_templates(db, path)
    assert rep["archived"] == 1 and rep["inserted"] == 1
    live = db.query(PosterTemplate).filter(PosterTemplate.status == "live", PosterTemplate.template_id == "quote").all()
    old = db.query(PosterTemplate).filter(PosterTemplate.status == "archived", PosterTemplate.template_id == "quote").all()
    assert len(live) == 1 and len(old) == 1
    # 老行必须留着：已经拿到那份配方的老包要一直读得懂，删行等于把历史抹掉
    assert old[0].content_hash != live[0].content_hash


def test_同一个template_id不许有两行live(db):
    _seed(db)
    dup = db.query(PosterTemplate).filter(PosterTemplate.template_id == "card").first()
    db.add(PosterTemplate(template_id="card", label="另一版", label_en="Other", group_key="bold",
                          sort_order=9, recipe=good_recipe(), status="live",
                          min_app_version="1.0.0", content_hash="a" * 64))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert dup.status == "live"


def test_配方自己的id与这行不符就整行不收(db):
    # 每一层都合法、hash 也算得出来，唯独"名字对、内容不对"：把 card 那份配方贴到 quote 这行上。
    # 服务端不拦的话客户端会收下（客户端那道同规则的对照组见 docs/工具/验-模板配方下发.js），
    # 结果是列表里那一格写着「摘句」、画出来是「玉版宣」——画面不报错，没人会发现。
    rows = seed_rows()
    card = [r for r in rows if r["template_id"] == "card"][0]
    quote = [r for r in rows if r["template_id"] == "quote"][0]
    quote["recipe"] = card["recipe"]
    quote["content_hash"] = content_hash_of(card["recipe"])
    path = "/tmp/seed_id_mismatch.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    rep = seed_poster_templates(db, path)
    assert len(rep["rejected"]) == 1 and rep["rejected"][0].startswith("quote:")
    assert rep["inserted"] == 9
    assert db.query(PosterTemplate).filter(PosterTemplate.template_id == "quote").count() == 0


def test_脏种子一条都不落库(db):
    rows = seed_rows()
    # 加一步而不是改现有那一步：现成的第一步是 `let 'cardX' = 40`，改它的 value 会撞上类型；
    # 而"末尾多一个未知原语"正是改配方的人最容易敲出来的那种错。
    rows[0]["recipe"]["steps"].append({"let": "oops", "value": {"prim": "noSuchPrim", "args": {}}})
    path = "/tmp/seed_dirty.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    rep = seed_poster_templates(db, path)
    assert rep["inserted"] == 9 and len(rep["rejected"]) == 1
    assert db.query(PosterTemplate).count() == 9
