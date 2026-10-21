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
from app.services.poster_templates import content_hash_of, extra_files, seed_poster_templates, seed_rows

SEED_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed", "poster_whitelist.json")


def _live_rows():
    """种子里真会下发的那几条。种子文件本身只许 live（生成器那条规矩），
    但 live 这个数还是从数据里数出来，不在这里再抄一个 10。"""
    return [r for r in seed_rows() if r.get("status", "live") == "live"]



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
    不然一条坏配方红得可能是因为另一处本来就写错了，那这条判据就没牙了。
    起手那笔（steps[2]）是 10-20 N11 那道闸门要的整幅底：w/h 必须取 var W／var height，
    写死数字在这里过不了。"""
    return {
        "id": "t",
        "min_version": 1,
        "steps": [
            {"let": "s", "value": {"prim": "scheme", "args": {"name": "pop", "categoryId": 1}}},
            {"let": "lines", "value": {"prim": "fitLines", "args": {"text": {"var": "note.title"}, "maxW": 600, "n": 2, "size": 40}}},
            {"emit": {"k": "fill", "x": 0, "y": 0, "w": {"var": "W"}, "h": {"var": "height"}, "color": {"var": "s.bg"}}},
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

def test_种子全部通过校验_且数据模板那几条与盘上文件对得上():
    rows = seed_rows()
    ids = [r["template_id"] for r in rows]
    assert len(ids) == len(set(ids)), f"种子里同一个 template_id 出现了两次：{ids}"
    stems = {f[:-len(".json")] for f in extra_files()}
    extras = [t for t in ids if t in stems]
    # "十套"这个数在这里是故意写死的（与 test_种子白名单不是空壳 同一用法，防止两边都空掉还互相圆场）。
    # 这一条查的是**种子 → 盘上**那个方向：种子里出现一条盘上没文件的数据模板 = 有人手改了生成物。
    # 反方向（盘上有文件、种子里还没有）不在这里红——流水线看图之前本来就是这个样子，
    # 那一头由 docs/工具/验-模板配方可执行.js 盯着（它才读 TPL_PENDING）。
    assert len(rows) - len(extras) == 10, f"种子 {len(rows)} 条，其中对得上盘上文件的 {len(extras)} 条，剩下的应当正好是包内那十套"
    assert all(r.get("status", "live") == "live" for r in rows if r["template_id"] in stems), \
        "数据模板那几条带非 live 状态进了种子（生成器只放 live，这行是手搓出来的）"
    bad = [(r["template_id"], validate_recipe(r["recipe"])) for r in rows]
    bad = [x for x in bad if x[1]]
    assert not bad, f"这几套在服务器这份校验里过不去：{bad}"


def test_hash两边算出来是同一个串():
    # 客户端"号没变就不重解析"靠这个串。两边算法对不上的话失效是静默的——只是缓存永远不命中。
    for r in seed_rows():
        assert content_hash_of(r["recipe"]) == r["content_hash"], f"{r['template_id']} 的 hash 两边不一致"


# ---------------------------------------------------------------- 三、坏配方逐条要拦

CASES = [
    # 每条都带"必须是哪一句红"：10-20 加了"第一笔得是整幅底"那道闸门（N11）之后，
    # 只验"有报错"就分不清是名单咬的还是闸门咬的——跟客户端那把尺子同一个规矩。
    ("未知 op", break_it(lambda r: r["steps"][2]["emit"].__setitem__("k", "notAnOp")), "notAnOp"),
    ("未知字段", break_it(lambda r: r["steps"][2]["emit"].__setitem__("radius", 8)), "没有字段「radius」"),
    ("未知原语", break_it(lambda r: r["steps"][0].__setitem__("value", {"prim": "noSuchPrim", "args": {}})), "noSuchPrim"),
    ("原语参数名写错", break_it(lambda r: r["steps"][0]["value"]["args"].__setitem__("style", "pop")), "没有参数「style」"),
    ("未知算子", break_it(lambda r: r["steps"][5].__setitem__("value", {"pow": [2, 3]})), "不认的算子「pow」"),
    ("变长算子空参数", break_it(lambda r: r["steps"][5].__setitem__("value", {"+": []})), "算子「+」至少要一个参数"),
    ("定长算子多给一个", break_it(lambda r: r["steps"][5].__setitem__("value", {"/": [1, 2, 3]})), "算子「/」要 2 个参数"),
    ("没 let height", break_it(lambda r: r["steps"].pop(5)), "必须有一步 let 出 height"),
    ("解释器版本太新", break_it(lambda r: r.__setitem__("min_version", 99)), "版解释器"),
    ("步型不认识", break_it(lambda r: r["steps"].append({"repeat": {"times": 3, "do": []}})), "不认的步型"),
    ("多键的一步", break_it(lambda r: r["steps"].append({"emit": {"k": "fill"}, "let": "x"})), "let 那一步里多了 emit"),
    ("each 少了 as", break_it(lambda r: r["steps"].append({"each": {"over": {"var": "lines"}, "do": []}})), "each 少了 as"),
    ("死 else 分支里藏坏 op", break_it(lambda r: r["steps"].append(
        {"if": {"cond": {"truthy": False}, "then": [], "else": [{"emit": {"k": "ghost", "x": 0}}]}})), "ghost"),
    ("obj 给的是数组", break_it(lambda r: r["steps"][4]["emit"].__setitem__("stops", [{"obj": [0, 1]}])), "obj 得是个键值对象"),
    ("obj 值里藏未知算子", break_it(lambda r: r["steps"][4]["emit"].__setitem__("stops",
        [{"obj": {"at": 0, "color": {"nope": 1}}}])), "不认的算子「nope」"),
    ("prim 那一项多带一个键", break_it(lambda r: r["steps"][0].__setitem__("value",
        {"prim": "blockName", "args": {}, "extra": 1})), "原语那一项里多了 extra"),
    ("var 不是名字", break_it(lambda r: r["steps"][3]["emit"].__setitem__("lines", {"var": 7})), "var 得是个名字"),
    ("配方不是对象", {"id": "t", "min_version": 1, "steps": "不是数组"}, "steps 得是非空数组"),
    ("emit 没写 k", break_it(lambda r: r["steps"][2]["emit"].pop("k")), "（没写 k）"),
    # ---- N11 那两条新闸门（客户端 posterRecipe.js 的 validate 同文同序）----
    ("一笔都不落", break_it(lambda r: r.__setitem__(
        "steps", [{"let": "height", "value": 900}, {"let": "s", "value": {"lit": 1}}])), "没有一笔真的落笔"),
    ("起手那笔不铺满整张", break_it(lambda r: r["steps"][2]["emit"].__setitem__("w", 750)), "第一笔不是盖住整张卡的底"),
    ("起手那笔是带圆角的 rrect（字段表含 r，铺不满）", break_it(lambda r: r.__setitem__("steps", [
        r["steps"][0], r["steps"][1],
        {"emit": {"k": "rrect", "x": 0, "y": 0, "w": {"var": "W"}, "h": {"var": "height"}, "r": 6, "fill": {"var": "s.bg"}}},
        r["steps"][5]])), "第一笔不是盖住整张卡的底"),
    ("起手那笔是 emitOne（几何要跑出来才知道，静态证不了铺满）", break_it(lambda r: r.__setitem__("steps", [
        r["steps"][0], r["steps"][1],
        {"emitOne": {"lit": {"k": "fill", "x": 0, "y": 0, "w": 750, "h": 900, "color": "#fff"}}},
        r["steps"][5]])), "第一笔不是盖住整张卡的底"),
]


@pytest.mark.parametrize("名字,配方,应当报", CASES, ids=[c[0] for c in CASES])
def test_坏配方逐条拦得住(名字, 配方, 应当报):
    errs = validate_recipe(配方)
    assert errs, f"「{名字}」这条居然放行了"
    assert any(应当报 in e for e in errs), f"「{名字}」红是红了，报的却是别的：{errs}"


def test_坏配方每条各自只越一条线():
    # 上面那批必须"只因为自己那一句红"：夹具改坏了别处，那条判据就没在测它说的那件事。
    # 唯一例外是"起手不铺满"那三条——它们同时也会让别的检查失效，所以这里按条数放宽到 ≤2。
    for 名字, 配方, 应当报 in CASES:
        errs = validate_recipe(配方)
        assert len(errs) <= 2, f"「{名字}」一次报出 {len(errs)} 条：{errs}"


def test_改一个数字之后照样是好的():
    # 反向对照：上面那一堆红必须是"名单拦的"，不是"这份最小配方本来就不通"。
    # 动的是第二层那笔的坐标和 height，不是起手那笔的 w／h（那两个只许取 var W／var height）。
    r = good_recipe()
    assert validate_recipe(r) == []
    r["steps"][3]["emit"]["x"] = 60
    r["steps"][5]["value"] = 1000
    assert validate_recipe(r) == []


def test_起手那笔改回整幅底就放行():
    # 反向对照 N11：这条闸门不是"见 emit 就咬"，是只认那一笔字面量写法的整幅底。
    r = good_recipe()
    r["steps"][2]["emit"]["w"] = 750
    assert any("第一笔不是" in e for e in validate_recipe(r))
    r["steps"][2]["emit"]["w"] = {"var": "W"}
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


def test_种子里每一套都没撞上那三条上界():
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
    assert db.query(PosterTemplate).filter(PosterTemplate.status == "live").count() == len(_live_rows())
    # 改一条 status → 秒级收回来，不发版（这就是那两个把手里的第二个）
    row = db.query(PosterTemplate).filter(PosterTemplate.template_id == "quote").first()
    row.status = "archived"
    db.commit()
    body = client.get("/api/poster/templates/", headers={"Authorization": f"Bearer {_create_token(me.id, me.generation)}"}).json()
    ids = [x["template_id"] for x in body]
    assert "quote" not in ids and len(ids) == len(_live_rows()) - 1
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
    assert a["inserted"] == len(seed_rows()) and a["archived"] == 0
    b = _seed(db)
    # 第二次应当一条都不新增：幂等靠的就是 content_hash 相等，而不是"按 id 覆盖一遍"
    assert b["inserted"] == 0, f"第二次还在插新行：{b}"
    assert b["unchanged"] == len(seed_rows())
    assert db.query(PosterTemplate).count() == len(seed_rows())


def test_种子行带draft也不许每次部署多插一行(db, tmp_path):
    # 幂等判据原先硬写 status == 'live'：来一行 draft 就永远查不着自己，
    # 跑一次多一行，库里能攒出五份同 hash 的 draft。生成器已经不放 draft 进种子，
    # 这一条钉的是 seed_poster_templates(db, path) 还能吃手搓文件那半扇门。
    rows = json.loads(json.dumps(seed_rows()))
    rows[0]["status"] = "draft"
    p = str(tmp_path / "seed_draft.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    a = seed_poster_templates(db, p)
    b = seed_poster_templates(db, p)
    assert a["inserted"] == len(rows) and a["unchanged"] == 0
    assert b["inserted"] == 0, f"第二次还在插：{b}"
    assert b["unchanged"] == len(rows)
    tid = rows[0]["template_id"]
    assert db.query(PosterTemplate).filter(PosterTemplate.template_id == tid).count() == 1


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
    assert rep["inserted"] == len(seed_rows()) - 1
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
    assert rep["inserted"] == len(seed_rows()) - 1 and len(rep["rejected"]) == 1
    assert db.query(PosterTemplate).count() == len(seed_rows()) - 1


# ---------------------------------------------------- 五、那份清单（10-21 站长「部署」这一刀）

MANIFEST = "/api/poster/templates/manifest"
LIST = "/api/poster/templates/"


def _hdr(me):
    return {"Authorization": f"Bearer {_create_token(me.id, me.generation)}"}


def test_清单口未登录也一样拿不到(db, client):
    # 这一口只回 id 与 hash，理论上"不算内容"，但它照样数得出台上架了几套、叫什么。
    # 鉴权必须与整批口同一道，不许因为"轻"就单开一扇门。
    assert client.get(MANIFEST).status_code == 401


def test_清单与整批逐行同序同值(db, client, me):
    # 这一条是整个"先问清单"设计成立的前提：客户端拿这条串跟本机缓存**逐字比**，
    # 两边口径错一格（少一行、换一行序、分隔符不一样）症状都是"每次都去拉整批"——
    # 白跑那一趟 50 KB，比不加这一口更慢，而且一声不响。
    _seed(db)
    rows = client.get(LIST, headers=_hdr(me)).json()
    body = client.get(MANIFEST, headers=_hdr(me)).json()
    assert body["manifest"].split("\n") == [f'{r["template_id"]}:{r["content_hash"]}' for r in rows]
    assert body["rows"] == len(rows)


def test_清单里没有配方所以真的很便宜(db, client, me):
    # 站长那句话是"这个逻辑应该不会增加时长"。这条把"便宜"量出来：
    # 清单里一个字都不许带配方，否则这一问跟整批拉回来一样贵，那一趟就白省了。
    _seed(db)
    body = client.get(MANIFEST, headers=_hdr(me)).json()
    assert "steps" not in body["manifest"] and "prim" not in body["manifest"]
    assert len(body["manifest"].encode("utf-8")) < 2048
    assert len(body["manifest"].encode("utf-8")) * 10 < len(
        client.get(LIST, headers=_hdr(me)).content)


def test_收回去那一套当天就从清单里消失(db, client, me):
    # 撤回走 status，不发版（§四 第 5 条）。清单这一头必须跟着掉，
    # 否则客户端比出"没变化"，本地那份永远留着——撤回看起来没生效。
    _seed(db)
    before = client.get(MANIFEST, headers=_hdr(me)).json()["manifest"]
    row = db.query(PosterTemplate).filter(PosterTemplate.template_id == "quote").first()
    row.status = "archived"
    db.commit()
    body = client.get(MANIFEST, headers=_hdr(me)).json()
    after = body["manifest"]
    # 两头都取 `["manifest"]` 再比：第一版写的是一边字符串一边整份字典，`!=` 恒真，
    # 拿"清单回常量"那种坏样本去钉它压根不红（10-21 反向取证抓出来的）。
    assert before != after, f"收了 quote 那一条，清单却说没变化：客户端据此不会去拉整批，本地那份永远留着"
    assert not any(l.startswith("quote:") for l in after.split("\n"))
    assert body["rows"] == len(_live_rows()) - 1


def test_配方换版清单跟着变(db, client, me):
    # 另一头也得钉：内容变了 hash 就得变，不然这一问会说"没变化"，新配方永远下不去。
    _seed(db)
    before = client.get(MANIFEST, headers=_hdr(me)).json()["manifest"]
    row = db.query(PosterTemplate).filter(PosterTemplate.template_id == "quote").first()
    row.recipe["steps"].append({"let": "unused", "value": 1})
    row.content_hash = content_hash_of(row.recipe)
    db.commit()
    after = client.get(MANIFEST, headers=_hdr(me)).json()["manifest"]
    assert before != after
    assert len([l for l in after.split("\n") if l.startswith("quote:")]) == 1


def test_draft那一行不进清单(db, client, me):
    _seed(db)
    before = client.get(MANIFEST, headers=_hdr(me)).json()
    db.add(PosterTemplate(template_id="newone", label="新", label_en="New", group_key="bold",
                          sort_order=5, recipe=good_recipe(), status="draft",
                          min_app_version="9.9.9", content_hash="0" * 64))
    db.commit()
    after = client.get(MANIFEST, headers=_hdr(me)).json()
    assert before["manifest"] == after["manifest"] and "newone" not in after["manifest"]
    # 还在改的那一套不许让所有人每次都去拉整批：清单得对 draft 免疫。
    assert after["rows"] == before["rows"]


def test_表空时清单是空串而不是null(db, client, me):
    # 客户端那一头认的是"拿不到清单就去拉整批"。这里回 null／回 500 都会被当成
    # "读不出来"，于是每一次开窗都白拉一整批——正是 ⑪-3 那条判据挡的同一型毛病。
    body = client.get(MANIFEST, headers=_hdr(me)).json()
    assert body["manifest"] == "" and body["rows"] == 0

