"""现网那只「导入即检」口的**并发**读数（10-22 第六十二次部署的收尾自证，台账 §8.450）。

跑法（中文路径走 stdin 重定向会散成乱码，先 cp 成 ASCII 名）：
    cp docs/工具/探-现网导入即检口并发.py /tmp/probe62_conc.py
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - ' < /tmp/probe62_conc.py

为什么单独写一支：这一趟修的不是"检得对不对"，而是**"检图不许压在事件循环上"**
（`await asyncio.to_thread(check_image, data)`，修法本身 `50f5e23`）。uvicorn 单进程、无 `--workers`，
在 `async def` 里直接调同步 httpx＝把整个 API 按住十几秒，症状是"整站慢"不是"这一张慢"。
⇒ 所以判据只能是**并发**：多张同时送，看墙上时间是不是各张相加；同时打一个轻口 `/health`，看它还被不压着。
`探-现网导入即检口.py` 那 8 条证的是门在不在、有没有锁、会不会把垃圾当图送出去——**射程里没有"卡不卡"这一格**。

两档都要量，因为 >1MB 那一张才会走 PIL 全解码＋重编码（8 KB 那张压根不碰那一档）：
- 小图一档：6 张并发，样本几 KB（不进重编码）；
- 大图一档：3 张并发，样本 1MB～10MB 的噪声 PNG（**必须真过 1MB**，否则量不到重编码那一档）。
⚠ 那只口限流 **30/分**，两档合起来 9 次，别在同一个分钟里连打第三趟。

只读：不写库、不建笔记、不碰云上对象；token 在进程内签，openid 只报长度、值不进输出。
"""
import asyncio
import io
import os
import sys
import time

sys.path.insert(0, os.getcwd())

import httpx  # noqa: E402
from PIL import Image  # noqa: E402

from app.core.auth import _create_token  # noqa: E402
from app.db.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

BASE = "http://127.0.0.1:8000"
URL = f"{BASE}/api/ingest/screenshots/check"
HINT = "字段名必须叫 images：签名是 `images: UploadFile = File(...)`。写成 file 会 6 张全 422，读数作废。"


def small_png() -> bytes:
    buf = io.BytesIO()
    im = Image.new("RGB", (900, 1200))
    px = im.load()
    for y in range(1200):
        for x in range(0, 900, 3):
            px[x, y] = ((x * 7 + y * 13) % 256, (x * 3 + y * 5) % 256, (x + y * 11) % 256)
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def big_png() -> bytes:
    """随机字节当图：PIL 解得开（不是"解不开=放行"那一族）、又压不动，正好落在 1MB～10MB 那一档。

    ⚠ **别拿 WEBP 顶这一档**：上一版这么写过，800×1100 噪声被 WEBP 压到 824 KB ⇒
    压根不 >1MB，`check_image` 里那一串"先压再送"的分支一步没走，而我当时把 3.6–10 s 的读数
    说成"这一档才走重编码"——那是**归因错**，真正的耗时全在出网那一趟。这一档要单独量，
    所以这里改用 PNG（噪声压不动）并把上下限都钉住。
    """
    im = Image.frombytes("RGB", (800, 1100), os.urandom(800 * 1100 * 3))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    data = buf.getvalue()
    if not (1048576 < len(data) < 10 * 1048576):
        raise SystemExit(
            f"样本 {len(data) // 1024} KB 不在 1MB～10MB 之间 ⇒ 这一把量不到重编码那一档"
            "（≤1MB 不进那条分支，≥10MB 会被门当场 400 且不出网）"
        )
    return data


async def one(client, token, name, blob, mime, idx):
    t = time.monotonic()
    r = await client.post(
        URL,
        headers={"Authorization": f"Bearer {token}"},
        files={"images": (name, blob, mime)},
        timeout=180,
    )
    ms = round((time.monotonic() - t) * 1000)
    verdict = r.json().get("verdict") if r.status_code == 200 else r.text[:70]
    return idx, r.status_code, ms, verdict


async def poll_health(client, out, stop):
    while not stop.is_set():
        t = time.monotonic()
        try:
            r = await client.get(f"{BASE}/health", timeout=20)
            out.append((r.status_code, round((time.monotonic() - t) * 1000)))
        except Exception:
            out.append(("EXC", round((time.monotonic() - t) * 1000)))
        await asyncio.sleep(0.05)


async def round_(client, token, label, blob, name, mime, n):
    print(f"\n=== {label}：{n} 张并发（{len(blob) // 1024} KB／张）===")
    idle = []
    for _ in range(3):
        t = time.monotonic()
        await client.get(f"{BASE}/health", timeout=20)
        idle.append(round((time.monotonic() - t) * 1000))
    print(f"空载时 /health：{idle} ms")
    hb, stop = [], asyncio.Event()
    task = asyncio.create_task(poll_health(client, hb, stop))
    await asyncio.sleep(0.2)
    t0 = time.monotonic()
    rs = await asyncio.gather(*[one(client, token, f"{name}{i}", blob, mime, i) for i in range(n)])
    wall = round((time.monotonic() - t0) * 1000)
    stop.set()
    await task
    for idx, st, ms, v in sorted(rs):
        print(f"  第{idx + 1}张 HTTP {st} 用时 {ms} ms　{v}")
    ssum = sum(x[2] for x in rs)
    worst = max(x[2] for x in rs)
    print(f"  单张最慢 {worst} ms／各张相加 {ssum} ms／整批墙上 {wall} ms ⇒ "
          f"{'重叠（没在事件循环上排队）' if wall < ssum * 0.8 else '看着像串行排队 ⇒ 这一条要停下来查'}")
    ok = [x[1] for x in hb if x[0] == 200]
    print(f"  送检期间 /health 采样 {len(hb)} 次（非 200 {len(hb) - len(ok)} 次）"
          f"最慢 {max(ok, default='无')} ms／中位 {sorted(ok)[len(ok) // 2] if ok else '无'} ms ⇒ "
          f"{'事件循环没被按住' if ok and max(ok) < max(idle) * 6 + 300 else '有被按住嫌疑'}")
    if any(x[1] == 422 for x in rs):
        print("  ⚠ 读数作废（422＝入参就没过）：" + HINT)


async def main():
    db = SessionLocal()
    u = db.query(User).order_by(User.id).first()
    token = _create_token(u.id)
    print(f"起点：user id={u.id}（openid 只报长度 {len(u.openid or '')}，值不进输出）")
    db.close()
    async with httpx.AsyncClient() as client:
        await round_(client, token, "小图那一档（不进重编码）", small_png(), "s", "image/png", 6)
        await round_(client, token, "大图那一档（>1MB ⇒ PIL 全解码＋重编码）", big_png(), "b", "image/png", 3)
    print("\n两档都不写库、不建笔记；这一把证的是「卡不卡」，不是「微信判得准不准」——")
    print("后者至今仍没有已知违规的图当正样本，不许把 pass 念成「这张没问题」。")


asyncio.run(main())
