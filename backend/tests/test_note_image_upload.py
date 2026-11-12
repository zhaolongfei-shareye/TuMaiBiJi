"""浏览器那一路的笔记原图进桶（`POST /api/storage/note-image`）。

跑法：cd backend && python -m pytest tests/test_note_image_upload.py -q

这一口是 11-12 那条「提炼了图片，但原图没有被保存」的补半条：小程序的原件是客户端直传云开发
再 bind，worker 那条 `process_screenshots_task` 只管字（它自己顶上写着「图不在这条链上」）；
浏览器没有 `wx.cloud`，于是 H5 提交完那批字节就死在内存里，库里配图 0 行。

四条判据是这一口存在的理由，也是最容易写歪的地方：
- **进了桶才记账**：桶没写成却落一行 `assets`，屏上就是一格永远破图，比没有这行更坏。
- **张数与位置吃同一份判据**：一篇 9 张、新图追加在最后（不许抢头图），与 bind 那一口同一条。
- **越权读不到别人的篇**：`note_id` 是客户端给的整数。
- **序号决定路径**：重传同一张落回同一个对象（浏览器删不动桶，只能靠覆盖）。
"""
import io
import os
import sys
import time

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_noteimage.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.auth import _create_token
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.asset import Asset
from app.models.note import Note
from app.models.user import User
from app.services import note_images

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
    out = {}
    for tag in ("a", "b"):
        u = User(openid=f"noteimg-{tag}-{int(time.time() * 1000)}")
        db.add(u)
        db.commit()
        n = Note(user_id=str(u.id), title=f"{tag} 的笔记", source_type="screenshot")
        db.add(n)
        db.commit()
        out[tag] = {"user": u, "note": n.id, "hdr": {"Authorization": f"Bearer {_create_token(u.id, u.generation)}"}}
    return out


@pytest.fixture()
def bucket(monkeypatch):
    """假存图通道：记下每次落桶的路径，回一枚像样的 fileID。"""
    calls = []

    async def fake_upload(data, cloud_path):
        calls.append({"path": cloud_path, "bytes": len(data)})
        return f"cloud://pytest-env.fakebucket/{cloud_path}", {"bytes": len(data)}

    monkeypatch.setattr(note_images, "upload_bytes", fake_upload)
    return calls


def png(w=320, h=240, color=(210, 104, 63)):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


def put(client, who, note_id, data, name="shot.png"):
    return client.post("/api/storage/note-image",
                       data={"note_id": str(note_id)},
                       files={"file": (name, data, "image/png")},
                       headers=who["hdr"])


# ---------------------------------------------------------------- 一、传得上、记得下

def test_传一张就有一行且读口回得来(client, db, two_users, bucket):
    a = two_users["a"]
    r = put(client, a, a["note"], png())
    assert r.status_code == 200, r.text
    row = db.query(Asset).filter(Asset.note_id == a["note"]).one()
    assert row.object_key.endswith("images/notes/%s/%s/1.png" % (a["user"].id, a["note"]))
    assert (row.width, row.height) == (320, 240)
    assert row.file_size == len(png()) and row.file_type == "image/png"
    assert row.backup_status == "uploaded"
    got = client.get(f"/api/notes/{a['note']}/assets", headers=a["hdr"]).json()
    assert [g["cloud_url"] for g in got] == [row.object_key], "详情窗读的是这一口，对不上就还是空白"


def test_连传三张序号与位置各不重复(client, db, two_users, bucket):
    a = two_users["a"]
    for i in range(3):
        assert put(client, a, a["note"], png(color=(i * 40, 90, 120))).status_code == 200
    rows = db.query(Asset).filter(Asset.note_id == a["note"]).order_by(Asset.sort_order).all()
    assert [r.sort_order for r in rows] == [1, 2, 3], "新图抢到头一格＝给一篇老笔记悄悄换了头图"
    assert [bucket[i]["path"].split("/")[-1] for i in range(3)] == ["1.png", "2.png", "3.png"]


def test_第十张被拒而前九张留着(client, db, two_users, bucket):
    a = two_users["a"]
    for _ in range(9):
        assert put(client, a, a["note"], png()).status_code == 200
    r = put(client, a, a["note"], png())
    assert r.status_code == 400 and "9" in r.json()["detail"]
    assert db.query(Asset).filter(Asset.note_id == a["note"]).count() == 9


# ---------------------------------------------------------------- 二、闸与失败形状

def test_别人的笔记传不进去(client, db, two_users, bucket):
    a, b = two_users["a"], two_users["b"]
    r = put(client, b, a["note"], png())
    assert r.status_code == 404, f"越权应该 404，回的是 {r.status_code}"
    assert bucket == [] and db.query(Asset).filter(Asset.note_id == a["note"]).count() == 0


def test_没票直接拒(client, two_users, bucket):
    a = two_users["a"]
    r = client.post("/api/storage/note-image", data={"note_id": str(a["note"])},
                    files={"file": ("s.png", png(), "image/png")})
    assert r.status_code == 401
    assert bucket == []


def test_不是图就当场拒(client, two_users, bucket):
    a = two_users["a"]
    r = put(client, a, a["note"], "这不是图片，是一段文字".encode())
    assert r.status_code == 400 and bucket == []


def test_超四兆当场拒(client, two_users, bucket):
    a = two_users["a"]
    r = put(client, a, a["note"], b"\x89PNG" + b"0" * (4 * MB + 10))
    assert r.status_code == 400
    assert bucket == [], "字节上限要在进桶之前拦，否则白推一趟 4MB"


def test_桶写不进去时不落账(client, db, two_users, monkeypatch):
    """这一条是"宁可没图，也不留一行指向不存在对象的账"。"""
    a = two_users["a"]

    async def boom(data, cloud_path):
        raise note_images.SkipImage("存图函数这会儿不通")

    monkeypatch.setattr(note_images, "upload_bytes", boom)
    r = put(client, a, a["note"], png())
    assert r.status_code == 502
    assert db.query(Asset).filter(Asset.note_id == a["note"]).count() == 0


def test_重传同一张落回同一个对象(client, db, two_users, bucket):
    """删不动 ⇒ 只能靠覆盖：同一篇同一序号必须是同一个 cloud_path。"""
    a = two_users["a"]
    assert put(client, a, a["note"], png()).status_code == 200
    db.query(Asset).filter(Asset.note_id == a["note"]).delete()
    db.commit()
    assert put(client, a, a["note"], png()).status_code == 200
    assert len(bucket) == 2 and bucket[0]["path"] == bucket[1]["path"], \
        "同一篇同一序号落到不同对象＝桶里攒出没人认的孤儿（浏览器删不动）"
