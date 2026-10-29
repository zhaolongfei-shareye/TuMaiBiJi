"""主流站点图文支持全量测量（2026-10-29）。

一条链接量四样：**打不打得开／文字取到几字／配图取到几条／那些图真下得下来吗**。
顺带取"这一族站有没有把自家站名写在页面里"那一格（`og:site_name`／`twitter:site`），
它直接决定"来源标注改成具体网站"那一刀要不要动用模型。

三通道，同一份生产代码：
    现网（服务器出口，跑真那条链，含闸门）
        ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/测-主流站点图文支持.py > /tmp/m-server.jsonl
    本机直连（境内出口，解析层）
        PROBE_CHANNEL=direct backend/.venv/bin/python docs/工具/测-主流站点图文支持.py > /tmp/m-direct.jsonl
    本机代理（境外出口，解析层）
        PROBE_CHANNEL=proxy  backend/.venv/bin/python docs/工具/测-主流站点图文支持.py > /tmp/m-proxy.jsonl

⚠ 本机那两条**不过 SSRF 闸门**：这台机器的 DNS 是 fake-ip（域名解析成 198.18.x.x），
`is_private` 把这一段算作私有 ⇒ 现网那条闸门在本机对**所有站**都拦，那是本机网络配置、不是站点结论。
所以本机两趟判的是"解析层能不能取出文与图"，闸门与出口那一条只看现网那趟。
⚠ 三趟都不写库、不进桶：贴图只"下下来并判形状"，`_upload` 一次都没调。
"""
import asyncio
import json
import os
import sys
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

CHANNEL = os.environ.get("PROBE_CHANNEL", "server")      # server | direct | proxy
PROXY = "http://127.0.0.1:7897"
IMG_TRY = 2                                              # 每族最多验两张能不能真下
SAMPLES = "/tmp/sites75.jsonl"

from app.services import scraper, note_images            # noqa: E402


