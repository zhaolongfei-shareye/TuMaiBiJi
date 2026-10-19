#!/usr/bin/env python3
"""出图 + 读回自报 + 折 JPEG 量字节（上限 131,072）。"""
import json
import re
import subprocess
import sys
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-20竖壳圆标")
CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CAP = 131072
NAMES = ["甲-圆底白字形", "乙-真应用图标切圆", "丙-那句走两档字号"]

subprocess.run([sys.executable, str(D / "_生成新壳.py")], check=True)
rep = {}
for n in NAMES:
    url = (D / f"{n}.html").as_uri()
    dom = subprocess.run([CH, "--headless", "--disable-gpu", "--virtual-time-budget=6000",
                          "--window-size=1280,1024", "--dump-dom", url],
                         capture_output=True, text=True, timeout=180).stdout
    m = re.search(r"<title>M\|(.*?)</title>", dom, re.S)
    png = D / f"{n}.png"
    subprocess.run([CH, "--headless", "--disable-gpu", "--force-device-scale-factor=1",
                    "--hide-scrollbars", "--virtual-time-budget=6000",
                    "--window-size=1280,1024", f"--screenshot={png}", url],
                   capture_output=True, text=True, timeout=180, check=True)
    js = {}
    for q in (2, 3, 4, 5):
        j = D / f"_t-{q}.jpg"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png),
                        "-q:v", str(q), str(j)], check=True)
        js[f"q{q}"] = j.stat().st_size
        j.unlink()
    rep[n] = {"自报": (m.group(1) if m else "<没量到>").split(" | "),
              "png": png.stat().st_size, "jpg": js,
              "过线档": [k for k, v in js.items() if v > CAP]}
print(json.dumps(rep, ensure_ascii=False, indent=1))
