"""现网出口验搜狐与少数派这两刀（真链接、生产代码、**零写**：不写库、不进桶、不碰黑名单那笔账）。

跑法（先把这台机器上改好的三只文件传到现网那台的一个临时目录，再拿现网的出口跑——现网服务本身不动一行）：
    scp backend/app/services/scraper.py agentsbin:/tmp/new_scraper.py
    scp backend/app/services/note_images.py agentsbin:/tmp/new_note_images.py
    scp backend/app/tasks/ingest_tasks.py agentsbin:/tmp/new_ingest_tasks.py
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/测-搜狐与少数派取图.py

为什么用影子加载：这两刀的落地状态是"已落码、未上现网"。直接 `import app.services.scraper` 量到的是
**现网那一份**（还没有搜狐那一段），会把"没修"读成"修坏了"。这里把两份新文件按同名装进 sys.modules，
`note_images` 里 `from app.services import scraper` 取到的就是新那一份，量的是改完的行为。

传与不传的差别只有一处：本探针把 `_upload` 换成一个只记账的替身，所以**桶里不会多一个对象**，
下载／解压／判占位／压／编码那几步走的都是真代码。⚠ 屏上那两句实话（"截了 N 张、M 张没存上"）
要等现网部署之后、真建一篇才有读数——这一把量不到，别把它读成端到端过了。

真链接一律从各家自己的首页／RSS 现抽，一条都不许编；对照那三条（微博／网易／公众号）是库里记过读数的已知样本。
"""
import asyncio
import importlib.util
import os
import re
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.getcwd())

import httpx  # noqa: E402

判据 = []
不合格 = []


def 判(这条, 成立, 读数=""):
    判据.append(这条)
    if not 成立:
        不合格.append((这条, 读数))
    print(("  过 " if 成立 else "  ★红 ") + f"{这条}｜{读数}")


def 影子加载(名, 路径):
    if not os.path.exists(路径):
        print(f"新代码不在：{路径}（照文件头那三条 scp 先传）")
        sys.exit(1)
    spec = importlib.util.spec_from_file_location(名, 路径)
    模 = importlib.util.module_from_spec(spec)
    sys.modules[名] = 模
    spec.loader.exec_module(模)
    return 模


scraper = 影子加载("app.services.scraper", "/tmp/new_scraper.py")
note_images = 影子加载("app.services.note_images", "/tmp/new_note_images.py")
from app.models.asset import MAX_ASSETS_PER_NOTE  # noqa: E402  上限那一枚常量与现网同源，这里不另立一个数
from app.services import source_blocklist  # noqa: E402  这一只是现网那份（只 SELECT 读它，不改它）
from app.db.database import SessionLocal  # noqa: E402

存过 = []          # 每调一次 archive 清一次，看"这一篇存下几张"
累计 = []          # 整把探针一共打了几次存图函数（全是替身）


async def 替身上传(client, 云路径, 数据):
    存过.append((云路径, len(数据)))
    累计.append((云路径, len(数据)))
    return "cloud://替身/" + 云路径.rsplit("/", 1)[-1], {"bytes": len(数据)}


async def 不检(数据, 址):
    return None


note_images._upload = 替身上传
note_images._guard_image_pixels = 不检
note_images._guard_image_text = lambda openid, 数据, 址: asyncio.sleep(0)
note_images.channel_ready = lambda: True


async def 走真链存一遍(址列表, 来路="", 换UA=""):
    """调 `archive` 本体（上传那一格换替身），回 (存下, 失败, 总)——头怎么拼、占位怎么拦、压到哪一档全是真代码。"""
    存过.clear()
    结 = await note_images.archive(址列表, "0", MAX_ASSETS_PER_NOTE,
                                   referer=来路, user_agent=换UA)
    return len(结.kept), len(结.failed), 结.total


