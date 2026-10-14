"""P0-a 端到端彩排：用**现役那张真图** + **alembic 升出来的库**走一遍，不走 create_all。

pytest 那把尺子用的是合成小图和 create_all；这一支补两个它够不到的面：
① 现役 `home-bg-portrait.jpg`（1280×1280 / 314,793B）能不能过自己写的那两条上限；
② 线上建表走 alembic，若迁移与模型漂了一格，第一条 INSERT 就会 no such column（全绿在测试里）。
"""
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path("/Users/zlfmac/Documents/TuMaiBiJi/backend")
WORK = Path(tempfile.mkdtemp(prefix="p0a-smoke-"))
DB = WORK / "wtsj.db"
STORE = WORK / "mp-assets"
ADMIN = "local-rehearsal-token-not-a-real-one-" + "x" * 12

env = dict(os.environ, DATABASE_URL=f"sqlite:///{DB}", JWT_SECRET_KEY="local-rehearsal-jwt-not-real",
           MP_ASSETS_DIR=str(STORE), ADMIN_TOKEN=ADMIN, MP_ASSETS_FREEZE="0",
           SEC_CHECK_ENABLED="false", EXTRACT_PROVIDER="none")

# 1) 建表只走 alembic（与现网同一条路）
r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=str(ROOT), env=env,
                   capture_output=True, text=True)
assert r.returncode == 0, r.stderr[-800:]
con = sqlite3.connect(DB)
print("① alembic 建表：", [x[0] for x in con.execute(
    "select name from sqlite_master where type='table' and name like 'mp_%' order by name")])
print("   mp_settings 初值：", con.execute("select kind, asset_id from mp_settings").fetchall())
print("   迁移头：", con.execute("select version_num from alembic_version").fetchall())

os.environ.update(env)
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.services import mp_assets  # noqa: E402

# 10-14 §8.231 把那枚默认底图从包里删了，彩排要的只是「一张 300KB 级的真 JPEG」，改读留档那一份（同一枚文件、同一个字节数）。
REAL = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/留档-背景图-20261013/home-bg-portrait.jpg")
data = REAL.read_bytes()
print(f"② 现役那张：{len(data)} 字节 上限 {mp_assets.MAX_BYTES} → {'过' if len(data) <= mp_assets.MAX_BYTES else '拒'}")

with TestClient(app) as c:
    pw = c.post("/api/admin/login", json={"token": "不对的口令"})
    assert pw.status_code == 401, pw.text
    h = {"Authorization": "Bearer " + c.post("/api/admin/login", json={"token": ADMIN}).json()["session"]}
    print("③ 登录：错口令 401 ✓ / 对口令换到 session ✓")

    up = c.post("/api/admin/mp/assets", headers=h, data={"kind": "home_bg", "note": "彩排：现役那张"},
                files={"file": ("home-bg-portrait.jpg", data, "image/jpeg")})
    assert up.status_code == 200, up.text
    a = up.json()
    print(f"④ 上传真图：#{a['id']} {a['width']}×{a['height']} {a['file_size']}B {a['media_type']} hash={a['content_hash'][:12]}")
    print("   盘上：", sorted(p.name[:16] + "…" for p in STORE.iterdir()))

    pub = c.put("/api/admin/mp/settings/home_bg", json={"asset_id": a["id"]}, headers=h)
    assert pub.status_code == 200, pub.text
    print("⑤ 发布：", pub.json()["current"]["content_hash"][:12])

    # 客户端那一头（要登录）
    from app.db.database import SessionLocal
    from app.models.user import User
    db = SessionLocal()
    u = User(openid="smoke-user")
    db.add(u); db.commit(); db.refresh(u)
    from app.core.auth import _create_token
    uh = {"Authorization": "Bearer " + _create_token(u.id, u.generation)}
    cfg = c.get("/api/mp/config", headers=uh).json()
    print("⑥ 下发：", {k: (v and {kk: v[kk] for kk in ("url", "content_hash")}) for k, v in cfg.items()})

    img = c.get(cfg["home_bg"]["url"])
    assert img.status_code == 200 and img.content == data, f"字节不一致：{len(img.content)} vs {len(data)}"
    print(f"⑦ 取图（免登录）：{img.status_code} {img.headers['content-type']} "
          f"{len(img.content)}B 与源件一字不差 ✓ cache={img.headers['cache-control']}")

    # 冻结闸
    import app.core.config as cfgmod
    cfgmod.settings.MP_ASSETS_FREEZE = True
    print("⑧ 冻结闸开：", c.get("/api/mp/config", headers=uh).json(), "| 后台仍看得见：",
          c.get("/api/admin/mp/state", headers=h).json()["frozen"])
    cfgmod.settings.MP_ASSETS_FREEZE = False

    # 停用 = 回到包里那张
    c.put("/api/admin/mp/settings/home_bg", json={"asset_id": None}, headers=h)
    print("⑨ 停用后下发：", c.get("/api/mp/config", headers=uh).json(),
          "| 账本还在：", db.query(mp_assets.MpAsset).count(), "行 / 文件还在：", len(list(STORE.iterdir())))

    page = c.get("/ops")
    print("⑩ /ops：", page.status_code, page.headers["content-type"], len(page.text), "字节；含口令：",
          ADMIN in page.text)
    db.close()

print("\n彩排目录留着给人复核：", WORK)
