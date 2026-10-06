"""笔记配图这条后端链路：绑定幂等、越权、张数上限、全站配额口径。

跑法：cd backend && python -m pytest tests/test_note_assets.py -q

三条最要紧的（其余是卫生）：
- **幂等**：B 链的设计是"上传失败不阻断 + 下次进详情页补绑"，同一条 fileID 一定会被
  送来第二次。不幂等就是每次补绑多堆一行，配额越算越假。
- **配额是全站口径**：云开发那 5GB 是一个环境一个池子，不是每人 5GB。按人算比值，
  会出现"我 0.4%、全站其实 92%，谁都收不到提示"。
- **fileID 能读到人**：这串 `cloud://...` 客户端拿去就能换临时链接，所以入口校格式、
  读接口校归属，一条都不能松。
"""
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_assets.db"
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

MB = 1024 * 1024


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
def two_users(db):
    """两个账号 + 各自一篇笔记。越权那几条要有"别人"才测得出来。"""
    out = {}
    for tag in ("a", "b"):
        u = User(openid=f"assets-{tag}-{int(time.time() * 1000)}")
        db.add(u)
        db.commit()
        n = Note(user_id=str(u.id), title=f"{tag} 的笔记", source_type="manual")
        db.add(n)
        db.commit()
        out[tag] = {"user": u, "note": n.id, "hdr": {"Authorization": f"Bearer {_create_token(u.id, u.generation)}"}}
    return out


def fid(tag, i):
    return f"cloud://pytest-env.xxxx/images/{tag}/{i}.jpg"


def bind(client, who, note_id, items):
    return client.post(f"/api/notes/{note_id}/assets", json={"items": items}, headers=who["hdr"])


def three(n=3, tag="a"):
    return [{"file_id": fid(tag, i), "size": 400 * 1024} for i in range(n)]


# ---------------------------------------------------------------- 一、绑得上、读得回

def test_绑定三张再读回就是这三张且顺序稳定(client, db, two_users):
    a = two_users["a"]
    assert bind(client, a, a["note"], three()).status_code == 200
    got = client.get(f"/api/notes/{a['note']}/assets", headers=a["hdr"]).json()
    assert [g["cloud_url"] for g in got] == [fid("a", i) for i in range(3)]
    assert all(g["size"] == 400 * 1024 for g in got)


def test_同一张重复绑不产生第二行(client, db, two_users):
    """补绑那条路一定会走到这里第二次。"""
    a = two_users["a"]
    bind(client, a, a["note"], three())
    assert bind(client, a, a["note"], three()).status_code == 200
    rows = db.query(Asset).filter(Asset.note_id == a["note"]).count()
    assert rows == 3, f"重复 bind 把行数堆到 {rows} 了，配额会越算越假"


def test_一次请求里重复的条目先去重再卡张数(client, db, two_users):
    a = two_users["a"]
    items = three(3) + three(3)
    assert bind(client, a, a["note"], items).status_code == 200
    assert db.query(Asset).filter(Asset.note_id == a["note"]).count() == 3


# ---------------------------------------------------------------- 二、张数上限第一次落在服务端

def test_第十张被拒(client, db, two_users):
    a = two_users["a"]
    assert bind(client, a, a["note"], three(9)).status_code == 200
    r = bind(client, a, a["note"], [ {"file_id": fid("a", 99), "size": 1024} ])
    assert r.status_code == 400, "一篇笔记的张数上限没落在服务端，客户端一改就没人守了"


def test_补绑一张新的不能突破上限(client, db, two_users):
    a = two_users["a"]
    bind(client, a, a["note"], three(9))
    assert bind(client, a, a["note"], [{"file_id": fid("a", 42), "size": 1024}]).status_code == 400


def test_满九张时重发同一批仍然放行_幂等不该被上限误伤(client, db, two_users):
    a = two_users["a"]
    batch = three(9)
    bind(client, a, a["note"], batch)
    assert bind(client, a, a["note"], batch).status_code == 200
    assert db.query(Asset).filter(Asset.note_id == a["note"]).count() == 9


