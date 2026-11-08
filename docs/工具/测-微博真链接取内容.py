"""微博真链接取内容（2026-10-31 那一刀的现跑尺子）。

站长原话「我的需求，就是要提取内容，至于怎么提取，你考虑，我只要结果」，
样本是他给的那一条：`https://weibo.com/1649679354/5359090512694626`。

这条尺子量四样，逐条对着期望判：**取到几字／几张配图／那些图真下得下来吗／取不到的那几种念的是哪一句**。
链接全部是真链接（号码现抄，一条没编），形状是 10-31 现读到的那几种：

| 这一型 | 怎么找到的 | 期望 |
|---|---|---|
| 图文六张 | 站长给的那条 | 有字、6 张图、作者「初晓敏」 |
| bid 形状＋话题 | 央视新闻另一条（号码是 9 位字母数字，不是数字） | 有字、有图 |
| 视频长文 | 央视新闻那条写"视频请看链接"的 | 有字（长文全文那一发也照取） |
| 转发 | 周深工作室转发央视新闻 | 转发语＋`//@原作者：`原文 |
| 移动页 detail | `m.weibo.cn/detail/<数字>` | 有字 |
| 微博主页 | `weibo.com/u/<uid>`（不是某一条） | **落回网页那一路**＝今天的形状（访客壳、0 字），不许新增失败 |
| 已删除 | `5007815001244072` | 当场念「这条微博不存在或已被删除」 |
| 博主设了权限 | `1736988591/5218886967890075` | 当场念「这条微博设置了权限，看不到内容」 |

⚠ 后两型都回 **HTTP 200**：状态码上什么都看不见，只有那份数据里的错误码分得开，
所以这一趟不只量"取到多少"，也量"取不到时念的是哪一句"——那句是要进 toast 的。

跑法（同一份生产代码，两条出口腿）：
    现网（服务器真出口，含闸门）
        ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/测-微博真链接取内容.py
    本机代理（境外出口，只判解析层）
        PROBE_CHANNEL=proxy backend/.venv/bin/python docs/工具/测-微博真链接取内容.py
⚠ 本机这趟**绕过闸门**：这台机器的 DNS 是 fake-ip（域名解析成 198.18.x.x），
`is_private` 把这一段算私有 ⇒ 真闸门在本机对所有站都拦，那是本机网络配置、不是站点结论（同 10-29 那把尺子）。
⚠ 两条腿都不写库、不进桶：贴图只"下下来并判形状"，上传那一步一次都没调。
"""
import asyncio
import os
import sys

import httpx

# 这条尺子在仓库任意位置都能跑：把 backend 那一级塞进模块搜索路径。
# 现网那一趟是 `ssh … python - < 这把尺子`（从标准输入读，没有 `__file__`），
# 那一趟的 cwd 已经是 backend 目录，`app` 本来就找得到，所以这里判一下再插。
_本文件 = globals().get("__file__")
if _本文件:
    sys.path.insert(0, os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(_本文件)))), "backend"))

CHANNEL = os.environ.get("PROBE_CHANNEL", "server")      # server | proxy
PROXY = "http://127.0.0.1:7897"
IMG_TRY = 2                                              # 每条最多验两张真下得下来

from app.core.errors import UserError                     # noqa: E402
from app.services import note_images, scraper             # noqa: E402

# 现网那台跑的还是**改之前**的那一份（这一刀没上现网）。给一个环境变量把本地这一份
# 按文件路径加载进来，才能在"服务器出口＋真闸门"这条腿上证新代码，而不动现网那个目录。
# `WB_CODE` 指到上传上去的新 scraper.py；不设就用现场那一份（改完上线后复跑时正好不设）。
_换码 = os.environ.get("WB_CODE", "").strip()
if _换码:
    import importlib.util

    _规格 = importlib.util.spec_from_file_location("app.services.scraper", _换码)
    _新 = importlib.util.module_from_spec(_规格)
    _规格.loader.exec_module(_新)
    print("代码腿：用 %s 这一份（现网目录里那份与它%s）" % (
        _换码, "不同" if open(_换码, "rb").read() != open(scraper.__file__, "rb").read() else "相同"))
    scraper = _新

