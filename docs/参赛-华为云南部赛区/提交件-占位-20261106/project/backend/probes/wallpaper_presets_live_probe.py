"""现网探针：壁纸白名单四枚统一（站长 10-04 拍「统一」）。

本地 pytest 能证明 `WALLPAPER_PRESETS` 收了九个值，证明不了**现网那份字节是它**——
少传一个文件、或者只重启 worker 没重启 API，本地全绿线上照样对 tint-* 回 400，
而 400 在界面上就是"设置失败"那枚吐司，没人会当成部署问题报上来。

用法（服务器上跑，**必须先 cd 到项目目录**：家目录那份 .env 是另一个项目的）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/wallpaper_presets_live_probe.py

只用 deploy-test（users.id=1）这一个账号；收尾把它原来那一枚写回，库里不留探针痕迹。
不碰内容安全、不建笔记，所以这一支不烧 msgSecCheck 额度。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
CANONICAL = ["tint-paper", "tint-celadon", "tint-blush", "gradient-blue"]
LEGACY = ["default", "gradient-green", "gradient-sunset", "gradient-purple", "gradient-ocean"]

results = []


def ck(name, ok, got=""):
    results.append((bool(ok), name))
    print(f"{'✓' if ok else '✗'} {name}{'' if got == '' else f'　→ {got}'}")


def stored(db, uid):
    db.expire_all()
    return db.get(User, uid).wallpaper


with SessionLocal() as db:
    me = db.get(User, 1)
    assert me is not None, "users.id=1（deploy-test）不在库里，这支探针只准跑在它身上"
    original = me.wallpaper
    hdr = {"Authorization": f"Bearer {_create_token(me.id, me.generation)}"}
    print(f"起点：deploy-test 服务端记着的那一枚 = {original!r}")

    with httpx.Client(base_url=BASE, timeout=30) as c:
        # ① 选项接口就是那张白名单——这一条只证明"线上跑的是新那份 user.py"
        opts = c.get("/api/user/wallpaper/options").json()["options"]
        ck("options 回九个键（旧六 + 新三）", len(opts) == 9, f"{len(opts)}：{opts}")
        ck("四枚界面上真有的 key 全在白名单里", set(CANONICAL) <= set(opts),
           ",".join(sorted(set(CANONICAL) - set(opts))) or "齐")
        ck("旧六枚一个都没被踢出去（存量下次 PUT 不 400）", set(LEGACY) <= set(opts),
           ",".join(sorted(set(LEGACY) - set(opts))) or "齐")

        # ② 没带凭证不许写
        r = c.put("/api/user/wallpaper", json={"wallpaper": "tint-paper"})
        ck("不带登录态 PUT 被拒", r.status_code == 401, r.status_code)

        # ③ 四枚逐个真写一次，库里跟着变
        for key in CANONICAL:
            r = c.put("/api/user/wallpaper", json={"wallpaper": key}, headers=hdr)
            ck(f"PUT {key} 现网收得下", r.status_code == 200 and r.json() == {"wallpaper": key},
               f"{r.status_code} {r.text[:60]}")
            ck(f"库里落的确实是 {key}", stored(db, me.id) == key, stored(db, me.id))

        # ④ 旧值照样收（这条是给存量账号的，不是给界面的）
        r = c.put("/api/user/wallpaper", json={"wallpaper": "gradient-ocean"}, headers=hdr)
        ck("PUT 旧值 gradient-ocean 仍 200（存量不被这次加键打断）",
           r.status_code == 200 and stored(db, me.id) == "gradient-ocean", r.status_code)

        # ⑤ 白名单外仍然拒，且回中文
        r = c.put("/api/user/wallpaper", json={"wallpaper": "tint-nonexistent"}, headers=hdr)
        ck("白名单外仍 400 且是中文", r.status_code == 400 and "壁纸" in r.json().get("detail", ""),
           f"{r.status_code} {r.text[:80]}")
        ck("被拒的那次没有把脏值写进库", stored(db, me.id) == "gradient-ocean", stored(db, me.id))

        # ⑥ 还原：写回起点那一枚（None 的话接口不收，直接改库——探针不许留下新状态）
        if original is None:
            me.wallpaper = None
            db.commit()
            ck("收尾把库里那一枚清回起点（原本没选过）", stored(db, me.id) is None, stored(db, me.id))
        else:
            r = c.put("/api/user/wallpaper", json={"wallpaper": original}, headers=hdr)
            ck(f"收尾写回起点那一枚 {original}", stored(db, me.id) == original, stored(db, me.id))

print(f"\n{sum(1 for ok, _ in results if not ok)} 条不过 / 共 {len(results)} 条")
sys.exit(1 if any(not ok for ok, _ in results) else 0)