async def 抽搜狐真链接(客户, 条数=3):
    r = await 客户.get("https://news.sohu.com/")
    出 = []
    for m in re.finditer(r"(?:https:)?//www\.sohu\.com/a/\d{6,12}_\d{4,10}", r.text):
        址 = m.group(0)
        址 = 址 if 址.startswith("http") else "https:" + 址
        if 址 not in 出:
            出.append(址)
        if len(出) >= 条数:
            break
    return 出


async def 抽sspai真链接(客户):
    r = await 客户.get("https://sspai.com/feed")
    m = re.search(r"<link>(https?://sspai\.com/post/\d+)</link>", r.text)
    return m.group(1) if m else ""


async def 逐张量(址列表, 来路="", 换UA=""):
    """逐张走真那条下载＋那一判占位图，回 (下到, 下不动, 被占位判拦掉)。
    分开数是因为这三件事各有出口：下不动＝站点挡；占位拦＝我们那条形状判据在起作用，不是坏了。"""
    头 = dict(note_images.IMAGE_HEADERS)
    if 来路:
        头["Referer"] = 来路
    if 换UA:
        头["User-Agent"] = 换UA
    下到 = 下不动 = 占位 = 0
    async with httpx.AsyncClient(timeout=25, headers=头, follow_redirects=False) as 客:
        for u in 址列表:
            try:
                数据 = await note_images._download(客, u)
            except Exception:
                下不动 += 1
                continue
            下到 += 1
            try:
                note_images._inspect(数据)
            except Exception:
                占位 += 1
    return 下到, 下不动, 占位


