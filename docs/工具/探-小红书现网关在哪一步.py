"""小红书在现网那台机器上到底关到哪一步：笔记页、图床、换 UA、带 cookie，四样各打一次。

跑法（同一把脚本两台各跑一次，只比读数）：
    本机  backend/.venv/bin/python docs/工具/探-小红书现网关在哪一步.py
    现网  ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-小红书现网关在哪一步.py

全程只 GET、不写现网任何东西。为什么问这四样：上一格已确认"取法"按正本改净了（四格全吃
`__INITIAL_STATE__`），本机正文 41 字／5 张图真存下来了；现网那台跟第二跳被 302 进 `/login`。
他问"小红书不能提取吗"——**得把"不能"钉到具体哪一步**：是笔记页不给（那图床给不给？），
还是整站对这台机器关门（那图床也白搭），还是只是 UA／缺 cookie（那是我们自己能改的）。
"""
import sys

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.services import scraper  # noqa: E402

NOTE = ("https://www.xiaohongshu.com/discovery/item/6ad40f01000000002203c359"
        "?app_platform=android&ignoreEngage=true&app_version=9.46.0"
        "&share_from_user_hidden=true&xsec_source=app_share&type=normal"
        "&xsec_token=CBUezgT0tf8spVt3PDlhdtEGqTI3urfUDyT55DCT5NpSA%3D&app_share_normal_new=true")
IMG = ("http://sns-webpic-qc.xhscdn.com/202610190718/b49ea615ac6f210e871a5cf45a607a81/"
       "1040g2sg326edrrqf58e05nm0idp08fkcvaoqi3g!nd_dft_wlteh_jpg_3")
UA = {
    "桌面 Chrome（生产那套）": scraper.HEADERS,
    "iPhone Safari": {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"},
    "微信内置 webview": {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) "
                                      "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
                                      "MicroMessenger/8.0.42(0x18002a32) NetType/WIFI"},
    "App 里那套 okhttp": {"User-Agent": "okhttp/4.9.3", "Accept": "*/*"},
}


def say(label, ok, extra=""):
    print(f"{'✓' if ok else '✗'} {label}｜{extra}")


def has_note(text):
    return "noteDetailMap" in text


def probe_note(name, headers):
    """直打笔记页（跳过短链那一跳），看这一套头能不能把笔记内容要到。"""
    try:
        with httpx.Client(follow_redirects=False, timeout=25, headers=headers) as c:
            r = c.get(NOTE)
        if r.is_redirect:
            say(f"笔记页／{name}", False,
                f"{r.status_code} → {(r.headers.get('location') or '')[:60]}")
            return
        r2 = httpx.get(NOTE, timeout=25, headers=headers, follow_redirects=True)
        body = r2.text
        say(f"笔记页／{name}", has_note(body),
            f"末跳 {r2.status_code}／{len(r2.content):,} B／noteDetailMap {'有' if has_note(body) else '无'}"
            f"／host={httpx.URL(str(r2.url)).host}")
    except Exception as e:  # noqa: BLE001 — 探针要把任何一型的出网失败也落成一行读数
        say(f"笔记页／{name}", False, f"{type(e).__name__}: {e}"[:120])


def main():
    print(f"这台机器 {__import__('socket').gethostname()}")
    for name, h in UA.items():
        probe_note(name, h)
    probe_note("桌面 Chrome＋webId cookie",
               {**scraper.HEADERS, "Cookie": "webId=" + "0" * 40 + "; gid=" + "0" * 32})
    # 图床那一路：笔记页不给的时候，图还能不能下（能下就说明卡点只在页面那一跳）
    try:
        r = httpx.get(IMG, timeout=25, follow_redirects=False)
        say("图床不带 Referer", r.status_code == 200 and len(r.content) > 4096,
            f"{r.status_code}／{len(r.content):,} B／{r.headers.get('content-type')}")
    except Exception as e:  # noqa: BLE001
        say("图床不带 Referer", False, f"{type(e).__name__}: {e}"[:120])
    print("（图床那条地址是本机今天 07:3x 抽到的，带时间戳目录，隔天可能本身就失效——两台读数是同一时刻取的才有意义）")


main()
