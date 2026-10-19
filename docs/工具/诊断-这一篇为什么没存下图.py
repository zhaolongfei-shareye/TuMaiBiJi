"""他甩来一条真公众号链接：笔记建出来了、有摘要与要点，**但一张配图都没有**——查它卡在哪一格。

跑法：
    现网  ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/诊断-这一篇为什么没存下图.py
    本机  backend/.venv/bin/python docs/工具/诊断-这一篇为什么没存下图.py --fetch-only

只读：查库、抓一次网页，不写现网任何东西、不建笔记。

要看清的三件事（三处任一处都能造成"只有文字"，而屏上不说话）：
① 抓取那一头到底取到几张图地址（`images_total`）——0 张＝取法没命中这一篇的图；
② 取到了但全没存上（`images_failed`）——防盗链／SSRF 闸／云函数那一路；
③ 整段根本没跑（`imported_from` 里没有那四个计数）——通道没就绪（`channel_ready()` 回 false）
   或这篇是在第四十二次部署之前建的。
"""
import asyncio
import sys

sys.path.insert(0, ".")

URL = "https://mp.weixin.qq.com/s/1FOoWv45lty7r7MZ88V9aQ"
FRAG = "1FOoWv45lty7r7MZ88V9aQ"
FETCH_ONLY = "--fetch-only" in sys.argv


def fetch():
    from app.services import scraper
    p = asyncio.run(scraper._fetch_and_parse(URL))
    imgs = p.get("images") or []
    print(f"抓取｜标题 {p.get('title')!r}")
    print(f"抓取｜正文 {len(p.get('content') or '')} 字｜作者 {p.get('author')!r}｜状态码 {p.get('status_code')}")
    print(f"抓取｜图地址 {len(imgs)} 张")
    for u in imgs[:6]:
        print("   ·", u[:110])


def diagnose():
    from app.core.config import settings
    from app.db.database import SessionLocal
    from app.models.asset import Asset
    from app.models.note import Note
    from app.services import note_images

    print("通道｜channel_ready() =", note_images.channel_ready(),
          "｜URL 配了 =", bool(settings.IMAGE_STORE_CF_URL),
          "｜KEY 配了 =", bool(settings.IMAGE_STORE_CF_KEY))
    db = SessionLocal()
    rows = db.query(Note).filter(Note.source_url.like(f"%{FRAG}%")).all()
    print(f"库｜按这条链接找到 {len(rows)} 篇")
    for n in rows:
        snap = n.imported_from or {}
        print(f"  笔记 {n.id}｜{n.created_at}｜user {n.user_id}｜source_type {n.source_type}｜"
              f"正文 {len(n.content or '')} 字")
        print(f"    imported_from 键 = {sorted(snap.keys())}")
        print(f"    四个计数 = " + str({k: snap.get(k) for k in
                                       ('images_total', 'images_kept', 'images_failed', 'images_truncated')}))
        a = db.query(Asset).filter(Asset.note_id == n.id).all()
        print(f"    assets 行数 = {len(a)}" + ("" if not a else
              "｜" + str([(x.file_type, x.file_size, x.backup_status) for x in a[:4]])))
    recent = db.query(Note).filter(Note.created_at >= "2026-10-19").order_by(Note.id.desc()).limit(8).all()
    print("现网今天最后 8 篇（看这一格是不是普遍现象）：")
    for n in recent:
        snap = n.imported_from or {}
        a = db.query(Asset).filter(Asset.note_id == n.id).count()
        print(f"  {n.id}｜{n.created_at}｜{n.source_type}｜计数 {snap.get('images_total')}/"
              f"{snap.get('images_kept')}/{snap.get('images_failed')}｜assets {a} 行｜{(n.title or '')[:22]}")


if __name__ == "__main__":
    fetch()
    if not FETCH_ONLY:
        diagnose()
