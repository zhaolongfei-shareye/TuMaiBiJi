#!/usr/bin/env python3
"""Z66：备份残留的「目录＋命名」两族口径盘点（只读，不删、不挪任何东西）。

为什么要这把尺子：`find -name '*.bak*'` 只认名字。`_bak-1112p/` 里那两只旧副本名字不带 `.bak`，
按名字那一支永远抓不到 ⇒ 数出来偏小，可它们照样进 grep 的命中面、照样污染读数。

跑法：
    python3 docs/工具/点-备份残留两族口径.py                # 两棵树全量台账
    python3 docs/工具/点-备份残留两族口径.py --自测          # 假夹具，验这把尺子有没有牙
    python3 docs/工具/点-备份残留两族口径.py --root <目录>   # 只数一棵树
    python3 docs/工具/点-备份残留两族口径.py --现网          # 只读：现网 web 根里那些 .bak 公网读不读得到
"""
import argparse
import hashlib
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

LIVE_HOST = "agentsbin"
LIVE_DIR = "/var/www/tumaibiji-h5"
LIVE_BASE = "https://agentsbin.cn/app"

DEFAULT_ROOTS = [
    "/Users/zlfmac/Documents/TuMaiBiJi-H5",
    "/Users/zlfmac/Documents/TuMaiBiJi",
]
DEFAULT_TOKENS = ["_imgCache", "posterI18n", "cardSheet", "statusCode", "retryCount"]
TEXT_SUFFIX = {".js", ".css", ".html", ".py", ".json", ".md", ".sh", ".txt"}

fails = []


def ck(name, ok, got=""):
    print(f"  {'✓' if ok else '✗'} {name}" + (f"　{got}" if got else ""))
    if not ok:
        fails.append(name)


