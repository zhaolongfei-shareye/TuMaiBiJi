"""反向验证：搜狐与少数派这一刀的十处错法——每一处改下去，用例必须当场红。

只在 `/tmp/ss_mut/backend` 那份**副本**上动，真树一行不碰；每一处跑完立刻还原。

副本怎么来（这台机器上一次，之后重复跑本工具不用再建）：
    mkdir -p /tmp/ss_mut && rsync -a --exclude .venv backend/ /tmp/ss_mut/backend/ \\
      && ln -sfn /Users/zlfmac/Documents/TuMaiBiJi/miniprogram /tmp/ss_mut/miniprogram
    # 那一条 symlink 是必须的：`test_note_images.py` 里"两头同一把尺子"那几条要读客户端那份 imageCompress.js

跑法：backend/.venv/bin/python docs/工具/反向验证-搜狐与少数派这一刀.py
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("/tmp/ss_mut/backend")
PY = "/Users/zlfmac/Documents/TuMaiBiJi/backend/.venv/bin/python"
S = "tests/test_scraper_sohu_sspai.py"
N = "tests/test_note_images.py"

MUT = [
    ("①名单取了但不接（密文照旧当地址）", "app/services/scraper.py",
     "            if 索 is not None:", "            if False:",
     S),
    ("②认不出键时回空列表（等于全族没图）", "app/services/scraper.py",
     '        )\n    return None\n\n\ndef _http_image_url',
     '        )\n    return []\n\n\ndef _http_image_url',
     S),
    ("③只认 www 那个键名", "app/services/scraper.py",
     '_SOHU_LIST_KEYS = ("imgsList", "imageList")', '_SOHU_LIST_KEYS = ("imgsList",)',
     S),
    ("④把没量过的子域也认进来", "app/services/scraper.py",
     '_SOHU_HOSTS = ("www.sohu.com", "m.sohu.com")',
     '_SOHU_HOSTS = ("www.sohu.com", "m.sohu.com", "k.sohu.com", "news.sohu.com")',
     S),
    ("⑤UA 那一格在接线处漏递", "app/tasks/ingest_tasks.py",
     'user_agent=(scraped.get("image_user_agent") or "").strip()))', 'user_agent=""))',
     N),
    ("⑥后缀匹配去掉点边界（会把别人的域认进来）", "app/services/scraper.py",
     'if host == 站 or host.endswith("." + 站):', 'if host == 站 or host.endswith(站):',
     S),
    ("⑦来路做成全局（每一族都发一枚）", "app/services/scraper.py",
     "            return 来路\n    return \"\"",
     '            return 来路\n    return "https://" + ((urlparse(url).hostname or "") or "x") + "/"',
     S),
    ("⑧UA 参数无条件覆盖（默认那批也被换掉）", "app/services/note_images.py",
     "    if user_agent:", "    if True:",
     N),
    ("⑨点名的 UA 挂成了 Referer", "app/services/note_images.py",
     '头["User-Agent"] = user_agent', '头["Referer"] = user_agent',
     N),
    ("⑩这一层按图床域名猜（纪律破了）", "app/services/note_images.py",
     "    头 = dict(IMAGE_HEADERS)", "    头 = dict(IMAGE_HEADERS); 认域名 = \"itc.cn\"",
     N),
]

if not (ROOT / "app/services/scraper.py").exists():
    print("副本不在（照文件头那两行先建 /tmp/ss_mut），本次一行没动。")
    sys.exit(1)

没牙 = []
for 标签, 相对, 旧, 新, 目标 in MUT:
    p = ROOT / 相对
    原文 = p.read_text(encoding="utf-8")
    if 旧 not in 原文:
        没牙.append((标签, "锚点找不到（这份副本不是当前代码）"))
        print("%-34s ★锚点对不上" % 标签)
        continue
    p.write_text(原文.replace(旧, 新, 1))
    跑 = subprocess.run([PY, "-m", "pytest", 目标, "-q", "-p", "no:cacheprovider"],
                        cwd=ROOT, capture_output=True, text=True)
    p.write_text(原文)
    红 = [l for l in 跑.stdout.splitlines() if l.startswith("FAILED")]
    print("%-34s %s 红 %d 条  %s" % (标签, "有牙" if 红 else "★没牙", len(红),
                                     (跑.stdout.strip().splitlines()[-1] if 跑.stdout.strip() else 跑.stderr[-160:])))
    if not 红:
        没牙.append((标签, "改成错法了但用例没红"))

复跑 = subprocess.run([PY, "-m", "pytest", S, N, "tests/test_scraper_weibo.py",
                      "tests/test_scraper_general_images.py", "-q", "-p", "no:cacheprovider"],
                      cwd=ROOT, capture_output=True, text=True)
print("\n十处全部还原后复跑：", 复跑.stdout.strip().splitlines()[-1])
print("真树未动（这份工具只在 /tmp/ss_mut 上写）")
for 标签, 原因 in 没牙:
    print("★", 标签, "→", 原因)
sys.exit(1 if 没牙 else 0)
