"""现网探针：帮助文档那一篇也能带一张配图（第三十九次部署，乙路＝只传代码、不跑迁移）

跑法（口令不出那台机器、不进 argv、不回显）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网官方配图.py

这一支**故意不点发布**：发布那一下会把一张测试图真的发给现网用户（`/api/mp/config` 立刻带 url）。
所以这里只证到"入口在、能传、传了不等于发布、两栏各走各的、跨栏被拒"，
最后那一步（点发布 → 用户拿到那张图）归他自己在 `/ops` 里点。
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.getcwd())

BASE_LOCAL = "http://127.0.0.1:8000"
BASE_PUB = "https://api.agentsbin.cn/wtsj"
KIND = "preset_note_image"

fails = []


def ck(name, cond, extra=""):
    print(("  ✓ " if cond else "  ✗ ") + name + (f"　→ {extra}" if extra else ""))
    if not cond:
        fails.append(name)


def hdr(hd, name):
    """响应头按不区分大小写取。

    10-18 这条红是**判据写歪**，不是实现：那台 nginx 在 h2 下把响应头整列转小写，
    发的是 `cache-control: public, max-age=31536000, immutable`，我按 `Cache-Control` 取就成了 None。
    取头这件事不该赌对端的大小写，一律折平再比。
    """
    for k, v in (hd or {}).items():
        if k.lower() == name.lower():
            return v
    return None


def req(url, method="GET", body=None, headers=None, raw=False):
    h = dict(headers or {})
    data = None
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        else:
            data = json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=25) as f:
            payload = f.read()
            if raw:
                return f.status, dict(f.headers), payload
            try:
                return f.status, dict(f.headers), json.loads(payload or b"null")
            except Exception:
                return f.status, dict(f.headers), payload.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, dict(e.headers), json.loads(payload or b"null")
        except Exception:
            return e.code, dict(e.headers), payload.decode("utf-8", "replace")


def png(w=48, h=32, color=(210, 90, 40)) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def upload(token, data, kind, note):
    bound = "----wtsjprobe" + "b0undary"
    parts = []
    for k, v in (("kind", kind), ("note", note)):
        parts.append(
            f"--{bound}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        )
    parts.append(
        f"--{bound}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"probe.png\"\r\n"
        f"Content-Type: image/png\r\n\r\n".encode()
    )
    parts.append(data)
    parts.append(f"\r\n--{bound}--\r\n".encode())
    body = b"".join(parts)
    return req(
        f"{BASE_LOCAL}/api/admin/mp/assets", "POST", body,
        {"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={bound}"},
    )


print("\n== 0. 进门前的底数 ==")
env = {}
with open(".env", encoding="utf-8") as f:
    for line in f:
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
ADMIN = env.get("ADMIN_TOKEN") or ""
ck("`.env` 里读到了管理口令（只数长度，不回显）", len(ADMIN) > 8, f"{len(ADMIN)} 位")

st, _, eng0 = req(f"{BASE_LOCAL}/api/admin/login", "POST", {"token": ADMIN})
ck("后台登录 200", st == 200, str(st))
TICKET = (eng0 or {}).get("session") or ""
AH = {"Authorization": f"Bearer {TICKET}"}

from app.db.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.core.auth import _create_token  # noqa: E402
from app.services import mp_assets  # noqa: E402

db = SessionLocal()
u = db.query(User).filter(User.openid == "deploy-test").first()
if u is None:
    u = db.query(User).order_by(User.id).first()
UT = {"Authorization": f"Bearer {_create_token(str(u.id), u.generation or 1)}"}
print(f"  用户票签给 id={u.id}（openid 长度 {len(u.openid or '')}）")

st, _, cfg0 = req(f"{BASE_LOCAL}/api/mp/config", headers=UT)
ck("免鉴权之外那条用户口能读到 `/api/mp/config`", st == 200, str(st))
ck("下发回体里**多出来的那一栏在**（键不在＝老客户端那套读法永远不会去拉它）",
   isinstance(cfg0, dict) and KIND in cfg0, f"键：{sorted(cfg0 or {})}")
ck("这一栏当前是 null（探针没点发布，现网用户读到的就该是 null）",
   isinstance(cfg0, dict) and cfg0.get(KIND) is None, json.dumps(cfg0.get(KIND), ensure_ascii=False))
BG0 = (cfg0 or {}).get("home_bg") or {}
ck("首页那一栏没被这次部署带歪（仍指着早就生效的那一张）",
   bool(BG0.get("url")) and bool(BG0.get("content_hash")), BG0.get("url") or "空")

print("\n== 一、后台那一页与状态口 ==")
st, _, page = req(f"{BASE_LOCAL}/ops")
ck("`/ops` 左栏挂上了第二格图片栏", st == 200 and f"key: 'kind:{KIND}'" in (page or ""), str(st))
st, _, state = req(f"{BASE_LOCAL}/api/admin/mp/state", headers=AH)
kinds = (state or {}).get("kinds") or []
rows = {k.get("kind"): k for k in kinds}
ck("状态口里图片栏恰好两格（多一格少一格都算没接上）",
   sorted(rows) == sorted([mp_assets.KINDS[0], KIND]) and len(kinds) == len(mp_assets.KINDS),
   str(sorted(rows)))
mine = rows.get(KIND) or {}
ck("那一格的中文标题来自模型那一份（网页不另写一份名字）",
   mine.get("label") == mp_assets.KIND_LABELS[KIND], str(mine.get("label")))
ck("「空着」那句话说得对：不许对这一栏念「包里那一张」",
   bool(mine.get("empty_text")) and "包里" not in mine.get("empty_text", ""), str(mine.get("empty_text")))
ck("首页那一格这句话留空＝沿用网页原来那句（站长没指过那一处）",
   rows.get("home_bg", {}).get("empty_text") is None, str(rows.get("home_bg", {}).get("empty_text")))
# 这一条原先钉的是 `registered is False`（"乙路没跑迁移 ⇒ 这一格还没登记过"）。它头一趟是真，
# 第二趟就自己红了——**红的原因是探针自己往这一栏传了一张**，`registered` 记的就是"账上有过图"。
# 拿一个会被自己这一步改动的观测量当判据，等于写了根会随趟数倒下的柱子。改钉不随上传漂的那件事：
# 没点发布就没有任何生效（不许冒出一个假「已发布」）。乙路不跑迁移到底坏不坏，由第六组那条
# 「库里那一行是登记过、当前停用」来说。
ck("这一格一行生效位都没有（没点发布就不许冒出个假「已发布」）",
   mine.get("current") is None,
   f"registered={mine.get('registered')} current={mine.get('current')}")

print("\n== 二、能传，但传上来不等于发出去 ==")
DATA = png(48, 32, (210, 90, 40))
st, _, a = upload(TICKET, DATA, KIND, "探针自证：未发布")
ck("往这一栏上传一张 200", st == 200 and isinstance(a, dict) and a.get("id"), str(st))
ck("记账记对了（48×32、字节数、mime）",
   isinstance(a, dict) and a.get("width") == 48 and a.get("height") == 32
   and a.get("file_size") == len(DATA) and a.get("media_type") == "image/png",
   f"{a.get('width')}×{a.get('height')} {a.get('file_size')}B {a.get('media_type')}")
ck("这一栏的账上 kind 是它自己", a.get("kind") == KIND, str(a.get("kind")))
st, _, cfg1 = req(f"{BASE_LOCAL}/api/mp/config", headers=UT)
ck("传上来之后下发仍是 null（没点发布就不许换图）",
   cfg1.get(KIND) is None, json.dumps(cfg1.get(KIND), ensure_ascii=False))
st, _, state2 = req(f"{BASE_LOCAL}/api/admin/mp/state", headers=AH)
hist = [h.get("id") for h in ((rows2 or {}) for rows2 in [])]  # 占位，下面重算
hist = [h.get("id") for h in (([k for k in (state2 or {}).get("kinds", []) if k.get("kind") == KIND] or [{}])[0].get("history") or [])]
ck("那张能在这一栏的历史里看得见（后台一眼能看到自己刚传的）", a.get("id") in hist, str(hist))
st, _, bg_now = req(f"{BASE_LOCAL}/api/mp/config", headers=UT)
ck("首页那一栏一个字没被这次上传带歪",
   (bg_now.get("home_bg") or {}).get("content_hash") == BG0.get("content_hash"),
   str((bg_now.get("home_bg") or {}).get("content_hash"))[:16])

print("\n== 三、两栏各走各的：跨栏要被拒 ==")
st, _, bad = req(f"{BASE_LOCAL}/api/admin/mp/settings/{KIND}", "PUT", {"asset_id": None}, headers=AH)
ck("停用这一栏（当前本来就没生效）回 200 且下发仍是 null",
   st == 200 and (req(f"{BASE_LOCAL}/api/mp/config", headers=UT)[2] or {}).get(KIND) is None, str(st))
st, _, bad = req(f"{BASE_LOCAL}/api/admin/mp/settings/{KIND}", "PUT", {"asset_id": 999999}, headers=AH)
ck("指一个不在账上的 id → 400（不许悄悄写成空、也不许 500）",
   st == 400 and isinstance(bad, dict) and bad.get("detail"), f"{st} {json.dumps(bad, ensure_ascii=False)[:60]}")
st, _, bad = req(f"{BASE_LOCAL}/api/admin/mp/settings/home_bg", "PUT", {"asset_id": a.get("id")}, headers=AH)
ck("拿这一栏的图去发首页背景 → 400 且话术里点名「栏目」",
   st == 400 and "栏目" in json.dumps(bad, ensure_ascii=False), f"{st} {json.dumps(bad, ensure_ascii=False)[:60]}")
st, _, cfg2 = req(f"{BASE_LOCAL}/api/mp/config", headers=UT)
ck("被拒那几趟一行生效位都没写（首页与这一栏都还是原样）",
   cfg2.get(KIND) is None
   and (cfg2.get("home_bg") or {}).get("content_hash") == BG0.get("content_hash"), "两栏都原样")

print("\n== 四、匿名取字节那条链（这一栏也得通） ==")
st, _, state3 = req(f"{BASE_LOCAL}/api/admin/mp/state", headers=AH)
one = [k for k in (state3 or {}).get("kinds", []) if k.get("kind") == KIND]
tok = None
for h in (one[0].get("history") or []):
    if h.get("id") == a.get("id"):
        tok = h.get("token")
st2, hd, raw = req(f"{BASE_PUB}/api/mp/a/{tok}", raw=True)
ck("公网免鉴权取回的字节与传上去的**逐字节相同**", st2 == 200 and raw == DATA,
   f"{st2} {len(raw or b'')}B vs {len(DATA)}B")
ck("带 immutable 缓存头（URL 随内容不可变这条链对第二栏也成立）",
   "immutable" in (hdr(hd, "cache-control") or "").lower(), hdr(hd, "cache-control"))

print("\n== 五、预览引擎（镜像这次跟着换了，重启没生效这里就 503） ==")
st, _, eng = req(f"{BASE_LOCAL}/api/admin/poster/engine", headers=AH)
ck("`GET /api/admin/poster/engine` 回 200（不是 503＝镜像 md5 与名单对得上）", st == 200, str(st))
# 这一条原先写成"2.3.9 在 json.dumps(...)[:4000] 里"——两处都是我的写法坑：整包 27 万字
# 符（appInfo 那份从第 1.3 万起，2.3.9 在第 1.9 万），切 4000 必然扫不到；而且把版本号
# 写死进判据，下次换包这跟柱子自己就红了。改成从回体里那一只文件现读 `VERSION = 'x.y.z'`，
# 再跟盘上那份对：号对不对由读数说话，探针不替我记号。
def ver_of(txt):
    m = re.search(r"VERSION\s*=\s*'(\d+\.\d+\.\d+)'", txt or "")
    return m and m.group(1)


ENG_JS = (eng.get("files") or {}).get("appInfo.js") if isinstance(eng, dict) else None
DISK_JS = ""
try:
    with io.open("app/poster_engine/appInfo.js", encoding="utf-8") as f:
        DISK_JS = f.read()
except OSError as e:
    print("  盘上那份读不到：", e)
ck("引擎吐回的那份 appInfo 与盘上那份是同一个版本号（重启真吃到这次传的镜像）",
   bool(ver_of(ENG_JS)) and ver_of(ENG_JS) == ver_of(DISK_JS),
   f"引擎 {ver_of(ENG_JS)}／盘上 {ver_of(DISK_JS)}")
ck("下发链那份 mpAssets 也在引擎名单里（新栏的读法进了后台预览那一族）",
   "serverPresetImage" in json.dumps(eng, ensure_ascii=False), "serverPresetImage")

print("\n== 六、收尾：现网留在哪一档 ==")
st, _, cfgF = req(f"{BASE_LOCAL}/api/mp/config", headers=UT)
ck("终态：这一栏对现网用户仍是 null（探针一行都没发布）", cfgF.get(KIND) is None)
db.expire_all()
from app.models.mp_asset import MpSetting  # noqa: E402
row = db.get(MpSetting, KIND)
ck("库里那一行是「登记过、当前停用」这个形状（写口按需建行，乙路不跑迁移也不坏）",
   row is not None and row.asset_id is None,
   f"row={'在' if row else '不在'} asset_id={getattr(row, 'asset_id', None)}")
st, _, cfgP = req(f"{BASE_PUB}/api/mp/config", headers=UT)
ck("公网那侧读到的与本机一致（不是只在本机生效）",
   isinstance(cfgP, dict) and cfgP.get(KIND) is None and bool((cfgP.get("home_bg") or {}).get("url")), str(st))

print(f"\n探针读数：{len(fails)} 条红")
for x in fails:
    print("  ✗ " + x)
print("残留：`mp_assets` 里多一张探针上传的图（未发布、不发给任何用户），账上备注写的是「探针自证：未发布」。")
sys.exit(1 if fails else 0)