def md5(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def git(root, args):
    return subprocess.run(["git", "-C", str(root)] + args, capture_output=True, text=True)


def is_ignored(root, rel):
    return git(root, ["check-ignore", "-q", "--", rel]).returncode == 0


def blob_in_objects(root, rel):
    h = git(root, ["hash-object", "--", rel]).stdout.strip()
    return bool(h) and git(root, ["cat-file", "-e", h + "^{blob}"]).returncode == 0


def walk(root):
    """一次遍历，分成三份：源码／命名族残留／目录族残留（住在 _bak*/ 里但名字不带 .bak）。"""
    src, naming, extra = [], [], []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or ".git" in p.parts or "node_modules" in p.parts:
            continue
        in_bak_dir = any(part.startswith("_bak") for part in p.parts[1:-1])
        if ".bak" in p.name:
            naming.append(p)
        elif in_bak_dir:
            extra.append(p)
        else:
            src.append(p)
    return src, naming, extra


def counterpart(root, p):
    """副本对应的源码件：砍掉名字里 `.bak…` 那一段。名字不带 `.bak` 的那一支没有可靠映射 ⇒ None。"""
    if ".bak" not in p.name:
        return None
    cand = p.parent / re.sub(r"\.bak.*$", "", p.name)
    return cand if cand.is_file() else None


def ledger(root, src, residues):
    live_hash = {}
    for p in src:
        if p.suffix.lower() in TEXT_SUFFIX:
            live_hash.setdefault(md5(p), str(p.relative_to(root)))
    rows = []
    for p in residues:
        rel = str(p.relative_to(root))
        dup = live_hash.get(md5(p))
        if dup:
            tag = "冗余"
            why = f"源码里有同字节的一份：{dup}"
        elif blob_in_objects(root, rel):
            tag = "在 git"
            why = "字节在 git 对象库里，删了还能捞回来"
        else:
            tag = "唯一副本"
            why = "git 里没有、源码里没有同字节的一份 ⇒ 删了永久丢"
        rows.append((rel, p.stat().st_size, tag, why, is_ignored(root, rel)))
    return rows


def env_residue(root):
    """.env 形状的残留单独点名：只报键名与长度，绝不报值。"""
    out = []
    for p in sorted(root.rglob(".env*")):
        if not p.is_file() or p.name in (".env",) or p.name.endswith(".example"):
            continue
        live = p.parent / ".env"
        stores = [{}, {}]
        for tgt, store in zip((p, live), stores):
            if tgt.is_file():
                for ln in tgt.read_text(errors="ignore").splitlines():
                    s = ln.strip()
                    if s and not s.startswith("#") and "=" in s:
                        k, v = s.split("=", 1)
                        store[k.replace("export ", "").strip()] = v.strip()
        bak, now = stores
        gone = sorted(k for k in bak if k not in now)
        fake = re.compile(r"x{3}|your|changeme|placeholder|todo", re.I)
        wide = sorted(k for k in gone if len(bak[k]) >= 24 and not fake.search(bak[k]))
        out.append((str(p.relative_to(root)), p.stat().st_size, stat.filemode(p.stat().st_mode),
                    len(bak), gone, wide, len(max((v for v in now.values() if len(v) >= 24), key=len, default=0))))
    return out


def pollution(root, src, residues, tokens):
    """同一把尺子量两遍：只读源码 vs 连残留一起读。"""
    sfiles = [p for p in src if p.suffix.lower() in {".js", ".css", ".html"}]
    rfiles = [p for p in residues if p.suffix.lower() in {".js", ".css", ".html"} or ".bak" in p.name]
    rows = []
    for t in tokens:
        n_src = sum(1 for p in sfiles if t in p.read_text(errors="ignore"))
        n_all = n_src + sum(1 for p in rfiles if t in p.read_text(errors="ignore"))
        rows.append((t, n_src, n_all))
    return rows


def report(root_arg, tokens):
    print(f"\n{'=' * 8} {root_arg}")
    root = pathlib.Path(root_arg)
    if not root.is_dir():
        ck("根目录在", False, "不存在，这一棵树没数到")
        return
    src, naming, extra = walk(root)
    residues = naming + extra
    naive = subprocess.run(["find", str(root), "-name", "*.bak*", "-type", "f"],
                           capture_output=True, text=True).stdout.splitlines()
    print(f"命名族（名字带 .bak）　　　　　＝ {len(naming)} 枚")
    print(f"目录族补上（不带 .bak 的副本）＝ {len(extra)} 枚")
    print(f"两族合计　　　　　　　　　　　＝ {len(residues)} 枚")
    print(f"⚠ 旧口径 `find -name '*.bak*'` 现数 {len(naive)} 枚 ⇒ 与命名族{'一致' if len(naive) == len(naming) else '不一致'}")
    rows = ledger(root, src, residues)
    tally = {}
    for _, _, tag, _, _ in rows:
        tally[tag] = tally.get(tag, 0) + 1
    print("归属分档：" + "／".join(f"{k} {v} 枚" for k, v in sorted(tally.items())))
    print(f"（源码件共 {len(src)} 只参与同字节比对）")
    for rel, size, tag, why, ign in rows:
        print(f"  {size:>9} B  {'git已忽略' if ign else '未忽略'}  [{tag}] {why}　{rel}")
    for rel, size, mode, nkeys, gone, wide, nowlen in env_residue(root):
        print(f"  凭据形状残留：{rel}  {size} B  权限 {mode}  键数 {nkeys}")
        print(f"    现行 .env 已没有的键（只念键名）：{gone}")
        print(f"    现行 .env 里最长凭据的长度＝{nowlen}；⚠ 长度不像占位符、要人看一眼的键：{wide}")
    print("  grep 污染实测（同一把尺子量两遍）：")
    for t, n_src, n_all in pollution(root, src, residues, tokens):
        print(f"    {t:<12} 只源码 {n_src} 件／含残留 {n_all} 件" + ("　← 含残留翻面" if n_src != n_all else ""))


def live_web_root():
    """现网 web 根里那几枚 .bak：先列，再逐枚用 HTTPS 问一句「公网读不读得到」。"""
    out = subprocess.run(["ssh", LIVE_HOST,
                          "find %s -type f \\( -name '*.bak*' -o -name '_bak*' \\)" % LIVE_DIR],
                         capture_output=True, text=True).stdout
    rels = parse_live_listing_rows(out)
    print("=" * 8 + " 现网 web 根（只读）")
    print("目录：%s　列出 %d 枚带 .bak／_bak 名的文件" % (LIVE_DIR, len(rels)))
    codes = [(r, http_code(LIVE_BASE + "/" + r)) for r in rels]
    for r, c in codes:
        print("  %s  HTTPS %s" % (r, c))
    print("  反向对照（编一枚不存在的名字，要读出 404 才算这把尺子有牙）：HTTPS %s"
          % http_code(LIVE_BASE + "/index.html.bak-no-such-control-9"))
    readable = [r for r, c in codes if c == 200]
    ck("现网 web 根里公网读得到的 .bak＝0 枚", not readable,
       f"现量 {len(readable)} 枚 200 可读：" + " ".join(readable))


def parse_live_listing_rows(text):
    """服务器 find 的回体 → web 根里的残留相对路径清单（不联网、可自测的那一支）。

    与本地那把尺子同一套两族口径：名字带 `.bak` 的算一支，住在 `_bak*/` 目录里的算另一支
    （那支名字可以不带 `.bak`）。两族都不沾的行扔掉 ⇒ 回体里混进正常文件时不算残留。
    """
    rels = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith(LIVE_DIR + "/"):
            continue
        rel = line[len(LIVE_DIR) + 1:]
        parts = rel.split("/")
        if ".bak" in parts[-1] or any(p.startswith("_bak") for p in parts[:-1]):
            rels.append(rel)
    return sorted(rels)


def http_code(url):
    import urllib.parse
    import urllib.request
    sp = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit((sp.scheme, sp.netloc, urllib.parse.quote(sp.path),
                                   sp.query, sp.fragment))
    try:
        with urllib.request.urlopen(url, timeout=20) as f:
            return f.status
    except Exception as e:
        return getattr(e, "code", "ERR")


def selftest():
    print("=" * 8 + " 自测：假夹具验这把尺子有没有牙")
    with tempfile.TemporaryDirectory() as td:
        root = pathlib.Path(td)
        for rel, body in [("index.html", "// live\n"), ("js/app.js", "// live-app\n"),
                          ("index.html.bak-a", "// old-a\n"), ("js/app.js.bak-b", "// old-b\n"),
                          ("css/app.css.bak-c", "// old-c\n"), ("_bak-x/old.js", "// old-x\n"),
                          ("_bak-x/older.js", "// old-y\n")]:
            f = root / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(body)
        subprocess.run(["git", "-C", td, "init", "-q"], capture_output=True)
        src, naming, extra = walk(root)
        ck("命名族＝3", len(naming) == 3, f"现量 {len(naming)}")
        ck("目录族那一支抓到 2 枚", len(extra) == 2, f"现量 {len(extra)}")
        ck("两族合计＝5", len(naming) + len(extra) == 5, f"现量 {len(naming) + len(extra)}")
        naive = subprocess.run(["find", str(root), "-name", "*.bak*", "-type", "f"],
                               capture_output=True, text=True).stdout.splitlines()
        ck("旧口径确实少算 2 枚", len(naive) == 3, f"旧口径 {len(naive)}／两族 {len(naming) + len(extra)}")
        ck("反向：撤掉目录族那一支 ⇒ 读数退回 3（证明那条支路在驱动结果）",
           len([p for p in root.rglob("*") if p.is_file() and ".bak" in p.name]) == 3,
           f"撤掉后 {len([p for p in root.rglob('*') if p.is_file() and '.bak' in p.name])}")
        ck("反向：名字不带 .bak 的副本不许映射到自己（不自证同字节）",
           counterpart(root, root / "_bak-x/old.js") is None,
           f"映射＝{counterpart(root, root / '_bak-x/old.js')}")
        rows = ledger(root, src, naming + extra)
        tags = {rel: tag for rel, _, tag, _, _ in rows}
        ck("七枚里被记成唯一副本的是 5 枚（两份源码不算）",
           sum(1 for t in tags.values() if t == "唯一副本") == 5,
           f"现量 {sum(1 for t in tags.values() if t == '唯一副本')}")
        same = [rel for rel, _, tag, _, _ in rows if tag == "冗余"]
        ck("反向：夹具里没有任何一枚该被判成冗余 ⇒ 冗余 0 枚", same == [], f"现量 {same}")
        (root / "js/app.js").write_text("// old-b\n")
        src2, naming2, extra2 = walk(root)
        rows2 = ledger(root, src2, naming2 + extra2)
        ck("改口测试：把一枚源码改成与副本同字节 ⇒ 那一枚翻成冗余",
           any(t == "冗余" for _, _, t, _, _ in rows2),
           f"现量 {[t for _, _, t, _, _ in rows2]}")
        canned = "\n".join([LIVE_DIR + "/index.html.bak-261116-011803-emailbind",
                            LIVE_DIR + "/js/api.js.bak-261116-011803-emailbind",
                            LIVE_DIR + "/pages/login.js.bak-261116-011803-emailbind",
                            LIVE_DIR + "/_bak-old/legacy.js",
                            LIVE_DIR + "/assets/logo.png", ""])
        got = parse_live_listing_rows(canned)
        ck("现网那支：五行回体里挑出 4 枚残留（命名 3＋目录 1），把正常文件扔掉",
           len(got) == 4 and "assets/logo.png" not in got, f"现量 {got}")
        ck("反向：回体整段为空 ⇒ 读出 0 枚（不是把空回体当成 1 枚）",
           parse_live_listing_rows("") == [], f"现量 {parse_live_listing_rows('')}")
        ck("反向：只留目录族那一支时读数＝1（证明命名那一支没在替它自证）",
           parse_live_listing_rows(LIVE_DIR + "/_bak-old/legacy.js") == ["_bak-old/legacy.js"],
           f"现量 {parse_live_listing_rows(LIVE_DIR + '/_bak-old/legacy.js')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", action="append", default=None)
    ap.add_argument("--自测", action="store_true")
    ap.add_argument("--现网", action="store_true", help="只读：现网 web 根里的残留公网读不读得到")
    ap.add_argument("--词", default=",".join(DEFAULT_TOKENS))
    a = ap.parse_args()
    if a.自测:
        selftest()
    elif a.现网:
        live_web_root()
    else:
        toks = [t for t in a.词.split(",") if t]
        for r in (a.root or DEFAULT_ROOTS):
            report(r, toks)
    print(f"\n结果：{len(fails)} 红" if fails else "\n结果：0 红")
    sys.exit(1 if fails else 0)


main()