CASES = [
    {"key": "图文六张", "url": "https://weibo.com/1649679354/5359090512694626",
     "最少字数": 10, "最少图数": 6, "要作者": True, "落回网页": False, "该念": ""},
    {"key": "bid形状带话题", "url": "https://weibo.com/2656274875/H5Ro3mlPz",
     "最少字数": 40, "最少图数": 3, "要作者": True, "落回网页": False, "该念": ""},
    {"key": "视频长文", "url": "https://weibo.com/2656274875/5219471979709155",
     "最少字数": 300, "最少图数": 0, "要作者": True, "落回网页": False, "该念": ""},
    {"key": "转发带原文", "url": "https://weibo.com/7478855230/5208601192040603",
     "最少字数": 100, "最少图数": 0, "要作者": True, "落回网页": False, "该念": ""},
    {"key": "移动页detail", "url": "https://m.weibo.cn/detail/5070809180407657",
     "最少字数": 200, "最少图数": 0, "要作者": True, "落回网页": False, "该念": ""},
    {"key": "微博主页", "url": "https://weibo.com/u/1649679354",
     "最少字数": 0, "最少图数": 0, "要作者": False, "落回网页": True, "该念": ""},
    {"key": "已删除", "url": "https://weibo.com/2189978113/5007815001244072",
     "最少字数": 0, "最少图数": 0, "要作者": False, "落回网页": False,
     "该念": "这条微博不存在或已被删除"},
    {"key": "博主设权限", "url": "https://weibo.com/1736988591/5218886967890075",
     "最少字数": 0, "最少图数": 0, "要作者": False, "落回网页": False,
     "该念": "这条微博设置了权限，看不到内容"},
]

读到的 = []      # 每条取到的图地址，末尾用于现下两张
不合格 = []
判据数 = 0


def 判(这条, 满足, 读数):
    """一条判据＝一句能对着屏幕核的话；不满足就记进不合格（计数与读数一律现算，不写死）。"""
    global 判据数
    判据数 += 1
    if not 满足:
        不合格.append("%s：%s" % (这条["key"], 读数))
    print("   %s %s ｜ %s" % ("✓" if 满足 else "✗", 这条["key"], 读数))


def 出口kwargs(来路=""):
    """按生产那一套来：贴图那条链用的头是 `note_images.IMAGE_HEADERS`（桌面 UA＋`Accept: image/*`、
    **默认不带 Referer**），只有抓取那一层点名要的这批才把来路加上（微博就是这一批，10-31 读数）。"""
    头 = dict(note_images.IMAGE_HEADERS)
    if 来路:
        头["Referer"] = 来路
    kw = {"timeout": 30, "headers": 头, "follow_redirects": False}
    if CHANNEL == "proxy":
        kw["proxy"] = PROXY
    return kw


async def 下图(urls, 来路=""):
    """按现网那条规则下前两张：`note_images._download`（含闸门与占位图判），只下不传。"""
    out = []
    async with httpx.AsyncClient(**出口kwargs(来路)) as client:
        for 地址 in urls[:IMG_TRY]:
            try:
                数据 = await note_images._download(client, 地址)
                图, 长边 = note_images._inspect(数据)
                out.append("OK %dx%d %s %dB" % (图.width, 图.height, 图.format, len(数据)))
            except Exception as exc:
                out.append("SKIP %s: %s" % (type(exc).__name__, str(exc)[:70]))
    return out


async def 跑一条(这条):
    print("─" * 72)
    print("%s  %s" % (这条["key"], 这条["url"]))
    try:
        取 = await scraper.scrape_url(这条["url"])
    except UserError as 拒:
        判(这条, 这条["该念"] and str(拒) == 这条["该念"],
          "取不到，念的是「%s」%s" % (拒, "" if not 这条["该念"] else "（期望「%s」）" % 这条["该念"]))
        return
    except Exception as 异:
        判(这条, False, "炸出没料到的异常 %s: %s" % (type(异).__name__, str(异)[:90]))
        return

    字 = len(取.get("content") or "")
    图 = 取.get("images") or []
    题 = 取.get("title") or ""
    者 = 取.get("author") or ""

    if 这条["落回网页"]:
        判(这条, 字 == 0 and "Visitor" in 题,
           "落回网页那一路：正文 %d 字、标题「%s」（这一型本来就不是某一条微博，与今天逐字相同）" % (字, 题[:28]))
        return

    判(这条, 字 >= 这条["最少字数"], "正文 %d 字（门槛 ≥%d）｜开头「%s」" % (字, 这条["最少字数"], (取["content"] or "")[:34]))
    判(这条, len(图) >= 这条["最少图数"], "配图 %d 条地址（门槛 ≥%d）" % (len(图), 这条["最少图数"]))
    if 这条["要作者"]:
        判(这条, bool(者), "作者「%s」" % 者)
    判(这条, bool(题), "标题「%s」" % 题[:30])
    判(这条, 字 > 0, "屏上不该再念「未能从 URL 提取到有效内容」（正文取到 %d 字）" % 字)
    if 图:
        结 = await 下图(图, (取.get("image_referer") or ""))
        判(这条, all(r.startswith("OK") for r in 结), "真下两张：%s" % " ／ ".join(结))


async def 主():
    print("出口腿：%s%s" % (CHANNEL, "（本机代理，闸门已绕过——理由见文件头）" if CHANNEL != "server" else "（服务器真出口，含闸门）"))
    if CHANNEL != "server":
        scraper._validate_url = lambda u: u
    for 这条 in CASES:
        await 跑一条(这条)
    print("═" * 72)
    print("判据 %d 条 · 不合格 %d 条" % (判据数, len(不合格)))
    for 红 in 不合格:
        print("  ✗", 红)
    return 1 if 不合格 else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(主()))
