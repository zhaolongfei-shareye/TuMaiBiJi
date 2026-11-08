"""少数派那一篇逐张现读：一条链上把「取回哪几条址 → 带来路下得下吗 → 哪几张被判占位」一趟量完。

跑这个的理由＝两把尺子给出的张数对不上，必须先定性再写文档：
- 影子探针（新代码）那一趟念的是「九张名额里存 8／败 1」；
- 跨族只读尺子那一趟念的是头两张 72×72（1,438 B）与 100×100（1,664 B）「看着是防盗链占位图」。
两张都对的话占位数应是 2，所以这一趟**用同一份代码、同一次运行**把 10 条全量一遍，逐张打印，不再靠两把尺子的记忆拼。

**只读**：不调上传、不写库、不碰黑名单那笔账（`_upload` 换成只记账的替身，两道画面闸与文字闸也换成不检——
这一趟要量的是「哪几条址、下得下吗、被判占位几张」，不是送检）。
跑法：ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < 本文件
"""
import asyncio
import os
import sys

sys.path.insert(0, os.getcwd())

import httpx  # noqa: E402

from app.models.asset import MAX_ASSETS_PER_NOTE  # noqa: E402  上限那一枚常量与现网同源，这里不另写一个 9
from app.services import note_images, scraper  # noqa: E402

存过 = []


async def 替身上传(client, 云路径, 数据):
    存过.append((云路径, len(数据)))
    return "cloud://替身/" + 云路径.rsplit("/", 1)[-1], {"bytes": len(数据)}


async def 不检(数据, 址):
    return None


note_images._upload = 替身上传
note_images._guard_image_pixels = 不检
note_images._guard_image_text = lambda openid, 数据, 址: asyncio.sleep(0)

址 = "https://sspai.com/post/117960"
来路 = "https://sspai.com/"


async def main():
    取 = await scraper.scrape_url(址)
    图 = 取.get("images") or []
    print(f"{址}｜{len(取.get('content') or '')} 字／名单 {len(图)} 条"
          f"／这一族点名的来路={取.get('image_referer')!r}")
    头 = dict(note_images.IMAGE_HEADERS)
    头["Referer"] = 来路
    占 = 0
    async with httpx.AsyncClient(timeout=25, headers=头, follow_redirects=False) as 客:
        for i, u in enumerate(图, 1):
            try:
                数据 = await note_images._download(客, u)
            except Exception as 异:
                print(f"  {i:>2} 下不动 {type(异).__name__}: {异}｜{u[:78]}")
                continue
            try:
                形, 长边 = note_images._inspect(数据)
                print(f"  {i:>2} 过 {len(数据):,} B {形.format} {形.width}x{形.height}"
                      f" 长边{长边} 动图{getattr(形, 'is_animated', False)}｜{u[:120]}")
            except Exception as 异:
                占 += 1
                print(f"  {i:>2} 拦 {len(数据):,} B｜{异}｜{u[:120]}")
    print(f"\n名单 {len(图)} 张里被占位那条判据拦下 {占} 张；上面行号 ≤{MAX_ASSETS_PER_NOTE} 的「拦」就是名额里拦掉的张数。")
    结 = await note_images.archive(图, "0", MAX_ASSETS_PER_NOTE, openid="", referer=来路)
    print(f"走 archive 本体（上传是替身，桶里零新对象）：总 {结.total}／存 {len(结.kept)}／败 {len(结.failed)}／截掉 {结.truncated}")
    for 一 in 结.failed:
        print("   败的那张址：", str(一)[:90])
    print(f"替身收到存图 {len(存过)} 次，字节 {[b for _, b in 存过][:12]}")


asyncio.run(main())
