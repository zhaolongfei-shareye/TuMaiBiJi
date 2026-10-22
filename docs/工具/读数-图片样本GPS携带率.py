#!/usr/bin/env python3
# 读数-图片样本GPS携带率.py —— 旅行打卡 App N0 取证第一项（10-22）
#
# 量什么：一堆真实图片里，"文件里带 GPS 那组 EXIF 标签"的比例，按来源家族分开数。
# 为什么量这一条：产品要做的"从照片自带的位置取位"这一条腿值不值得做，取决于
#   他手上那几族图（相机照／截图／微信另存／AI 生成／网页下载）到底有没有那串键。
#   没有 → 整条腿砍掉，别留空腿。
#
# 口径两条（写死，不许含糊）：
#   1) 这里量的是"**文件字节里有没有**"，读法走 Pillow 的 EXIF（GPS IFD = tag 34853）；
#      iOS 侧真正用的那套 API 是 ImageIO，理论上读的是同一组标签，**但那是另一件事**，
#      要真机复验（本尺子不替它作保）。
#   2) 同时跑一次 macOS Spotlight 的 `mdls`（kMDItemLatitude/Longitude）当**第二把尺**：
#      两把一致才算这一族有数；不一致 → 报"两种读法打架"，不许只挑对自己有利的那一把。
#
# 只读元数据，不读图、不上传、不写任何外部系统。
import os, sys, json, subprocess, random, collections
from PIL import Image

ROOTS = [
    "/Users/zlfmac/Downloads",
    "/Users/zlfmac/Downloads/截图",
    "/Users/zlfmac/Desktop",
    "/Users/zlfmac/Pictures",
]
MAXdepth = 2
CAP_PER_FAMILY = 400          # 每一族最多抽多少张（全量太多会慢，抽样要写明抽了多少）
EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif"}
GPS_IFD = 34853

def family(path: str) -> str:
    n = os.path.basename(path).lower()
    d = os.path.dirname(path)
    if n.startswith("wechatimg") or "wechat" in n or "微信" in n:
        return "微信另存"
    if n.startswith("snapzy") or "截图" in d or n.startswith("截屏") or "screen shot" in n or "screenshot" in n:
        return "截图"
    if "gemini" in n or "generated" in n or "midjourney" in n or ai2(n):
        return "AI 生成"
    if n.endswith((".heic", ".heif")) or n.startswith("img_") or n.startswith("dsc"):
        return "相机照"
    if "weibo" in n or "微博" in n or "xhs" in n or "小红书" in n:
        return "微博/小红书"
    return "其他（下载/不明）"

def ai2(n: str) -> bool:
    return n.startswith("imagegen") or "seedream" in n or "jimeng" in n or "即梦" in n

def read_exif_gps(path: str):
    """返回 (有没有GPS标签, 读数说明)。"""
    try:
        with Image.open(path) as im:
            ex = im.getexif()
            if not ex:
                return False, "无 EXIF 块"
            try:
                gps = ex.get_ifd(GPS_IFD)
            except Exception as e:
                return False, f"GPS IFD 读失败:{type(e).__name__}"
            if not gps:
                return False, "有 EXIF、无 GPS IFD"
            lat = gps.get(2); lon = gps.get(4)
            if lat and lon:
                return True, "有 GPS(经纬都在)"
            return False, f"GPS IFD 在但经纬缺(键:{sorted(gps.keys())[:6]})"
    except Exception as e:
        return None, f"读不了:{type(e).__name__}"

def read_mdls_gps(path: str):
    """Spotlight 那一把尺。⚠ 第一版我写错在这里：属性缺失时 mdls 打的是
    `kMDItemLatitude = (null)`，我拿"有没有括号"当判据 ⇒ 每一张都回 True，
    于是"两把尺打架"数恰好等于抽样数——**那个数字本身就是这把尺坏掉的证据**。
    现在按 `=` 后面能不能解析出实数来判。"""
    try:
        out = subprocess.run(["mdls", "-name", "kMDItemLatitude", path],
                             capture_output=True, text=True, timeout=8).stdout
        for line in out.splitlines():
            if not line.strip().startswith("kMDItemLatitude"):
                continue
            rhs = line.split("=", 1)[1].strip() if "=" in line else ""
            rhs = rhs.split("#")[0].strip()
            if not rhs or rhs.startswith("("):
                return False
            try:
                v = float(rhs)
            except ValueError:
                return False
            return v == v  # NaN 不算有
        return False
    except Exception:
        return None

def walk():
    files = []
    for r in ROOTS:
        if not os.path.isdir(r):
            continue
        base_depth = r.rstrip("/").count("/")
        for dirpath, dirnames, filenames in os.walk(r):
            if dirpath.count("/") - base_depth > MAXdepth:
                dirnames[:] = []
                continue
            if ".photoslibrary" in dirpath:      # 相册是包结构，另案处理，不在这里数
                dirnames[:] = []
                continue
            for f in filenames:
                if os.path.splitext(f)[1].lower() in EXTS:
                    files.append(os.path.join(dirpath, f))
    return files

def main():
    random.seed(20261022)
    allf = walk()
    by_fam = collections.defaultdict(list)
    for p in allf:
        by_fam[family(p)].append(p)

    rows, total_seen = [], len(allf)
    for fam, lst in sorted(by_fam.items(), key=lambda kv: -len(kv[1])):
        sample = lst if len(lst) <= CAP_PER_FAMILY else random.sample(lst, CAP_PER_FAMILY)
        yes = no = err = disagree = 0
        both_yes = 0
        for p in sample:
            a, note = read_exif_gps(p)
            if a is None:
                err += 1; continue
            b = read_mdls_gps(p)
            if a:
                yes += 1
                if b is True:
                    both_yes += 1
                elif b is False:
                    disagree += 1
            else:
                no += 1
                if b is True:
                    disagree += 1
        rows.append(dict(family=fam, 全机该族张数=len(lst), 实抽=len(sample),
                         带GPS_exif=yes, 其中Spotlight也认=both_yes, 不带=no,
                         读不了=err, 两把尺打架=disagree,
                         携带率=round(yes / max(1, yes + no), 3)))

    print(json.dumps(dict(扫描根=ROOTS, 深度=MAXdepth, 全量找到=total_seen,
                          每族上限=CAP_PER_FAMILY,
                          口径="EXIF 走 Pillow 的 GPS IFD(34853)；第二把尺走 mdls kMDItemLatitude。"
                                "两把打架＝一边认有不边认无，这一格不为零就不许只报一把。",
                          读数=rows), ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
    sys.exit(0)
