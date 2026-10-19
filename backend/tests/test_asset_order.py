"""配图拖动排序这一刀：`assets.sort_order` 与那个 reorder 口（PRD §8.363）。

跑法：cd backend && .venv/bin/python -m pytest tests/test_asset_order.py -q

站长 10-19 原话「小改动，笔记编辑时候，配图要支持拖动排序，方便用户选择好的图片作为头图」。
"方便选头图"这半句是这一刀的落点，所以这批尺子量的不是"接口收不收得下那串 id"，
而是**他拖完那一瞬，屏上五处读图的地方是不是都换了**：编辑那一排的先后、列表右侧那枚封面、
详情窗那张大图、卡片模板的大图位、公开页那一批。五处吃的是同一个 `order_by_note()`，
少改一处不报错、只是头图不换——正是看不见的那类错。

三条最要紧的：
- **存量不许换头图**：迁移给老行留 0，排序第一档处处相等 ⇒ 退回 `id` 升序＝这一刀之前的样子。
  这一条反向钉住"上线当天所有人的封面集体跳一张"。
- **新补的那张不许冒到第一格**：排过序的篇里新登记的行走 `next_sort_order`（最大值 +1）。
  吃模型默认 0 就会插到人家前面，而他什么都没拖。
- **0 只表示"从没排过"**：reorder 写的序号从 1 起。第一名也拿 0，混着读的篇就按 `id` 决胜，
  等于他拖了没生效，而且界面上一眼看过去是对的。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_asset_order.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.note import Note
from app.models.user import User


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


def mk_user(tag):
    """一个账号 + 一篇笔记 + 一个能直接打接口的头。"""
    u = User(openid=f"order-{tag}-{int(time.time() * 1000)}")
    db2 = SessionLocal()
    db2.add(u)
    db2.commit()
    n = Note(user_id=str(u.id), title=f"{tag} 的笔记", source_type="manual")
    db2.add(n)
    db2.commit()
    out = {"user": u, "note": n.id, "hdr": {"Authorization": f"Bearer {_create_token(u.id, u.generation)}"}}
    db2.close()
    return out


@pytest.fixture()
def two_users():
    return {"a": mk_user("a"), "b": mk_user("b")}


def fid(tag, i):
    return f"cloud://pytest-env.xxxx/images/{tag}/{i}.jpg"


def bind_three(client, who, tag="a"):
    """三张图，地址尾巴分别是 0 / 1 / 2 —— 断言时直接认这个后缀，不认库里的数字 id。

    `tag` 必须跟着账号换：`object_key` 是全表认一人的（`_assert_ours`），两个账号绑同一串
    地址，第二个人当场撞"图片已归到别的笔记"，测的就不是排序而是归属了。
    """
    items = [{"file_id": fid(tag, i), "size": 400 * 1024} for i in range(3)]
    r = client.post(f"/api/notes/{who['note']}/assets", json={"items": items}, headers=who["hdr"])
    assert r.status_code == 200, r.text
    return r.json()


def tail(url):
    """`cloud://…/x/2.jpg` → "2"。名单读起来一眼看得懂，比一串自增 id 好对账。"""
    return url.rsplit("/", 1)[-1].split(".")[0]


def ids_of(rows):
    return [tail(r["cloud_url"]) for r in rows]


def order_ids(db, who):
    """库里这一篇按**服务端排序键**读回来的先后（不借接口的口，独立量一遍）。"""
    s = SessionLocal()
    try:
        rows = (s.query(Asset)
                .filter(Asset.note_id == who["note"])
                .order_by(Asset.sort_order.asc(), Asset.id.asc())
                .all())
        return [tail(r.object_key) for r in rows]
    finally:
        s.close()


def sort_map(db, who):
    s = SessionLocal()
    try:
        return {tail(r.object_key): r.sort_order
                for r in s.query(Asset).filter(Asset.note_id == who["note"]).all()}
    finally:
        s.close()


def b_id(db, who, t):
    """按地址尾巴取那一张的**行 id**——跨账号那一条要拿别人那一篇的 id 塞进自己的名单。"""
    s = SessionLocal()
    try:
        return next(r.id for r in s.query(Asset).filter(Asset.note_id == who["note"]).all()
                    if tail(r.object_key) == t)
    finally:
        s.close()


def reorder(client, who, ids, extra=None):
    hdr = dict(who["hdr"])
    hdr.update(extra or {})
    return client.post(f"/api/notes/{who['note']}/assets/reorder", json={"ids": ids}, headers=hdr)


def cover_of(client, who):
    """列表响应里那枚封面（`_attach_covers` 走的就是 `order_by_note()`）。"""
    rows = client.get("/api/notes/", params={"limit": 100}, headers=who["hdr"]).json()
    mine = [r for r in rows if r["id"] == who["note"]]
    assert len(mine) == 1, f"这篇没在列表里读到，测不到封面：{[r['id'] for r in rows]}"
    return mine[0].get("cover_file_id")


# ---------------------------------------------------------------- 一、不拖的时候，一切照旧

def test_从没排过的篇_先后与头图都仍是上传那一序(client, db, two_users):
    """不拖的时候一切照旧：新登记的行按 `next_sort_order` 拿到 1..N，先后＝上传序。

    这一条红的时候说的假话最贵：上线当天全站每一篇老笔记的封面集体换一张，而没有人动过任何东西。
    """
    a = two_users["a"]
    rows = bind_three(client, a)
    assert ids_of(rows) == ["0", "1", "2"]
    assert order_ids(db, a) == ["0", "1", "2"], "库里按排序键读回来必须与接口一致"
    assert tail(cover_of(client, a)) == "0", "头图还是最早那一张"


def test_存量那批全带零_排序退回上传那一序(client, db, two_users):
    """迁移给老行留的就是 0（`server_default='0'`），这一态今天现网全部笔记都是。

    0 处处相等 ⇒ 决胜键退回 `id` 升序＝这一刀之前的样子。这一条与上面那条一对正反：
    上面钉"新写的行按 1..N 排好"，这一条钉"库里躺着 0 的那些行一张封面都不许换"。
    """
    a = two_users["a"]
    bind_three(client, a)
    s = SessionLocal()
    try:  # 把这三行改回"迁移刚跑完"那个样子：这一列全是 0
        s.query(Asset).filter(Asset.note_id == a["note"]).update({"sort_order": 0}, synchronize_session=False)
        s.commit()
    finally:
        s.close()
    assert set(sort_map(db, a).values()) == {0}, "先把这一篇摆成存量态，否则下面测的是别的东西"
    assert order_ids(db, a) == ["0", "1", "2"], "全 0 时按 id 升序＝上传那一序，头图不许换"
    assert tail(cover_of(client, a)) == "0"


# ---------------------------------------------------------------- 二、拖一次，五处跟着换

def test_拖一次_列表回体与头图一起换(client, db, two_users):
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    r = reorder(client, a, [rows["2"], rows["0"], rows["1"]])
    assert r.status_code == 200, r.text
    assert ids_of(r.json()) == ["2", "0", "1"], "回体就是新序：客户端不用再读一次列表"
    assert order_ids(db, a) == ["2", "0", "1"], "库里按排序键读回来与回体一字不差"
    again = client.get(f"/api/notes/{a['note']}/assets", headers=a["hdr"]).json()
    assert ids_of(again) == ["2", "0", "1"], "列表口（详情窗那张大图、卡片大图位读的都是它）"
    assert tail(cover_of(client, a)) == "2", "列表右侧那枚封面跟着换——他拖的就是为这个"


def test_公开页那一批也跟着换序(client, db, two_users):
    """`shares.py` 的 `_public_assets` 是第四个吃 `order_by_note()` 的口。

    单列一条是因为它最容易被漏：那是另一个文件、另一个响应模型（只有 `cloud_url` 一栏），
    少改它不会有任何地方报错，症状是"我自己看着图是新的，别人扫码打开还是旧的那张在前"。
    """
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    tok = client.post("/api/shares/", json={"note_id": a["note"]}, headers=a["hdr"]).json()["token"]
    before = [tail(x["cloud_url"]) for x in client.get(f"/api/shares/{tok}").json()["assets"]]
    assert before == ["0", "1", "2"], before
    reorder(client, a, [rows["2"], rows["1"], rows["0"]])
    after = [tail(x["cloud_url"]) for x in client.get(f"/api/shares/{tok}").json()["assets"]]
    assert after == ["2", "1", "0"], "公开页与私有视图不同序＝两处各挑一张，那句老注释就作废了"


def test_序号从一起_零只表示从没排过(client, db, two_users):
    """钉住"第一名拿 1 不拿 0"这一条。

    写成 0 也能跑，但混着读的篇（拖过的行＋没拖过的行）会挤在同一个 0 上按 `id` 决胜，
    症状是"我拖了，头图没换"，而且屏上一眼看过去顺序是对的。
    """
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    reorder(client, a, [rows["2"], rows["0"], rows["1"]])
    m = sort_map(db, a)
    assert m == {"2": 1, "0": 2, "1": 3}, f"第一名必须是 1：{m}"


# ---------------------------------------------------------------- 三、拖完之后再补图，不许冒头

def test_排过序再补一张_新的排在最后(client, db, two_users):
    """这一条是 `next_sort_order` 存在的全部理由。

    新行吃模型默认 0 ⇒ 落在 1..N 之前 ⇒ 他给一篇笔记挑好了头图，第二天从链接存进一张正文图，
    封面自己换了。而这一趟他谁都没拖。
    """
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    reorder(client, a, [rows["2"], rows["0"], rows["1"]])
    assert tail(cover_of(client, a)) == "2"
    新 = client.post(f"/api/notes/{a['note']}/assets",
                     json={"items": [{"file_id": "cloud://pytest-env.xxxx/images/x/9.jpg", "size": 400 * 1024}]},
                     headers=a["hdr"]).json()
    assert ids_of(新) == ["9"], "登记口回的还是这次绑上的那几张，不是整篇"
    assert order_ids(db, a) == ["2", "0", "1", "9"], "新那张追加在最后"
    assert tail(cover_of(client, a)) == "2", "头图不许因为补了一张图就换人"


def test_补绑同一张不许把拖好的顺序打回原形(client, db, two_users):
    """幂等那条（B 链"下次进详情页补绑"）撞上排序：已存在的行只改尺寸，不改位置。"""
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    reorder(client, a, [rows["2"], rows["0"], rows["1"]])
    again = client.post(f"/api/notes/{a['note']}/assets",
                        json={"items": [{"file_id": fid("a", 2), "size": 999 * 1024}]},
                        headers=a["hdr"])
    assert again.status_code == 200, again.text
    assert order_ids(db, a) == ["2", "0", "1"], "补绑一次就把顺序打回 0 ⇒ 他白拖一趟"


# ---------------------------------------------------------------- 四、名单不全 / 混进别人的

def test_名单漏了一行_没点名的退到最后而不是留在原地(client, db, two_users):
    """点名那几张占掉 1..N，**没点名的必须跟着往后挪**，不许留着它身上那个旧序号。

    留着的错法很具体：这一行原来排第一（序号 1），这次名单里没有它，它就与新写的 1 撞在同一个数上，
    由 `id` 决胜——屏上看着"我明明把它拖到第二了，怎么又跑回第一"。
    所以这一条故意**漏掉当前排第一的那一张**（漏排最后那张是测不出来的：它留在原地正好就是正确答案，
    10-19 反向验证第一趟就是这么假绿的）。
    """
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    reorder(client, a, [rows["1"], rows["2"]])   # 故意不报当前排第一的 0
    assert order_ids(db, a) == ["1", "2", "0"], "点名的按新序，没点名的按原样跟在后面"
    assert tail(cover_of(client, a)) == "1"


def test_别人的图混进名单_不动它也不告诉对方(client, db, two_users):
    """a 把 b 那一篇的 asset id 塞进自己的名单。

    不回 403、也不回"这一条存在但在别人名下"——fileID 是别人能读的地址（模块头第 3 条），
    多给一种回法就是多给一次探测机会。行为与删除那一口的"一律 404"同一条纪律，
    只是这里没有 404 可回（它不是路径上那一枚），所以是**静默不理**。
    """
    a, b = two_users["a"], two_users["b"]
    ar = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    bind_three(client, b, tag="b")
    b之前 = sort_map(db, b)
    r = reorder(client, a, [ar["2"], b_id(db, b, "0"), ar["0"], ar["1"]])
    assert r.status_code == 200, r.text
    assert ids_of(r.json()) == ["2", "0", "1"], "别人的那一格不该出现在我的回体里"
    assert sort_map(db, b) == b之前, "b 那一篇每一行的序号一个字都不许动"


def test_空名单与不存在的id_都是空写(client, db, two_users):
    """客户端并发删完最后一张之后再把旧名单发一趟，撞的就是这一态：不许 500、不许换序。"""
    a = two_users["a"]
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    reorder(client, a, [rows["2"], rows["0"], rows["1"]])
    assert reorder(client, a, []).status_code == 200
    assert reorder(client, a, [999999]).status_code == 200
    assert order_ids(db, a) == ["2", "0", "1"], "空写与假 id 都不该改动任何东西"


# ---------------------------------------------------------------- 五、私密篇那一态

def test_私密篇没解锁这个口不开而带着凭证就排得动(client, db, two_users):
    """正反各钉一条（10-15 那条教训：凭证类改动只钉一个方向，另一方向整条缺失）。"""
    from app.models.category import Category
    a = two_users["a"]
    cat = Category(user_id=str(a["user"].id), name="私密", color="#23252C")
    db.add(cat)
    db.commit()
    n = db.query(Note).filter(Note.id == a["note"]).first()
    n.category_id = cat.id
    db.commit()
    rows = {tail(r["cloud_url"]): r["id"] for r in bind_three(client, a)}
    之前 = sort_map(db, a)
    blocked = reorder(client, a, [rows["2"], rows["0"], rows["1"]])
    assert blocked.status_code == 403, "锁着的时候这个口必须关：读那一趟回的是空数组，界面上根本没有可拖的东西"
    assert sort_map(db, a) == 之前, "被挡下时一个字都不许写进库"
    client.put("/api/user/private-password", json={"password": "246810"}, headers=a["hdr"])
    tok = client.post("/api/user/private-password/verify", json={"password": "246810"},
                      headers=a["hdr"]).json()["unlock_token"]
    ok = reorder(client, a, [rows["2"], rows["0"], rows["1"]], extra={"X-Private-Token": tok})
    assert ok.status_code == 200 and ids_of(ok.json()) == ["2", "0", "1"], "解了锁还排不动＝这道闸把功能一起锁死了"
