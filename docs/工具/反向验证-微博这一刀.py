"""反向验证：把每一处"新写的判据 supposed 拦住的错法"改回错法，看用例是否真的红。

只在 /tmp/wb_mut/backend 那份**副本**上动，真树一行不碰。跑完自动还原。
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/tmp/wb_mut/backend")
PY = "/Users/zlfmac/Documents/TuMaiBiJi/backend/.venv/bin/python"

MUT = [
    ("①来路做成全局默认", "app/services/note_images.py",
     'referer: str = "") -> ArchiveResult:',
     'referer: str = "https://m.weibo.cn/") -> ArchiveResult:',
     "tests/test_note_images.py::Test一_占位图与硬拒::test_默认那一批一个字的Referer都不加"),
    ("②点名要的那一枚没挂上", "app/services/note_images.py",
     "    if referer:", "    if False:",
     "tests/test_note_images.py::Test一_占位图与硬拒::test_点名要的那一批才带那一枚来路"),
    ("③worker 那一环漏递", "app/tasks/ingest_tasks.py",
     'referer=(scraped.get("image_referer") or "").strip()))',
     'referer=""))',
     "tests/test_note_images.py::Test八之补_worker把真openid递下来::test_抓取那一层点名的来路要一路递到下载这一步"),
    ("④图取了 360 那一档", "app/services/scraper.py",
     'big = large.get("url") if isinstance(large, dict) else ""',
     'big = ""',
     "tests/test_scraper_weibo.py"),
    ("⑤闸门按子串认域名", "app/services/scraper.py",
     'return (urlparse(url).hostname or "").lower() in _WEIBO_HOSTS',
     'return "weibo.com" in url or "m.weibo.cn" in url',
     "tests/test_scraper_weibo.py"),
    ("⑥ok=0 改成悄悄落回网页", "app/services/scraper.py",
     'raise UserError(_WEIBO_ERRNO_HINT.get(errno) or "这条微博读不到内容")',
     'return None',
     "tests/test_scraper_weibo.py"),
    ("⑦表情整枚删掉", "app/services/scraper.py",
     'img.replace_with((img.get("alt") or "").strip())',
     'img.decompose()',
     "tests/test_scraper_weibo.py"),
    ("⑧转发原文不接", "app/services/scraper.py",
     'rt = data.get("retweeted_status")',
     'rt = None',
     "tests/test_scraper_weibo.py"),
    ("⑨长文口不取", "app/services/scraper.py",
     'own = own_full or _weibo_text(data.get("text"))',
     'own = _weibo_text(data.get("text"))',
     "tests/test_scraper_weibo.py"),
]

bad = []
for label, rel, old, new, target in MUT:
    p = ROOT / rel
    src = p.read_text()
    if old not in src:
        bad.append((label, "锚点找不到（这份副本不是当前代码）"))
        continue
    p.write_text(src.replace(old, new, 1))
    r = subprocess.run([PY, "-m", "pytest", target, "-q", "-p", "no:cacheprovider"],
                       cwd=ROOT, capture_output=True, text=True)
    p.write_text(src)
    out = r.stdout
    n = len([l for l in out.splitlines() if l.startswith("FAILED")])
    key = "failed" in out and n > 0
    print("%-22s %s  红 %d 条  %s" % (label, "有牙" if key else "★没牙", n,
                                      (out.splitlines()[-1] if out.splitlines() else r.stderr[-200:])))
    if not key:
        bad.append((label, "改了错法但用例没红"))
r = subprocess.run([PY, "-m", "pytest", "tests/test_scraper_weibo.py", "tests/test_note_images.py",
                    "-q", "-p", "no:cacheprovider"], cwd=ROOT, capture_output=True, text=True)
print("还原后复跑：", r.stdout.strip().splitlines()[-1])
print("没牙的：%s" % (bad or "无"))
sys.exit(1 if bad else 0)