# ---------------------------------------------------------------- 三、脏数据与越权

def test_不是云文件地址的一律拒(client, db, two_users):
    a = two_users["a"]
    for bad in ("http://evil/x.jpg", "/images/a.jpg", "cloud://", "  "):
        assert bind(client, a, a["note"], [{"file_id": bad}]).status_code == 400, bad


def test_别人的fileID塞不进自己的笔记(client, db, two_users):
    a, b = two_users["a"], two_users["b"]
    bind(client, a, a["note"], three(2))
    assert bind(client, b, b["note"], three(2, tag="a")).status_code == 400


def test_读别人的笔记图片得到404(client, db, two_users):
    a, b = two_users["a"], two_users["b"]
    bind(client, a, a["note"], three())
    r = client.get(f"/api/notes/{a['note']}/assets", headers=b["hdr"])
    assert r.status_code == 404, "区分'不存在'和'不是你的'就是给人试 id 的探测器"


def test_已归到别篇的图不被抢走(client, db, two_users):
    a = two_users["a"]
    n2 = Note(user_id=str(a["user"].id), title="第二篇", source_type="manual")
    db.add(n2)
    db.commit()
    bind(client, a, a["note"], three(1))
    assert bind(client, a, n2.id, three(1)).status_code == 400


def test_没登录进不来(client, db, two_users):
    a = two_users["a"]
    assert client.post(f"/api/notes/{a['note']}/assets", json={"items": []}).status_code == 401
    assert client.get(f"/api/notes/{a['note']}/assets").status_code == 401
    assert client.get("/api/user/storage-quota").status_code == 401


# ---------------------------------------------------------------- 四、配额口径（最容易写错的一组）

def test_比值按全站算不是按当前用户算(client, db, two_users):
    a, b = two_users["a"], two_users["b"]
    bind(client, a, a["note"], [{"file_id": fid("a", i), "size": 1 * MB} for i in range(2)])
    bind(client, b, b["note"], [{"file_id": fid("b", i), "size": 1 * MB} for i in range(2)])
    q = client.get("/api/user/storage-quota", headers=a["hdr"]).json()
    assert q["user_bytes"] == 2 * MB
    assert q["total_bytes"] == 4 * MB, "两个人各 2MB，全站就是 4MB——提示要响给所有人听"
    assert abs(q["used_ratio"] - round(q["total_bytes"] / q["cap_bytes"], 4)) < 1e-9


def test_标记为失败的行不占配额(client, db, two_users):
    a = two_users["a"]
    bind(client, a, a["note"], three(2))
    for r in db.query(Asset).filter(Asset.note_id == a["note"]).all():
        r.backup_status = "failed"
    db.commit()
    q = client.get("/api/user/storage-quota", headers=a["hdr"]).json()
    assert q["total_bytes"] == 0 and q["total_count"] == 0


def test_历史行backup_status为空也要算进去(client, db, two_users):
    """`NULL != 'failed'` 在 SQL 里是 NULL（也就是不过滤掉），不写清楚就会悄悄漏账。"""
    a = two_users["a"]
    db.add(Asset(user_id=str(a["user"].id), note_id=a["note"], object_key=fid("a", 0),
                 file_size=3 * MB, backup_status=None))
    db.commit()
    q = client.get("/api/user/storage-quota", headers=a["hdr"]).json()
    assert q["total_bytes"] == 3 * MB, "NULL 那批从配额里消失了"


def test_还没绑上笔记的图也占配额(client, db, two_users):
    """B 链先传图、后拿 note_id，这段中间态对象已经在云上，不能不算。"""
    a = two_users["a"]
    db.add(Asset(user_id=str(a["user"].id), note_id=None, object_key=fid("a", 5),
                 file_size=1 * MB, backup_status="uploaded"))
    db.commit()
    assert client.get("/api/user/storage-quota", headers=a["hdr"]).json()["total_bytes"] == 1 * MB


# ---------------------------------------------------------------- 五、删笔记连带清图

