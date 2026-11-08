"""10-31 复量：微博治好那一型（页打得开、字拿得到、图存不下）在别的族身上还剩几处。

跑这个的理由＝微博那一刀收完之后要回答的一句"别的站有没有同类毛病"。这里量三种坏法：
① 地址根本取错（拿回来的"图"回的是 HTML）；② 地址对、但图床卡下载头（微博就是这一型，
   要带来路才 200）；③ 装饰图（头像／站点图标）混进名单把位置占了，正文图反而挤不进来。

**只读**：不写库、不进桶、不调上传，也不碰黑名单那笔账（记账只在录入那一趟的两个落点，
本脚本一次都没走那条路；这里只 SELECT 现网那几行读数）。
真链接一律从各家自己的首页／RSS 现抽，一条都不许编；抽不到就老实记"无样本"。

跑法（现网出口，含 SSRF 闸）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < 本文件
"""
import asyncio
import os
import re
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.getcwd())

import httpx

from app.db.database import SessionLocal
from app.services import note_images, scraper, source_blocklist

IMG_TRY = 3
# (键, 这一族, 种子页＝自家的首页／RSS, 抽文章址的式子)
SEEDS = [
    ("sspai", "少数派", "https://sspai.com/feed", r"<link>(https?://sspai\.com/post/\d+)</link>"),
    ("sohu", "搜狐", "https://news.sohu.com/", r"(?:https:)?//(?:www|news|m)\.sohu\.com/a/\d{6,12}_\d{4,10}"),
    ("csdn", "CSDN", "https://blog.csdn.net/nav/web", r"https?://blog\.csdn\.net/[\w-]+/article/details/\d+"),
    ("sina", "新浪新闻（对照：通用档该全通）", "https://news.sina.com.cn/",
     r"https?://news\.sina\.com\.cn/\w+/202\d-\d\d-\d\d/[\w-]+\.shtml"),
    ("zhihu", "知乎", "https://www.zhihu.com/",
     r"https?://(?:www\.zhihu\.com/question/\d+/answer/\d+|zhuanlan\.zhihu\.com/p/\d+)"),
    ("bilibili", "哔哩哔哩", "https://www.bilibili.com/", r"https?://www\.bilibili\.com/video/BV[\w]+"),
]
# 这三枚不是编的：微博主页那个 uid 取自站长给的真链接 `weibo.com/1649679354/…` 的那一段；
# 小红书短链与网易文章是库里已记过读数的两条公开样本（枚举表一第 4、11 行）。
FIXED = [
    ("weibo_profile", "微博·主页型（指向一个人，不是某一条）", "https://weibo.com/u/1649679354"),
    ("xhs_short", "小红书·短链（现网已被自动拦的那一族）", "https://xhslink.cn/o/9F1fAXNBL1I"),
    ("netease", "网易·文章页（对照：通用档该全通）", "https://c.m.163.com/news/a/LAD6VGQO00097U7T.html"),
]
# 少数派那一族要回答的不仅是"卡不卡"，还有"卡的是哪一枚来路"：本站来路 vs 微博来路 vs 不加。
REFERER_VARIANTS = ("", "self", "weibo")


def _来路头(来路: str) -> dict:
    头 = dict(note_images.IMAGE_HEADERS)
    if 来路:
        头["Referer"] = 来路
    return 头


async def _下一张(url: str, 来路: str) -> str:
    """按现网那一条链真下一张：生产下载头＋指定的来路，回体用 `_inspect` 判（占位图当场拦）。"""
    try:
        async with httpx.AsyncClient(timeout=25, headers=_来路头(来路), follow_redirects=False) as client:
            数据 = await note_images._download(client, url)
        im, 长边 = note_images._inspect(数据)
        return f"OK {len(数据):,} B {im.format} {im.width}x{im.height} 长边{长边}"
    except Exception as exc:
        return f"存不下 {type(exc).__name__}: {str(exc)[:70]}"


async def _抽链接(键: str, 这一族: str, 种子: str, 式子: str) -> tuple[str, str]:
    try:
        async with httpx.AsyncClient(timeout=25, headers=scraper.HEADERS, follow_redirects=True) as client:
            r = await client.get(种子)
    except Exception as exc:
        return "", f"种子页没连上 {type(exc).__name__}"
    文 = r.text.replace("\\u002F", "/")
    m = re.search(式子, 文)
    if not m:
        return "", f"种子页 HTTP {r.status_code}、抽不出文章址（无样本）"
    址 = (m.group(1) if m.groups() else m.group(0)).replace("&amp;", "&")
    if 址.startswith("//"):
        址 = "https:" + 址
    elif not 址.startswith("http"):
        址 = 种子.rstrip("/") + "/" + 址.lstrip("/")
    return 址, f"种子页 HTTP {r.status_code}"


async def _量一条(键: str, 这一族: str, 址: str, 备注: str) -> None:
    print(f"\n=== {这一族}")
    print(f"    {址}    [{备注}]")
    try:
        取 = await scraper.scrape_url(址)
    except scraper.UserError as exc:
        print(f"    用户读到那句：{str(exc)[:80]}")
        return
    except Exception as exc:
        print(f"    这一发没跑成：{type(exc).__name__}: {str(exc)[:80]}")
        return
    图 = list(取.get("images") or [])
    print(f"    文字 {len(取.get('content') or '')} 字／配图地址 {len(图)} 条／"
          f"状态 {取.get('status_code')}／这一族点名的来路 {取.get('image_referer') or '（空＝一个都不加）'}")
    本站 = f"https://{urlparse(址).hostname or ''}/"
    for u in 图[:IMG_TRY]:
        主机 = urlparse(u).hostname or ""
        if 键 == "sspai":
            行 = []
            for 档 in REFERER_VARIANTS:
                来路 = {"": "", "self": 本站, "weibo": "https://m.weibo.cn/"}[档]
                标签 = {"": "不加来路", "self": "加本站", "weibo": "加微博"}[档]
                行.append(f"{标签}→{await _下一张(u, 来路)}")
            print(f"      {主机}: " + " ｜ ".join(行))
        else:
            print(f"      {主机}: 不加来路→{await _下一张(u, '')}")


async def main() -> int:
    print("黑名单现网读数（只 SELECT，一次写都没有）：")
    db = SessionLocal()
    try:
        行 = source_blocklist.list_rows(db)
        print(f"    共 {len(行)} 行／阈值 {source_blocklist.AUTO_THRESHOLD}")
        for 一 in 行:
            print(f"    · {一['host']} 计={一['fail_count']} 末次状态={一['last_status']} "
                  f"来源={一['source']} {'已拦' if 一['blocked'] else '没拦'}")
    finally:
        db.close()

    for 键, 这一族, 址 in FIXED:
        await _量一条(键, 这一族, 址, "已知样本")
    for 键, 这一族, 种子, 式子 in SEEDS:
        址, 备注 = await _抽链接(键, 这一族, 种子, 式子)
        if not 址:
            print(f"\n=== {这一族}\n    {种子}\n    {备注}")
            continue
        await _量一条(键, 这一族, 址, 备注)
    print("\n读数完了。本脚本没写库、没进桶、没记账。")
    return 0


sys.exit(asyncio.run(main()))
