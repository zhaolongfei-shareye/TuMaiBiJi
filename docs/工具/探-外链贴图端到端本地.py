"""外链贴图这条链的**本机**端到端自证：真链接 → 取图 → 真下载 → 真压缩 → 过存图函数 → 登记 assets。

为什么不直接打现网：进桶那一步要云函数 `image_store` 已经 deploy、服务器 `.env` 里那两行已经加上，
那两头都是现网写（等他一句才动）。这一把把**除进桶以外**的每一环都按现网那条链原样跑一遍：
下载与压缩吃真 CDN 与真 Pillow，只有最末那根"哑管道"由本机一个 http.server 顶着，
落点写进 `mkdtemp`（不碰任何真桶、也不碰本机那个开发库）。

用法：`cd backend && python3 ../docs/工具/探-外链贴图端到端本地.py`
可选：`IMG_LIMIT=9 python3 ...`（默认吃 `MAX_ASSETS_PER_NOTE`）；`PROBE_URLS='["<链接>", …]'` 换测别的站。

读数对不上判据时先看 `docs/方案-公众号贴图随笔记存档.md` 第二节那几张实测数。
"""
import asyncio
import base64
import json
import logging
import os
import re
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

_TMP = tempfile.mkdtemp(prefix="tmbj-探-贴图-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/probe.db"
os.environ["JWT_SECRET_KEY"] = "probe-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["SEC_CHECK_ENABLED"] = "false"
# 这两行必须在 import app.core.config 之前落好：settings 是模块级单例，谁先 import 按谁当时看到的定型。
_stub_token = "probe-stub-key-not-a-placeholder-shape"

DEFAULT_URLS = [
    "https://mp.weixin.qq.com/s/H2BANSW_U-Jjl1Ic_ZuZKA",
    "https://xhslink.cn/o/9F1fAXNBL1I",
]

STORE = {"calls": 0, "bytes": 0, "dir": os.path.join(_TMP, "bucket")}
os.makedirs(STORE["dir"], exist_ok=True)

# 与 cloudfunctions/image_store/index.js 同一套规则（那边是现网那根管道，这里是本机顶它的替身）。
MAX_BYTES = 4 * 1024 * 1024
MAX_PATH_LEN = 300


def _path_err(p):
    if not isinstance(p, str) or not p:
        return "cloud_path 是空的"
    if len(p) > MAX_PATH_LEN:
        return f"cloud_path 过长（{len(p)}）"
    if p[0] == "/":
        return "cloud_path 不许以 / 开头"
    if ".." in p:
        return "cloud_path 里不许有 .."
    if re.search(r"\s", p):
        return "cloud_path 里有空白"
    if not p.startswith("images/"):
        return "cloud_path 必须以 images/ 开头"
    return None


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        STORE["calls"] += 1
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except (ValueError, TypeError):
            body = {}
        err = _path_err(body.get("cloud_path"))
        if err is None and not isinstance(body.get("data"), str):
            err = "data 不是字符串"
        buf = b""
        if err is None:
            try:
                buf = base64.b64decode(body["data"], validate=True)
            except Exception as exc:  # noqa: BLE001 - 替身也要把解不开的原因回出去
                err = f"base64 解不开：{exc}"
        if err is None and not buf:
            err = "解出来是 0 字节"
        if err is None and len(buf) > MAX_BYTES:
            err = f"这张 {len(buf)} B 超过 {MAX_BYTES} B 上限"
        if err is not None:
            self._reply(200, {"error": err})
            return
        cp = body["cloud_path"]
        dst = os.path.join(STORE["dir"], cp)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as fh:
            fh.write(buf)
        STORE["bytes"] += len(buf)
        # fileID 的形状与真桶一致（cloud://<env>.<appid>/<path>），后端 `_upload` 就认这个前缀。
        self._reply(200, {"fileID": f"cloud://probe-stub/{cp}", "bytes": len(buf)})

    def _reply(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *a):  # 静音：这台机上的访问日志没人看，读数都走 STORE 计数
        pass


def main():
    # 「这一张为什么没存上」只进日志（SkipImage 的口径：不进用户那句话），
    # 所以这把探针必须把日志打开，否则屏上只剩一个 ✗，看不出是占位图、403 还是超了 4MB。
    logging.basicConfig(level=logging.INFO, format="    · %(message)s", stream=sys.stdout)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    os.environ["IMAGE_STORE_CF_URL"] = f"http://127.0.0.1:{srv.server_address[1]}/store"
    os.environ["IMAGE_STORE_CF_KEY"] = _stub_token

    import app.models  # noqa: F401  名单齐不齐那条纪律在这儿同样成立：不 import 就建不出表
    from app.core.config import settings
    from app.db.database import Base
    from app.models.asset import MAX_ASSETS_PER_NOTE, Asset
    from app.models.note import Note
    from app.services import note_images, scraper
    from app.tasks.ingest_tasks import _source_snapshot
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    settings.IMAGE_STORE_CF_URL = os.environ["IMAGE_STORE_CF_URL"]
    settings.IMAGE_STORE_CF_KEY = _stub_token
    print(f"通道就绪 note_images.channel_ready() = {note_images.channel_ready()}")
    print(f"尺子：长边 {note_images.MAX_LONG_EDGE}／预算 {note_images.BUDGET_BYTES:,} B"
          f"／梯度 {note_images.QUALITY_LADDER}／上限 {MAX_ASSETS_PER_NOTE} 张")

    engine = create_engine(os.environ["DATABASE_URL"])
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    urls = json.loads(os.environ.get("PROBE_URLS") or "null") or DEFAULT_URLS
    limit = int(os.environ.get("IMG_LIMIT", MAX_ASSETS_PER_NOTE))
    verdict = []
    for url in urls:
        print("\n" + "=" * 72)
        print(f"链接 {url}")
        scraped = asyncio.run(scraper.scrape_url(url))
        imgs = [u for u in (scraped.get("images") or []) if u]
        print(f"  source_type={scraped['source_type']} 正文 {len(scraped['content'] or '')} 字"
              f"｜作者 {scraped.get('author')!r}｜正文图 {len(imgs)} 张")
        snap = _source_snapshot(scraped, url)
        print(f"  来源快照键名 {sorted(snap or {})}")

        res = asyncio.run(note_images.archive(imgs, "probe-user", limit))
        print(f"  存下 {len(res.kept)}／失败 {len(res.failed)}／被上限砍掉 {res.truncated}"
              f"（total={res.total}）")
        for i, s in enumerate(res.kept, 1):
            print(f"    [{i}] {s.mime} {s.size:,} B {s.width}x{s.height}"
                  f"{'  ⚠超预算' if s.over_budget else ''}  ← {s.source_url[:70]}")
        for u in res.failed:
            print(f"    ✗ 没存上 ← {u[:90]}")

        with Session() as db:
            note = Note(user_id="probe-user", title=scraped["title"][:500],
                        source_type=scraped["source_type"], source_url=url[:1000],
                        imported_from=snap)
            db.add(note)
            db.commit()
            db.refresh(note)
            n1 = note_images.register(db, note, res.kept)
            n2 = note_images.register(db, note, res.kept)  # 幂等：RQ 重跑不该多堆一行
            mine = db.query(Asset).filter(Asset.note_id == note.id).all()
            print(f"  登记 assets {n1} 行；同一批再登记一次 → {n2} 行（要 0）")
            print(f"  笔记名下配图 {len(mine)} 张，第一张 object_key={mine[0].object_key[:46] if mine else '—'}")
        verdict.append({"url": url, "total": res.total, "kept": len(res.kept),
                        "failed": len(res.failed), "truncated": res.truncated})

    print("\n" + "=" * 72)
    print(f"本机桶里落了 {STORE['calls']} 次 POST、共 {STORE['bytes']:,} B → {_TMP}")
    for v in verdict:
        sent = min(v["total"], limit)
        ok = (v["kept"] + v["failed"] == sent and v["truncated"] == max(0, v["total"] - sent))
        print(f"  {'✓' if ok else '✗'} {v['url'][:60]} 共 {v['total']} 张 → 试 {sent}"
              f"｜存下 {v['kept']}｜失败 {v['failed']}｜砍掉 {v['truncated']}")
    srv.shutdown()


if __name__ == "__main__":
    main()
