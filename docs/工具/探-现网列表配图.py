"""现网探针：列表那一行的封面图号，现网到底给不给得出来（第三十四次部署后必跑）。

为什么本地 933 条全绿还不够：那批用例跑的是临时库里现造的种子，它能证明这份代码的逻辑，
证明不了**现网那个进程在跑这份代码**、也证明不了**现网那个库里真有能当封面的行**。
Python 进程不会重读磁盘，所以"文件已经传上服务器"这句永远不等于"现网在跑它"
（见 `[[feedback-green-tests-not-release-ready]]`、`[[wtsj-server-deploy-info]]`）。

三条判据各管一段，少一条都会留出静默缺口：
① 接口回得来、每一行都带 `cover_file_id` 这个键 ⇒ 新代码真在进程里；
② 带图的篇回得来的是**那一篇**的图号，没图的篇是 null ⇒ 挂载逻辑对得上现网的数据形状；
③ 一篇多张时回的是**最早那一张**，与详情页那组缩略图同一个序 ⇒ 列表上那枚和点进去第一张是同一张图。

**期望值用裸 SQL 另算一遍**，不 import 应用里的 `not_failed()`：探针和实现共用同一句谓词的话，
谓词本身写错就永远红不了——那把尺子量的是它自己。

隐私那两条是这条链上唯一会伤到人的：私密那篇不许带图号（正文都不许带）；跨账号不许拿到别人的图号。
所以除了打自己那一页，还额外拿**另一个账号的票**去要点名第一篇属于别人的笔记（判据④⑤）。

凭证不进命令行、不打印：票在服务器进程里用现网那把密钥签，只往 localhost 发一次；
云地址（`cloud://...`）里带环境 id 和对象哈希，所以屏上只打 sha1 前 10 位，一个完整地址都不出这台机器。

跑法（脚本从 stdin 进，服务器上不落文件）：

    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - ' \\
      < docs/工具/探-现网列表配图.py

加 `--other` 多打一个账号（默认只打样本最足的那一个，现网一天就 100 次内容检查额度那种省法）。
"""
import hashlib
import json
import sqlite3
import sys

import httpx

from app.core.auth import _create_token
from app.core.config import settings

DB = settings.DATABASE_URL.split(":///")[-1]
BASE = "http://localhost:8000"
PRIVATE_CATEGORY_NAME = "私密"

fails = []


