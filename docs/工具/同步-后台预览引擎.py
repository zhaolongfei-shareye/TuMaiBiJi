#!/usr/bin/env python3
"""把小程序那份绘制代码按依赖闭包复制进后台，供「卡片模板」那一栏现画预览。

为什么要复制：服务器上只有 `backend/` 这一个目录（`本地 backend/ == /home/ubuntu/wtsj-backend`），
`miniprogram/` 根本不在那台机上，所以后台要读这几个 js 只能有一份落在 backend 里。

复制不是"另起一份实现"——这一点是这条链的命门：
  · 界面上跑的就是 `miniprogram/utils/poster.js` 那一份字节；
  · `backend/tests/test_admin_poster_preview.py` 逐只比 md5，源文件改了而这里没跟着同步 ⇒ 测试红；
  · 名单不手写，顺着 `require('…')` 走闭包，客户端新加一个依赖 ⇒ 测试红，逼着同步。
所以"后台那张预览和真机那张不是一回事"这种话不会悄悄成立。

跑法：python3 docs/工具/同步-后台预览引擎.py
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "miniprogram" / "utils"
OUT_DIR = ROOT / "backend" / "app" / "poster_engine"
ENTRY = "poster.js"
# 只认这一种名字：单层、纯文件名、.js 结尾。带 `/` 的、带 `..` 的、`node:` 的一律不当依赖，
# 于是这一条闭包走不出 SRC_DIR 这一个目录（后台要吐的是绘制代码，不是任意磁盘文件）。
REQ = re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)""")
NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*\.js$")


def closure() -> list[str]:
    seen: set[str] = set()
    queue = [ENTRY]
    while queue:
        name = queue.pop(0)
        if name in seen or not NAME.match(name):
            continue
        path = SRC_DIR / name
        if not path.is_file():
            continue
        seen.add(name)
        for m in REQ.finditer(path.read_text(encoding="utf-8")):
            queue.append(m.group(1).split("/")[-1])
    return sorted(seen)


def main() -> int:
    names = closure()
    if ENTRY not in names:
        print(f"FAIL 闭包里连 {ENTRY} 都没有，多半是路径不对：{SRC_DIR}", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for n in names:
        data = (SRC_DIR / n).read_bytes()
        (OUT_DIR / n).write_bytes(data)
        files.append({"name": n, "bytes": len(data), "md5": hashlib.md5(data).hexdigest()})
    manifest = {"entry": ENTRY, "files": files}
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(f["bytes"] for f in files)
    print(f"同步 {len(files)} 个文件 → {OUT_DIR}（共 {total:,} B）")
    for f in files:
        print(f"  {f['name']:<20}{f['bytes']:>8,} B  {f['md5'][:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
