"""小红书这一族的正文到底在不在 `__INITIAL_STATE__` 那段 JSON 里。

跑法（本机与现网各跑一次，同一把脚本、同一份代码）：
    本机  backend/.venv/bin/python docs/工具/探-小红书正文在不在JSON里.py
    现网  ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-小红书正文在不在JSON里.py

为什么单独立一把：他那句「小红书是另外一种提取方法」——我上一轮只把**图与作者**改吃那段 JSON、正文仍走 DOM，
还把现网那句 `failed｜未能从 URL 提取到有效内容` 定性成"出网身份（IP），不在代码"。
这把尺子只读、对现网零写，回答三件事：① 这一段 JSON 里到底有没有正文（`desc`）与标题；
② 这一台机器跟短链跟到第几跳、落点里有没有笔记；③ DOM 那一份（`_parse_general_url` 的 `content`）到底是什么字。
"""
import asyncio
import json
import sys

sys.path.insert(0, ".")

import httpx  # noqa: E402

from app.services import scraper  # noqa: E402

URL = "http://xhslink.cn/o/9F1fAXNBL1I"


def line(label, value):
    print(f"{label}: {value}")


def state_note(html):
    """复用生产那一段解析，把 `__INITIAL_STATE__` 里的 note 对象原样取出来。"""
    at = html.find(scraper._XHS_STATE_KEY)
    if at < 0:
        return None, "页面里没有 __INITIAL_STATE__"
    blob = scraper._balanced_object(html, at + len(scraper._XHS_STATE_KEY))
    if not blob:
        return None, "__INITIAL_STATE__ 花括号配不对"
    data = json.loads(scraper._XHS_UNDEFINED.sub("null", blob))
    detail = ((data.get("note") or {}).get("noteDetailMap") or {})
    for value in detail.values():
        if isinstance(value, dict) and isinstance(value.get("note"), dict):
            return value["note"], f"noteDetailMap 有 {len(detail)} 键"
    return None, f"noteDetailMap 空（顶层键={sorted(data.keys())[:12]}）"


async def raw_chain():
    """自己跟一遍跳转，把末址、字节数与那一段 JSON 里有什么打全。"""
    hops = []
    async with httpx.AsyncClient(follow_redirects=False, timeout=30,
                                 headers=scraper.HEADERS) as client:
        current = URL
        for _ in range(6):
            r = await client.get(current)
            if r.is_redirect:
                loc = r.headers.get("location", "")
                nxt = loc if loc.startswith("http") else str(httpx.URL(current).join(loc))
                hops.append((r.status_code, current, nxt[:160]))
                current = nxt
                continue
            hops.append((r.status_code, current, f"{len(r.content)} B"))
            return current, r.text, hops
    return current, "", hops


def main():
    line("这台机器", f"{__import__('socket').gethostname()} python{__import__('sys').version.split()[0]}")
    parsed = asyncio.run(scraper._fetch_and_parse(URL))
    line("_fetch_and_parse 标题", parsed.get("title"))
    line("_fetch_and_parse 正文字数", len(parsed.get("content") or ""))
    line("_fetch_and_parse 正文前 120 字", repr((parsed.get("content") or "")[:120]))
    line("_fetch_and_parse 图张数", len(parsed.get("images") or []))
    line("_fetch_and_parse 作者", parsed.get("author"))
    line("_fetch_and_parse 状态码", parsed.get("status_code"))

    final_url, html, hops = asyncio.run(raw_chain())
    line("末址", final_url[:200])
    line("页面字节", len(html))
    for code, src, dst in hops:
        line("  跳转", f"{code} {src[:90]} -> {dst}")
    note, why = state_note(html)
    line("JSON 里那一段", why)
    if note:
        line("note 的键", sorted(note.keys()))
        line("note.title", repr(note.get("title"))[:120])
        desc = note.get("desc")
        line("note.desc 字数", len(desc) if isinstance(desc, str) else desc)
        line("note.desc 前 80 字", (desc or "")[:80] if isinstance(desc, str) else "")
        il = note.get("imageList") or []
        line("note.imageList 张数", len(il))
        line("note.user.nickname", (note.get("user") or {}).get("nickname"))
        line("note.time", note.get("time"))
    else:
        line("页面里几个关键字命中",
             {k: html.count(k) for k in ("noteDetailMap", "imageList", "urlDefault", '"desc"', "nickname")})


main()
