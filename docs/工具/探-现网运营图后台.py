"""现网探针：运营图后台这条链在服务器上到底通不通（部署后必跑，别靠"代码是对的"推理）。

为什么要有这一支：本地 pytest 与彩排全绿，证明的是**这份代码**；它有没有真跑到那台机器上、
nginx 那个 `/wtsj/` 前缀转不转、`.env` 里那把钥匙是不是这一把、盘上目录建没建出来——
只有从公网打一次才知道。10-09 那次"忘了部署"就是只跑了本地用例才没被抓到（见
`[[feedback-green-tests-not-release-ready]]`）。

管理口令**从标准输入读**，绝不进命令行参数、绝不回显：`ps` 里能看见 argv，journald 里能看见
被打印的值，而这一把钥匙能改全站首页那张图。跑法（值由服务器自己吐出来，经管道进来）：

    ssh agentsbin 'sed -n "s/^ADMIN_TOKEN=//p" /home/ubuntu/wtsj-backend/.env' \\
      | backend/.venv/bin/python docs/工具/探-现网运营图后台.py

默认**不发布**：上传与取图这两步已经够证明整条写链路，而"发布"会改的是将来线上用户冷启看到的
那一张，那一步归站长点。要看发布也行，加 `--publish`（用完自己 `--unpublish` 收回 null）。
"""
import hashlib
import sys
from pathlib import Path

import httpx

BASE = "https://api.agentsbin.cn/wtsj"
REAL_IMAGE = Path("/Users/zlfmac/Documents/TuMaiBiJi/miniprogram/assets/home-bg-portrait.jpg")
NOTE = "现网探针：现役那张（未发布）"
PUBLISH = "--publish" in sys.argv
UNPUBLISH = "--unpublish" in sys.argv

fails = []


def check(label, ok, detail=""):
    print(f"  {'✓' if ok else '✗'} {label}{('　→ ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


token = sys.stdin.read().strip()
if not token:
    print("✗ 标准输入里没读到管理口令（按上面那条 ssh | python 的跑法给它）")
    raise SystemExit(2)

img = REAL_IMAGE.read_bytes()
# 尺寸从那份文件现读，不写死：改了包里那张图，这条探针要跟着变才是真判据
from PIL import Image  # noqa: E402

W, H = Image.open(REAL_IMAGE).size
h = httpx.Client(timeout=30.0, verify=True)

print("① 登录（真口令）")
r = h.post(f"{BASE}/api/admin/login", json={"token": token})
check("POST /api/admin/login", r.status_code == 200, f"{r.status_code}")
if r.status_code != 200:
    print("   回体：", r.text[:200])
    raise SystemExit(1)
session = r.json()["session"]
check("发下来的是短命 session（不是口令本身）", session != token and session.count(".") == 2,
      f"expires_in={r.json().get('expires_in')}s")
auth = {"Authorization": f"Bearer {session}"}

print("② 管理凭证开不了用户那一排门（锚点 A7 反向）")
check("GET /api/notes/ 用管理 session", h.get(f"{BASE}/api/notes/", headers=auth).status_code == 401)
check("GET /api/mp/config 用管理 session", h.get(f"{BASE}/api/mp/config", headers=auth).status_code == 401)

print("③ 上传现役那张真图")
r = h.post(f"{BASE}/api/admin/mp/assets", headers=auth,
           data={"kind": "home_bg", "note": NOTE},
           files={"file": ("home-bg-portrait.jpg", img, "image/jpeg")})
check("POST /api/admin/mp/assets", r.status_code == 200, f"{r.status_code} {r.text[:160] if r.status_code != 200 else ''}")
if r.status_code != 200:
    raise SystemExit(1)
a = r.json()
check("尺寸与字节是量出来的", (a["width"], a["height"], a["file_size"]) == (W, H, len(img)),
      f"{a['width']}×{a['height']} {a['file_size']}B（本地那份 {W}×{H} {len(img)}B）")

print("④ 从公网把字节取回来（免登录）")
r = h.get(f"{BASE}{a['url']}")
check("GET " + a["url"], r.status_code == 200 and r.content == img,
      f"{r.status_code} {r.headers.get('content-type')} {len(r.content)}B "
      f"sha256={hashlib.sha256(r.content).hexdigest()[:12]}")
check("缓存声明是 immutable", "immutable" in r.headers.get("cache-control", ""),
      r.headers.get("cache-control", "(没有)"))

print("⑤ 状态那一栏读得到，且生效位仍为空" if not PUBLISH else "⑤ 发布")
r = h.get(f"{BASE}/api/admin/mp/state", headers=auth)
k = r.json()["kinds"][0]
check("GET /api/admin/mp/state", r.status_code == 200 and k["kind"] == "home_bg")
if UNPUBLISH:
    h.put(f"{BASE}/api/admin/mp/settings/home_bg", headers=auth, json={"asset_id": None})
    k = h.get(f"{BASE}/api/admin/mp/state", headers=auth).json()["kinds"][0]
    check("已收回停用（asset_id=null）", k["current"] is None)
elif PUBLISH:
    h.put(f"{BASE}/api/admin/mp/settings/home_bg", headers=auth, json={"asset_id": a["id"]})
    k = h.get(f"{BASE}/api/admin/mp/state", headers=auth).json()["kinds"][0]
    check("发布生效", (k["current"] or {}).get("id") == a["id"])
else:
    check("没发布过就已经有下发 = 传上来就等于发布", k["current"] is None,
          "生效位 null（线上仍用包里那张）")

print("\n" + ("探针全过" if not fails else f"✗ {len(fails)} 条不过：{fails}"))
raise SystemExit(0 if not fails else 1)