async def main():
    print("=== 零、黑名单现读（只 SELECT，本探针一次写都没有）")
    db = SessionLocal()
    try:
        行 = source_blocklist.list_rows(db)
        名 = {一["host"]: 一 for 一 in 行}
        判("黑名单还是那三行（这一把没写它）", len(行) == 3,
          " / ".join(f"{k} 计={v['fail_count']} {'已拦' if v['blocked'] else '没拦'}" for k, v in 名.items()))
        判("微博与知乎那一格没被这一把顶高", 名.get("weibo.com", {}).get("fail_count", 0) <= 2
            and 名.get("www.zhihu.com", {}).get("fail_count", 0) <= 2, "见上一行")
    finally:
        db.close()

    头 = {"User-Agent": scraper.HEADERS["User-Agent"], "Accept": scraper.HEADERS["Accept"]}
    async with httpx.AsyncClient(timeout=30, headers=头, follow_redirects=True) as 客:
        print("\n=== 一、搜狐：www 那型三篇真文章")
        搜狐址们 = await 抽搜狐真链接(客)
        量过的篇 = 0
        for 址 in 搜狐址们:
            取 = await scraper.scrape_url(址)
            图 = 取.get("images") or []
            if not 图:
                print(f"\n  {址}｜这一篇本来就没图（容器与名单都 0 张），跳过不判")
                continue
            量过的篇 += 1
            密文在 = any("itc.cn" not in (urlparse(u).netloc or "") for u in 图)
            点名UA = (取.get("image_user_agent") or "").strip()
            print(f"\n  {址}｜{len(取.get('content') or '')} 字／名单 {len(图)} 条")
            判("取回的是地址、不是密文补的址", bool(图) and not 密文在,
              f"{len(图)} 条，主机 {sorted({urlparse(u).netloc for u in 图})}")
            判("回体点名换 UA、且不带来路", 点名UA == scraper._SOHU_IMAGE_UA
                and not (取.get("image_referer") or ""), 点名UA[:24])
            下, 败, 总 = await 走真链存一遍(图, 换UA=点名UA)
            判("按点名的 UA 逐张真下：存下的张数 == 名单张数", 下 == 总 and 败 == 0,
              f"存 {下}／败 {败}／总 {总}")
            下2, 败2, 总2 = await 走真链存一遍(图)
            判("反向对照：不点名（生产那枚 UA）这一族存不全", 下2 < 总2,
              f"不点名存 {下2}／总 {总2}，点名存 {下}／总 {总}")
        判("搜狐这一型至少量到两篇有图的（这一把不是空跑）", 量过的篇 >= 2, f"量到 {量过的篇} 篇")

        print("\n=== 二、搜狐：m 那型同篇")
        移 = await scraper.scrape_url("https://m.sohu.com/a/1095436048_220095")
        图 = 移.get("images") or []
        判("移动版那页的键叫 imageList 也认（2 条真址）", len(图) == 2
            and all("itc.cn" in (urlparse(u).netloc or "") for u in 图), f"{len(图)} 条")
        判("移动版同样点名换 UA", (移.get("image_user_agent") or "") == scraper._SOHU_IMAGE_UA, "")

        print("\n=== 三、少数派：地址早就取得到，卡的是下载要带来路")
        s = await 抽sspai真链接(客)
        取 = await scraper.scrape_url(s)
        图 = 取.get("images") or []
        print(f"\n  {s}｜{len(取.get('content') or '')} 字／名单 {len(图)} 条")
        判("通用那一路本来就取得到多条图地址", len(图) >= 3, f"{len(图)} 条")
        判("回体点名带来路、且不换 UA", (取.get("image_referer") or "") == "https://sspai.com/"
            and not (取.get("image_user_agent") or ""), 取.get("image_referer", ""))
        下, 败, 总 = await 走真链存一遍(图, 来路="https://sspai.com/")
        下到, 下不动, 占位 = await 逐张量(图, 来路="https://sspai.com/")
        _取9, _不动9, 占位9 = await 逐张量(图[:9], 来路="https://sspai.com/")
        判("带点名的来路时下载这一层一张都不掉（下不动 0 张）", 下不动 == 0 and 下到 == len(图),
          f"下到 {下到}／下不动 {下不动}／名单 {len(图)}")
        判("存下的张数 == 取的那九张 − 其中被占位判拦掉的张数", 下 == 9 - 占位9 and 败 == 占位9,
          f"存 {下}／败 {败}／总 {总}／九张名额里占位判拦 {占位9} 张")
        下到2, 下不动2, 占位2 = await 逐张量(图)
        判("反向对照：不带来路这一族一张都下不动", 下到2 == 0 and 下不动2 == len(图),
          f"不带来路：下到 {下到2}／下不动 {下不动2}／名单 {len(图)}")

        print("\n=== 四、对照三条不许被这一刀改坏（已知样本）")
        微 = await scraper.scrape_url("https://weibo.com/1649679354/5359090512694626")
        判("微博那一条仍是图文俱在（42 字／6 张／点名微博来路）",
          len(微.get("content") or "") >= 40 and len(微.get("images") or []) == 6
          and (微.get("image_referer") or "") == "https://m.weibo.cn/"
          and not (微.get("image_user_agent") or ""),
          f"{len(微.get('content') or '')} 字／{len(微.get('images') or [])} 张")
        易 = await scraper.scrape_url("https://c.m.163.com/news/a/LAD6VGQO00097U7T.html")
        判("网易那一篇仍 4,541 字／8 张、两格都不给",
          len(易.get("content") or "") > 4000 and len(易.get("images") or []) == 8
          and not (易.get("image_referer") or "") and not (易.get("image_user_agent") or ""),
          f"{len(易.get('content') or '')} 字／{len(易.get('images') or [])} 张")
        众 = await scraper.scrape_url("https://mp.weixin.qq.com/s/H2BANSW_U-Jjl1Ic_ZuZKA")
        判("公众号图文型仍取到 30 张以上、两格都不给",
          len(众.get("images") or []) >= 30 and not (众.get("image_referer") or "")
          and not (众.get("image_user_agent") or ""), f"{len(众.get('images') or [])} 张")

    print(f"\n判据 {len(判据)} 条 · 不合格 {len(不合格)} 条")
    for 这, 读 in 不合格:
        print("  ★", 这, "｜", 读)
    print(f"这一把打了存图函数 {len(累计)} 次：全是替身，桶里一个真对象都没多（上传那一步一次都没真调）")
    return 1 if 不合格 else 0


sys.exit(asyncio.run(main()))
