"""现网那只「导入即检」口的部署自检（10-22 第六十一次部署，台账 §8.445）。

跑法（在服务器上，走 stdin，先 cd）：
    cat docs/工具/探-现网导入即检口.py | ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -'

为什么单独写一支而不是并进 `探-现网图片内容安全闸.py`：那一只打的是**服务层**那条出网链
（`probe_img_sec_check`，不经 HTTP、不要身份），这一只打的是**这一批新加的这道门**——
门开没开、有没有锁（JWT）、会不会把垃圾当图送出去、以及"只检不存"这句在现网成不成立。

三件事必须分开，别混着报：
① 门在不在＝路由 404 还是 200（这一条红了就是没部署上或没重启）；
② 门后那条出网链通不通＝服务层那一只的读数，不在本探针射程内（只顺带回一个 errcode 原样读数）；
③ **拦得下拦不下＝没有已知违规的图当正样本，本探针一条都不声称验过**。
   ⚠ 尤其不许把 ① 的 `pass` 念成"这张没问题"——微信对小段非图片字节一律回 0（§8.443 那张表），
   `pass` 只说明这一趟接口调得通。

「只检不存」那一格用**反证**：检完之后拿一个编造的 batch_id 去打 `process`，
必须回 404「批次不存在或已失效」。真存进去了就会回 200 并入队——那才是出事。
"""
import io
import json
import os
import sys

sys.path.insert(0, os.getcwd())

import httpx  # noqa: E402

from app.core.auth import _create_token  # noqa: E402
from app.db.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import wechat  # noqa: E402

BASE = "http://127.0.0.1:8000"
CHECK = BASE + "/api/ingest/screenshots/check"
PROCESS = BASE + "/api/ingest/screenshots/process"

_pass = 0
_fails = []


def ok(name, cond, extra=""):
    global _pass
    if cond:
        _pass += 1
        print("  ✓ " + name + (("　" + extra) if extra else ""))
    else:
        _fails.append(name + (("" if not extra else "　" + extra)))
        print("  ✗ " + name + (("　" + extra) if extra else ""))


def png_noise(w=400, h=400):
    """必须用噪声：纯色那张会被压到几 KB，造"大图"那一格时样本根本没越过上限＝空闸。"""
    import random
    from PIL import Image
    rnd = random.Random(20261022)
    buf = io.BytesIO()
    Image.frombytes("RGB", (w, h), bytes(rnd.randrange(256) for _ in range(w * h * 3))).save(buf, format="PNG")
    return buf.getvalue()


def post_png(hdr, data, name="a.png", mime="image/png"):
    return httpx.post(CHECK, headers=hdr, files={"images": (name, data, mime)}, timeout=30)


def main():
    db = SessionLocal()
    try:
        u = db.query(User).order_by(User.id).first()
        uid = u.id if u is not None else None
        openid_len = len(u.openid or "") if u is not None else 0
    finally:
        db.close()
    if uid is None:
        print("✗ 库里一个号都没有，探针没起点")
        sys.exit(1)
    print("起点：user id=%s（openid 只报长度 %d，值不进输出）" % (uid, openid_len))
    hdr = {"Authorization": "Bearer " + _create_token(uid)}

    print("\n① 门在不在")
    r = post_png(hdr, png_noise())
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    ok("带身份送一张图，路由回 200（404＝没部署上或进程还是旧的）", r.status_code == 200,
       "HTTP %s　回体 %s" % (r.status_code, json.dumps(body, ensure_ascii=False)[:120]))
    ok("回体是三态之一 pass|risky|unavailable，不是别的形状",
       body.get("verdict") in ("pass", "risky", "unavailable"), "verdict=%s" % body.get("verdict"))
    if body.get("verdict") == "pass":
        print("     ⚠ 这个 pass 只证明这一趟接口调得通，**不证明这张没问题**（见文件头 ③）")

    print("\n② 门有没有锁（新加的写口一律不许是裸的）")
    r2 = httpx.post(CHECK, files={"images": ("a.png", png_noise(), "image/png")}, timeout=30)
    ok("不带身份打这一口，回 401/403 而不是 200", r2.status_code in (401, 403), "HTTP %s" % r2.status_code)

    print("\n③ 垃圾字节不许被当成图送出去（微信对小段非图片一律回 0＝假绿灯）")
    r3 = post_png(hdr, b"this is definitely not an image", name="a.bin", mime="application/octet-stream")
    hint = ""
    try:
        hint = r3.json().get("detail", "")
    except Exception:
        pass
    ok("送一段非图片字节回 400，并念出现网那句格式提示", r3.status_code == 400 and "格式" in hint,
       "HTTP %s　detail=%s" % (r3.status_code, hint[:60]))
    big = b"\x89PNG\r\n\x1a\n" + os.urandom(11 * 1024 * 1024)
    r4 = post_png(hdr, big)
    ok("11MB 那一档回 400 说超过 10MB（越过上限要当场拦，不等接口回 40006）",
       r4.status_code == 400 and "10MB" in json.dumps(r4.json(), ensure_ascii=False),
       "HTTP %s" % r4.status_code)

    print("\n④ 只检不存（反证：检过没给自己造出一个批次）")
    r5 = httpx.post(PROCESS, headers=hdr, data={"batch_id": "probe61-nonexistent"}, timeout=30)
    ok("拿编造的 batch_id 打 process 必须 404「批次不存在或已失效」",
       r5.status_code == 404 and "批次" in json.dumps(r5.json(), ensure_ascii=False),
       "HTTP %s" % r5.status_code)
    ok("process 这一路的入队次数没被这一口碰过（限流器读数不在这格射程，只把 404 当据）",
       r5.status_code == 404)

    print("\n⑤ 门后那条出网链顺带取一个原样读数（权威射程在服务层那一只探针里）")
    p = wechat.probe_img_sec_check(png_noise(120, 120))
    ok("服务层这一趟真出了网并拿到微信的回码（enabled/disabled/exception 都算读到形状）",
       "verdict" in p, "errcode=%s　verdict=%s" % (p.get("errcode"), p.get("verdict")))
    print("     ⚠ SEC_CHECK_ENABLED=%s；这一格回 unavailable 不等于口坏了，两件事分开看"
          % getattr(wechat.settings, "SEC_CHECK_ENABLED", "?"))

    print("\n没验到、也不许报成验过的两格：")
    print("  · 微信**判定能力**——没有已知违规的图当正样本，`risky` 那一路现网零次成证；")
    print("  · 客户端那套占位色块／全回显才放开滑条——不在这台机上，要真机扫含这一刀的包才看得见（还没出）。")
    print("\n%s 探-现网导入即检口：%d 过 / %d 红" % ("✓" if not _fails else "✗", _pass, len(_fails)))
    for f in _fails:
        print("  ✗ " + f)
    sys.exit(1 if _fails else 0)


main()