def test_删笔记把fileID回给调用方并把行清掉(client, db, two_users):
    """这台后端删不掉云开发上的对象（没那个凭据），所以把清单交回客户端去删。"""
    a = two_users["a"]
    bind(client, a, a["note"], three(2))
    r = client.delete(f"/api/notes/{a['note']}", headers=a["hdr"])
    assert r.status_code == 200
    assert sorted(r.json()["file_ids"]) == sorted([fid("a", 0), fid("a", 1)])
    assert db.query(Asset).filter(Asset.note_id == a["note"]).count() == 0


# ---------------------------------------------------------------- 六、公开页带图（分享带图）

def _share(db, who, token="pubtok-a"):
    """直接落一行分享，绕开建分享那道送检闸（这一组测的是图，不是文字）。"""
    from app.models.share import Share
    s = Share(user_id=str(who["user"].id), note_id=who["note"], token=token,
              title="公开标题", is_active=True)
    db.add(s)
    db.commit()
    return s


def test_公开页带着这篇的配图(client, db, two_users):
    a = two_users["a"]
    bind(client, a, a["note"], three(2))
    _share(db, a)
    body = client.get("/api/shares/pubtok-a").json()
    assert [x["cloud_url"] for x in body["assets"]] == [fid("a", 0), fid("a", 1)]


def test_公开页只给地址不给内部字段(client, db, two_users):
    """这一页不过登录：多回一个 id/size/user_id 就是多一个外人能枚举的东西。"""
    a = two_users["a"]
    bind(client, a, a["note"], three(1))
    _share(db, a)
    assert set(client.get("/api/shares/pubtok-a").json()["assets"][0]) == {"cloud_url"}


def test_撤回分享之后公开页连图一起不见(client, db, two_users):
    """"收回来"那扇门必须对图同样有效——海报上的码收不回，唯一下线途径就是撤回。"""
    a = two_users["a"]
    bind(client, a, a["note"], three(2))
    _share(db, a)
    assert client.post("/api/shares/revoke", json={"note_id": a["note"]}, headers=a["hdr"]).status_code == 200
    assert client.get("/api/shares/pubtok-a").status_code == 404


def test_标成失败的图不上公开页(client, db, two_users):
    a = two_users["a"]
    bind(client, a, a["note"], three(2))
    row = db.query(Asset).filter(Asset.note_id == a["note"]).first()
    row.backup_status = "failed"
    db.commit()
    _share(db, a)
    body = client.get("/api/shares/pubtok-a").json()
    assert [x["cloud_url"] for x in body["assets"]] == [fid("a", 1)], "云上没东西的行不该露出去"


def test_别人的图不会出现在这篇的公开页上(client, db, two_users):
    a, b = two_users["a"], two_users["b"]
    bind(client, a, a["note"], three(2))
    bind(client, b, b["note"], [{"file_id": fid("b", 0), "size": 1024}])
    _share(db, b, token="pubtok-b")
    assert [x["cloud_url"] for x in client.get("/api/shares/pubtok-b").json()["assets"]] == [fid("b", 0)]


# ---------------------------------------------------------------- 七、注销连带清图

def test_注销把要删的对象清单一起回出来(client, db, two_users):
    """注销之后 token 就废了，这是客户端拿到 fileID 的**唯一**一次机会。"""
    a = two_users["a"]
    bind(client, a, a["note"], three(2))
    r = client.post("/api/user/deactivate", json={"confirm": True}, headers=a["hdr"])
    assert r.status_code == 200
    assert sorted(r.json()["file_ids"]) == sorted([fid("a", 0), fid("a", 1)])
    assert r.json()["deleted"]["assets"] == 2


def test_注销只报自己名下的对象(client, db, two_users):
    a, b = two_users["a"], two_users["b"]
    bind(client, a, a["note"], three(2))
    bind(client, b, b["note"], [{"file_id": fid("b", 0), "size": 1024}])
    ids = client.post("/api/user/deactivate", json={"confirm": True}, headers=b["hdr"]).json()["file_ids"]
    assert ids == [fid("b", 0)], f"把别人名下的 fileID 一起交出去，等于让注销顺带删了别人的图"