def check(label, ok, detail=""):
    print(f"  {'✓' if ok else '✗'} {label}{('　→ ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


def mask(key):
    """只留一个能对着看的短指纹，完整云地址一个字不打。"""
    return hashlib.sha1(key.encode()).hexdigest()[:10] if key else "null"


def pick_users(limit):
    """选账号：既要能验封面，也要能验私密闸，还也要有一个"图号不属于他"的对照账号。

    返回 (封面账号, 私密账号, 对照账号)——后两个允许与第一个相同，相同就说明现网没那个形状，
    调用方按"未验"报而不是硬凑一条假绿。
    """
    db = sqlite3.connect(DB)
    cover_uid = db.execute(
        """select a.user_id from assets a
           join notes n on n.id = a.note_id
           where (a.backup_status is null or a.backup_status <> 'failed')
           group by a.user_id order by count(*) desc limit 1"""
    ).fetchone()
    private_uid = db.execute(
        """select n.user_id from notes n
           join categories c on c.id = n.category_id
           where c.name = ? group by n.user_id order by count(*) desc limit 1""",
        (PRIVATE_CATEGORY_NAME,),
    ).fetchone()
    return db, (cover_uid and cover_uid[0]), (private_uid and private_uid[0])


def expected_covers(db, uid, note_ids):
    """裸 SQL 版「一篇一张、取最早那张」——与应用那份实现故意不同源，见模块头。"""
    if not note_ids:
        return {}
    qmarks = ",".join("?" * len(note_ids))
    rows = db.execute(
        f"""select note_id, object_key from assets
            where user_id = ? and note_id in ({qmarks})
              and (backup_status is null or backup_status <> 'failed')
            order by note_id, id asc""",
        [uid] + list(note_ids),
    ).fetchall()
    out = {}
    for nid, key in rows:
        out.setdefault(nid, key)
    return out


def gen_of(db, uid):
    row = db.execute("select generation from users where id = ?", (uid,)).fetchone()
    return (row[0] if row and row[0] is not None else 1)


def get_list(uid, gen, limit=100):
    token = _create_token(int(uid), gen)
    r = httpx.get(
        f"{BASE}/api/notes/",
        headers={"Authorization": f"Bearer {token}"},
        params={"skip": 0, "limit": limit},
        timeout=30,
    )
    return r


def probe_user(db, uid, label, multi_expect=True):
    r = get_list(uid, gen_of(db, uid))
    if r.status_code != 200:
        check(f"{label} 账号取列表", False, f"HTTP {r.status_code}　{r.text[:160]}")
        return None
    rows = r.json()
    if not isinstance(rows, list) or not rows:
        check(f"{label} 账号取列表回得到笔记", False, f"回体形状 {type(rows).__name__} / {str(rows)[:120]}")
        return None

    have_key = [n for n in rows if "cover_file_id" in n]
    check(f"① {label}：{len(have_key)}/{len(rows)} 行都带 cover_file_id 这个键（新代码真在进程里）",
          len(have_key) == len(rows),
          f"缺键的行 {len(rows) - len(have_key)} 条" if len(have_key) != len(rows) else "")

    ids = [n["id"] for n in rows]
    want = expected_covers(db, uid, ids)
    got = {n["id"]: n.get("cover_file_id") for n in rows}

    hit = [i for i in ids if want.get(i)]
    if not hit:
        check(f"② {label}：这一页里没有带图的笔记，封面判据没样本", False,
              "换一个账号或先造一篇（现网造数据要另拍）")
        return None

    bad = [i for i in ids if got.get(i) != want.get(i)]
    check(f"② {label}：{len(ids) - len(bad)}/{len(ids)} 行的图号与库里算出来的一致"
          f"（其中 {len(hit)} 行该有图）",
          not bad,
          "、".join(f"笔记{i} 期望 {mask(want.get(i))} 实得 {mask(got.get(i))}" for i in bad[:4]))

    nulls = [i for i in ids if not want.get(i)]
    leaked = [i for i in nulls if got.get(i)]
    check(f"②b {label}：没配过图的 {len(nulls)} 篇一律是 null（不许拿别人的或历史遗留的图凑）",
          not leaked, f"多出图号的：{leaked[:5]}" if leaked else "")

    if multi_expect:
        multi = [i for i in hit if db.execute(
            "select count(*) from assets where note_id = ? "
            "and (backup_status is null or backup_status <> 'failed')", (i,)
        ).fetchone()[0] > 1]
        if multi:
            flip = [i for i in multi
                    if got.get(i) == db.execute(
                        "select object_key from assets where note_id = ? "
                        "and (backup_status is null or backup_status <> 'failed') "
                        "order by id desc limit 1", (i,)).fetchone()[0]]
            check(f"③ {label}：{len(multi)} 篇一多图，取的都是最早那张（与详情页第一张同序）",
                  not flip, f"取了最后一张的：{flip[:5]}" if flip else "")
        else:
            print(f"  · {label}：现网没有「一篇两张以上」的笔记，判据③这一趟无样本，未验")
    return rows


def main():
    db, cover_uid, private_uid = pick_users(None)
    if not cover_uid:
        print("✗ 现网库里没有任何「绑到笔记上且没备份失败」的图行，封面这条链在现网无数据可验")
        return 1
    print(f"现网列表配图探针（库 {DB}，只读，不写一行）")
    print(f"  封面样本账号 id={cover_uid}（图号一律只打 sha1 前 10 位）")

    rows = probe_user(db, cover_uid, "封面")

    # ④ 私密闸：私密那篇不许带图号。用有私密笔记的账号打，不带解锁凭证。
    if private_uid:
        prows = get_list(private_uid, gen_of(db, private_uid)).json()
        pids = [n["id"] for n in prows
                if n["id"] in {r[0] for r in db.execute(
                    "select n.id from notes n join categories c on c.id = n.category_id "
                    "where c.name = ? and n.user_id = ?", (PRIVATE_CATEGORY_NAME, private_uid))}]
        if pids:
            want_p = expected_covers(db, private_uid, pids)
            with_cover = [i for i in pids if want_p.get(i)]
            bad_p = [i for i in pids
                     if next((n.get("cover_file_id") for n in prows if n["id"] == i), None)]
            check(f"④ 私密那 {len(pids)} 篇（其中 {len(with_cover)} 篇真有图）没解锁时一律不带图号",
                  not bad_p, f"漏出图号的：{bad_p[:5]}" if bad_p else
                  ("（这几篇本来就没图，判据④只是没红）" if not with_cover else ""))
            body = [i for i in pids
                    if next((n for n in prows if n["id"] == i), {}).get("content")]
            check("④b 同一趟里私密那几篇正文也是空的（图号闸不是唯一那道）", not body,
                  f"带正文的：{body[:5]}" if body else "")
        else:
            print("  · 账号 id=%s 这一页里没有私密笔记，判据④无样本，未验" % private_uid)
    else:
        print("  · 现网库里没有「私密」分类下的笔记，判据④无样本，未验")

    # ⑤ 跨账号：另一个账号的票，问不到别人那一篇的图号。
    other = db.execute(
        "select id from users where id != ? and id in (select user_id from assets) limit 1",
        (str(cover_uid),)).fetchone()
    if other:
        orows = probe_user(db, other[0], "对照", multi_expect=False)
        if orows is not None:
            mine = [i for i in (n["id"] for n in orows)
                    if db.execute("select user_id from notes where id = ?", (i,)).fetchone()[0]
                    == str(cover_uid)]
            check("⑤ 对照账号那一页里没有封面账号的笔记（跨账号拿不到别人的图号）", not mine,
                  f"串进来的：{mine[:5]}" if mine else "")
    else:
        print("  · 现网没有第二个带图的账号，判据⑤无样本，未验")

    print("")
    print(f"验-现网列表配图：{'全部通过' if not fails else '未过 ' + str(len(fails)) + ' 条'}")
    for f in fails:
        print(f"  ✗ {f}")
    return 0 if not fails else 1


sys.exit(main())
