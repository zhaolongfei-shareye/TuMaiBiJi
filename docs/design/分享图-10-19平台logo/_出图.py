#!/usr/bin/env python3
"""生成 → 量取自报 → 出图 → 折 JPEG 量字节，并对 128KB 上限做一次降档扫描。"""
import json
import re
import subprocess
import sys
from pathlib import Path

D = Path("/Users/zlfmac/Documents/TuMaiBiJi/docs/design/分享图-10-19平台logo")
CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CAP = 131072
NAMES = ["甲-logo右下", "乙-logo左下", "丁-那句当图上第一行", "丙-标题对照"]

subprocess.run([sys.executable, str(D / "_生成四稿.py")], check=True)

rep = {}
for n in NAMES:
    url = (D / f"{n}.html").as_uri()
    dom = subprocess.run([CH, "--headless", "--disable-gpu", "--virtual-time-budget=5000",
                          "--window-size=1280,1024", "--dump-dom", url],
                         capture_output=True, text=True, timeout=150).stdout
    m = re.search(r"<title>M\|(.*?)</title>", dom, re.S)
    png = D / f"{n}.png"
    subprocess.run([CH, "--headless", "--disable-gpu", "--force-device-scale-factor=1",
                    "--hide-scrollbars", "--virtual-time-budget=5000",
                    "--window-size=1280,1024", f"--screenshot={png}", url],
                   capture_output=True, text=True, timeout=150, check=True)
    # 降档扫描：先试原尺寸，再逐级缩
    sweep = []
    for sc in (1.0, 0.95, 0.90, 0.85):
        w = int(round(1280 * sc)) & ~1
        h = int(round(1024 * sc)) & ~1
        for q in (2, 3, 4, 5):
            j = D / f"_扫-{n}-{int(sc * 100)}-{q}.jpg"
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(png)]
            if sc != 1.0:
                cmd += ["-vf", f"scale={w}:{h}:flags=lanczos"]
            cmd += ["-q:v", str(q), str(j)]
            subprocess.run(cmd, check=True)
            b = j.stat().st_size
            sweep.append({"档": f"{w}x{h} q{q}", "字节": b, "占上限%": round(b / CAP * 100, 1)})
            j.unlink()
            if b <= CAP * 0.92:
                break
        else:
            continue
        break
    rep[n] = {"量取": (m.group(1) if m else "<没量到>").split(" | "),
              "png字节": png.stat().st_size, "可用档": sweep[-1]}
print(json.dumps(rep, ensure_ascii=False, indent=1))