def _rows():
    out = []
    with open(SAMPLES, encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if r.get("url"):
                out.append(r)
    return out


def _client_kwargs():
    kw = {"timeout": 30, "headers": scraper.HEADERS, "follow_redirects": True}
    if CHANNEL == "proxy":
        kw["proxy"] = PROXY
    return kw


def _site_name_clues(html: str) -> dict:
    """这一族有没有把站名写在页面里（决定"要不要模型"的那一枚读数）。"""
    soup = BeautifulSoup(html, "html.parser")

    def meta(**kw):
        el = soup.find("meta", attrs=kw)
        return (el.get("content") or "").strip() if el and el.get("content") else ""

    return {
        "og_site_name": meta(property="og:site_name"),
        "twitter_site": meta(name="twitter:site") or meta(property="twitter:site"),
        "dublin_core": meta(name="DC.title"),
        "jsonld_publisher": _jsonld_publisher(soup),
        "title": (soup.title.get_text(strip=True)[:60] if soup.title else ""),
    }


def _jsonld_publisher(soup) -> str:
    """`<script type="application/ld+json">` 里 `publisher.name`——很多新闻站写了。"""
    import json as _json
    for sc in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = _json.loads(sc.string or sc.get_text() or "")
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for it in items:
            if isinstance(it, dict):
                pub = it.get("publisher")
                if isinstance(pub, dict) and pub.get("name"):
                    return str(pub["name"])[:60]
    return ""


async def _try_images(urls: list[str], referer: str) -> list[dict]:
    """按现网那条规则下前两张：不带 Referer、回体用 `_inspect` 判（占位图会当场被拦）。"""
    out = []
    if not urls:
        return out
    async with httpx.AsyncClient(**_client_kwargs()) as client:
        for u in urls[:IMG_TRY]:
            row = {"url_host": urlparse(u).hostname, "bytes": 0, "verdict": ""}
            try:
                data = await _download_only(client, u)
                row["bytes"] = len(data)
                im, long_edge = note_images._inspect(data)
                row["verdict"] = f"OK {im.width}x{im.height} {im.format} 长边{long_edge}"
            except Exception as exc:
                row["verdict"] = f"SKIP {type(exc).__name__}: {str(exc)[:80]}"
            out.append(row)
    return out


async def _download_only(client: httpx.AsyncClient, url: str) -> bytes:
    """本机两条通道不走闸门（fake-ip 会全站误拦），现网那趟走真的那条。"""
    if CHANNEL == "server":
        return await note_images._download(client, url)
    current = url
    for _ in range(note_images.MAX_REDIRECTS):
        async with client.stream("GET", current) as resp:
            if resp.is_redirect:
                loc = resp.headers.get("location", "")
                if not loc:
                    raise note_images.SkipImage("跳转没有 Location")
                current = loc if loc.startswith("http") else str(httpx.URL(current).join(loc))
                continue
            if resp.status_code >= 400:
                raise note_images.SkipImage(f"站点回 HTTP {resp.status_code}")
            ctype = (resp.headers.get("content-type") or "").lower()
            if not ctype.startswith("image/"):
                raise note_images.SkipImage(f"响应头不是图片（{ctype or '空'}）")
            chunks = []
            total = 0
            async for c in resp.aiter_bytes(8192):
                total += len(c)
                if total > note_images.MAX_FILE_BYTES:
                    raise note_images.SkipImage("单张超限")
                chunks.append(c)
            return b"".join(chunks)
    raise note_images.SkipImage("跳转次数过多")


async def _one(row: dict) -> dict:
    url = row["url"]
    rec = {"key": row["key"], "label": row["label"], "domestic": row["domestic"],
           "channel": CHANNEL, "url": url, "open": False, "err": "", "status": 0,
           "title": "", "chars": 0, "imgs": 0, "author": "", "source_type": "",
           "clues": {}, "img_probe": []}
    html = ""
    if CHANNEL == "server":
        try:
            parsed = await scraper.scrape_url(url)
            rec.update(open=True, status=parsed.get("status_code") or 0,
                       title=(parsed.get("title") or "")[:60],
                       chars=len(parsed.get("content") or ""),
                       imgs=len(parsed.get("images") or []),
                       author=parsed.get("author") or "",
                       source_type=parsed.get("source_type") or "")
            imgs = list(parsed.get("images") or [])
        except scraper.UserError as exc:
            rec["err"] = str(exc)[:120]
            return rec
        except Exception as exc:
            rec["err"] = f"{type(exc).__name__}: {str(exc)[:100]}"
            return rec
        try:
            async with httpx.AsyncClient(**_client_kwargs()) as client:
                r = await client.get(url)
                html = r.text
        except Exception as exc:
            rec["clues"] = {"fetch_err": type(exc).__name__}
    else:
        try:
            async with httpx.AsyncClient(**_client_kwargs()) as client:
                r = await client.get(url)
            rec["status"] = r.status_code
            rec["open"] = r.status_code < 400
            html = r.text
        except Exception as exc:
            rec["err"] = f"{type(exc).__name__}: {str(exc)[:100]}"
            return rec
        st = scraper._detect_source_type(url)
        if st == "wechat_article":
            parsed = scraper._parse_wechat_article(html, url, st)
        else:
            parsed = scraper._parse_general_url(html, url, st)
            if scraper._is_xiaohongshu(url):
                parsed.update(scraper._xiaohongshu_extras(html))
        rec.update(title=(parsed.get("title") or "")[:60], chars=len(parsed.get("content") or ""),
                   imgs=len(parsed.get("images") or []), author=parsed.get("author") or "",
                   source_type=parsed.get("source_type") or "")
        imgs = list(parsed.get("images") or [])
    if html:
        rec["clues"] = _site_name_clues(html)
        rec["html_bytes"] = len(html.encode("utf-8", "ignore"))
    if rec["open"] and imgs:
        rec["img_probe"] = await _try_images(imgs, url)
    return rec


async def _main():
    for row in _rows():
        try:
            rec = await _one(row)
        except Exception as exc:                      # 一族崩了不许带塌整趟
            rec = {"key": row["key"], "label": row["label"], "channel": CHANNEL,
                   "err": f"probe {type(exc).__name__}: {str(exc)[:120]}", "open": False,
                   "chars": 0, "imgs": 0, "clues": {}, "img_probe": []}
        print(json.dumps(rec, ensure_ascii=False), flush=True)
        sys.stderr.write(f"{row['key']}\topen={rec.get('open')}\tchars={rec.get('chars')}\t"
                         f"imgs={rec.get('imgs')}\t{rec.get('err','')[:60]}\n")


if __name__ == "__main__":
    asyncio.run(_main())
