"""变异测试：把已经修好的东西逐个改坏，确认对应用例真的会红。

全绿本身不证明测到了——断言可能压根没经过被改的那行，或者观测量本身就是被修的东西。
每条变异跑完立刻还原；任何一条"改坏了还全绿"都说明那处修复是裸奔的。
10-25 审计 M23 给这把秤自己补了三道闸（口径抄本仓的正答案 `反向验证-lib.sh`）：
语法没崩才算牙、非零退出要数得出 FAILED／ERROR、锚点多处或改动面超 2 行一律出声；
还原一律做字节校验，且不调任何 BSD-only 的外部命令（那套 lib 用 `md5 -q`，Linux 上没有）。
前 11 条是额度/注销那一轮，S1~S10 是分享快照这一轮，N1~N7 是 09-24 那次改口径
（100 篇基础 + 动笔首篇或转存都算激活 + 同一篇只挣一次 + 带来几个人不限），
L1~L3 是日志装配那一轮，RM1~RM5 是 RoamMark 景点初稿转发那一腿（10-25）。
"""
import ast
import atexit
import difflib
import hashlib
import signal
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
PY = str(BACKEND / ".venv" / "bin" / "python")

MUTATIONS = [
    (
        "A1 认证不再校验账号代数",
        "app/core/auth.py",
        "    if user.generation != token_gen:\n"
        "        raise HTTPException(status_code=401, detail=\"Token 已失效，请重新登录\")\n",
        "",
        "tests/test_account_deletion.py",
    ),
    (
        "A1 新号代数恒为 1（复用 id 时新旧同号）",
        "app/core/auth.py",
        "user = User(openid=openid, generation=max_gen + 1)",
        "user = User(openid=openid, generation=1)",
        "tests/test_account_deletion.py",
    ),
    (
        "A6 worker 不再校验账号代数",
        "app/tasks/ingest_tasks.py",
        "    if user.generation != generation:\n",
        "    if False:\n",
        "tests/test_worker_identity.py",
    ),
    (
        "A6 worker 不再校验账号是否存在",
        "app/tasks/ingest_tasks.py",
        "    if user is None:\n"
        "        logger.warning(\"用户已注销，放弃保存笔记：user_id=%s task=%s\", user_id, task_id)\n"
        "        set_task_status(task_id, \"failed\", {\"error\": \"账号已注销，无法保存笔记\"})\n"
        "        return None\n",
        "",
        "tests/test_worker_identity.py",
    ),
    (
        "A5 注销不追回邀请奖励",
        "app/api/routes/user.py",
        "        before = inviter.quota_bonus\n"
        "        inviter.quota_bonus = before - record.reward\n",
        "        pass\n",
        "tests/test_account_deletion.py",
    ),
    (
        "A5 追回时不防负数（余额不够也照扣）",
        "app/api/routes/user.py",
        "        if inviter.quota_bonus < record.reward:\n",
        "        if False:\n",
        "tests/test_account_deletion.py",
    ),
    (
        "N1 转存这条入口整个不结邀请账",
        "app/api/routes/notes.py",
        "    quota.credit_import(db, user, share.note_id)\n",
        "",
        "tests/test_quota_and_invite.py::Test转存加分",
    ),
    (
        "N2 「这篇 × 这个人只算一次」的索引没建上（最后一道闸没了）",
        "app/models/invitation.py",
        "        Index(\n"
        "            \"ux_invitations_import_once_per_pair\",\n"
        "            \"source_note_id\",\n"
        "            \"invitee_id\",\n"
        "            unique=True,\n"
        "            sqlite_where=text(\"source_note_id IS NOT NULL\"),\n"
        "        ),\n",
        "",
        "tests/test_quota_and_invite.py::Test转存加分::test_去重是数据库挡的_而且两条路各管各的",
    ),
    # 没有"N3 去掉索引的 WHERE source_note_id IS NOT NULL"这一条：SQLite 和 Postgres
    # 的唯一索引本来就把多个 NULL 当成互不相等，去掉这个 where 子句行为一字不变，
    # 打了等于没打。真正的并发防线是 _settle 里那个 except，由下面 N3 盯。
    (
        "N4 转存的去重只看「这篇」不看「这个人」（第二个人再转存就结不出账）",
        "app/services/quota.py",
        "        .filter(Invitation.source_note_id == src.id, Invitation.invitee_id == importer.id)\n",
        "        .filter(Invitation.source_note_id == src.id)\n",
        "tests/test_quota_and_invite.py::Test转存加分",
    ),
    (
        "N5 转存不判「作者就是转存人自己」",
        "app/services/quota.py",
        "    if author_pk == importer.id:\n"
        "        # 自己转自己那篇不算：转存入口本来就只给别人看的那篇才出现，\n"
        "        # 但接口能直接被调，所以这一刀在这里补上。\n"
        "        return 0\n",
        "",
        "tests/test_quota_and_invite.py::Test转存加分",
    ),
    (
        "N8 余额又改回「读出来在 Python 里加完写回去」",
        "app/services/quota.py",
        "    db.execute(\n"
        "        update(User).where(User.id == inviter.id).values(quota_bonus=User.quota_bonus + reward)\n"
        "    )\n",
        "    inviter.quota_bonus = int(inviter.quota_bonus or 0) + reward\n",
        "tests/test_quota_and_invite.py::Test审查补的两条",
    ),
    (
        "N7 结转账目不兜索引异常（真并发撞上来时整条转存报 500）",
        "app/services/quota.py",
        "    except IntegrityError:\n",
        "    except ValueError:\n",
        "tests/test_quota_and_invite.py::Test转存加分::test_并发撞索引那一趟只回零不把转存弄失败",
    ),
    (
        # v12 首页那两列的新规则。两条各打一刀：一刀去掉状态量过滤，一刀去掉按人去重——
        # 正好是站长那句"数按照真实来算，避免用户刷量"落成的两个技术动作。
        "N10 分享数退回「累计发出过几张码」（开→撤→开就能自己刷大）",
        "app/services/quota.py",
        "        .filter(Share.user_id == str(user.id), Share.is_active.is_(True))\n",
        "        .filter(Share.user_id == str(user.id))\n",
        "tests/test_quota_and_invite.py::Test首页那三列",
    ),
    (
        "N11 收藏数不再按人去重（一个人存十篇被数成十个人）",
        "app/services/quota.py",
        "        db.query(func.count(distinct(Invitation.invitee_id)))\n",
        "        db.query(func.count(Invitation.invitee_id))\n",
        "tests/test_quota_and_invite.py::Test首页那三列",
    ),
    (
        "N9 兜底外壳不再吞非索引异常（database is locked 会冒到接口上）",
        "app/services/quota.py",
        "    except Exception:\n",
        "    except ZeroDivisionError:\n",
        "tests/test_quota_and_invite.py::Test审查补的两条",
    ),
    (
        "A10 补报端点恒回 applied=true",
        "app/api/routes/user.py",
        "    applied = quota.attribute_inviter(user, db, req.inviter)\n"
        "    return {\"applied\": applied}\n",
        "    quota.attribute_inviter(user, db, req.inviter)\n"
        "    return {\"applied\": True}\n",
        "tests/test_quota_and_invite.py",
    ),
    (
        "A6 路由入队时不再带账号代数（worker 会静默退回老路）",
        "app/api/routes/ingest.py",
        "        user.generation,\n",
        "",
        "tests/test_quota_and_invite.py tests/test_worker_identity.py",
    ),
    (
        "A7 补报端点摘掉限流",
        "app/api/routes/user.py",
        "@router.post(\"/inviter\")\n@limiter.limit(\"10/minute\")\n",
        "@router.post(\"/inviter\")\n",
        "tests/test_quota_and_invite.py",
    ),
    # ---- 分享快照这一轮（tests/test_share_snapshot.py）----
    (
        "S1 改笔记时不同步公开快照（旧手机号留在公开页上）",
        "app/api/routes/notes.py",
        "            sync_snapshot(db, db_note)\n",
        "",
        "tests/test_share_snapshot.py",
    ),
    (
        "S2 同步快照但不重过公开闸（抓取来源的笔记可绕审上公开页）",
        "app/api/routes/notes.py",
        "            try:\n"
        "                enforce_text_safety(user.openid, *public_fields(db_note))\n"
        "            except UserError as e:\n"
        "                db.rollback()\n"
        "                raise HTTPException(status_code=400, detail=str(e))\n",
        "",
        "tests/test_share_snapshot.py",
    ),
    (
        "S3 公开闸不看这条笔记有没有分享出去（白烧配额）",
        "app/api/routes/notes.py",
        "        if not now_private and active_shares(db, db_note.id):\n",
        "        if not now_private:\n",
        "tests/test_share_snapshot.py",
    ),
    (
        "S4 key_links 退出公开送检清单（公开页显示却没检过）",
        "app/services/sharing.py",
        "        note.key_links,\n",
        "",
        "tests/test_share_snapshot.py",
    ),
    (
        "S5 key_links 退出手动笔记落库闸",
        "app/api/routes/notes.py",
        'MANUAL_TEXT_FIELDS = ("title", "summary", "key_points", "tags", "key_links", "content")',
        'MANUAL_TEXT_FIELDS = ("title", "summary", "key_points", "tags", "content")',
        "tests/test_share_snapshot.py",
    ),
    (
        "S6 ShareResponse 多给一列而快照清单没跟上",
        "app/api/routes/shares.py",
        "    key_links: list | None\n",
        "",
        "tests/test_share_snapshot.py",
    ),
    (
        "S7 复用旧分享整条摘掉（一条笔记散出多张码）",
        "app/api/routes/shares.py",
        "    if existing is not None:\n",
        "    if False:\n",
        "tests/test_share_snapshot.py",
    ),
    (
        "S8 内容没变也照样再打一遍 msgSecCheck",
        "app/api/routes/shares.py",
        "    if existing is not None and snapshot_matches(existing, note) and existing.author_name == author:\n",
        "    if False:\n",
        "tests/test_share_snapshot.py",
    ),
    (
        "S9 复用分享时不看有效期（过期那张继续发出去）",
        "app/api/routes/shares.py",
        "    existing = next((s for s in active_shares(db, note.id) if not is_expired(s)), None)\n",
        "    existing = next(iter(active_shares(db, note.id)), None)\n",
        "tests/test_share_snapshot.py",
    ),
    (
        "S10 小程序码接口摘掉限流",
        "app/api/routes/shares.py",
        '@router.get("/{token}/qrcode")\n@limiter.limit("60/minute")\n',
        '@router.get("/{token}/qrcode")\n',
        "tests/test_share_snapshot.py",
    ),
    # ---- 小程序码缓存（tests/test_share_qr_env.py）----
    (
        "Q1 码图取回来不存缓存（每次都真打微信）",
        "app/services/wechat.py",
        "        _qr_cache[key] = image\n"
        "        _qr_cache.move_to_end(key)\n"
        "        while len(_qr_cache) > _QR_CACHE_MAX:\n"
        "            _qr_cache.popitem(last=False)\n",
        "",
        "tests/test_share_qr_env.py",
    ),
    (
        "Q2 命中不更新最近使用（LRU 退化成先进先出）",
        "app/services/wechat.py",
        "        _qr_cache.move_to_end(key)\n        return cached\n",
        "        return cached\n",
        "tests/test_share_qr_env.py",
    ),
    (
        "Q3 缓存不设上限（拿内存换配额）",
        "app/services/wechat.py",
        "        while len(_qr_cache) > _QR_CACHE_MAX:\n            _qr_cache.popitem(last=False)\n",
        "",
        "tests/test_share_qr_env.py",
    ),
    (
        "Q4 缓存键不带版本号（改回 release 后还发体验版的码）",
        "app/services/wechat.py",
        "    key = (env_version, page, scene)\n",
        "    key = (page, scene)\n",
        "tests/test_share_qr_env.py",
    ),
    (
        "Q5 回源不留日志（烧没烧配额变成查不到的事）",
        "app/services/wechat.py",
        '        logger.info("小程序码回源微信 env=%s scene=%s… %d 字节",\n'
        "                    env_version, scene[:6], len(image))\n",
        "",
        "tests/test_share_qr_env.py",
    ),
    (
        "Q6 回源日志把整串 scene 写进去（公开 token 落进 journald）",
        "app/services/wechat.py",
        "                    env_version, scene[:6], len(image))",
        "                    env_version, scene, len(image))",
        "tests/test_share_qr_env.py",
    ),
    # ---- 内容安全判定缓存（tests/test_sec_check.py）----
    (
        "C1 判过的 pass 不记住（同一段文本反复问微信，100 次/天的额度几下用完）",
        "app/services/wechat.py",
        "        _sec_pass_cache[cache_key] = True\n",
        "",
        "tests/test_sec_check.py",
    ),
    (
        "C2 把「没检成」也记成检过（配额恢复之后永远不会再检）",
        "app/services/wechat.py",
        "    errcode = data.get(\"errcode\")\n    if errcode != 0:\n",
        "    errcode = data.get(\"errcode\")\n"
        "    if errcode != 0:\n"
        "        _sec_pass_cache[cache_key] = True\n",
        "tests/test_sec_check.py",
    ),
    (
        "C3 判定缓存不按 openid 分（换成别人的账号就不检了）",
        "app/services/wechat.py",
        '    cache_key = (openid, hashlib.sha256(content.encode("utf-8")).hexdigest())\n',
        '    cache_key = ("all-users-share", hashlib.sha256(content.encode("utf-8")).hexdigest())\n',
        "tests/test_sec_check.py",
    ),
    (
        "C4 判定缓存不设上限",
        "app/services/wechat.py",
        "        while len(_sec_pass_cache) > _SEC_PASS_CACHE_MAX:\n"
        "            _sec_pass_cache.popitem(last=False)\n",
        "",
        "tests/test_sec_check.py",
    ),
    (
        "C5 额度打光只当普通抖动记 warning",
        "app/services/wechat.py",
        "        if errcode in (45009, 44991):\n",
        "        if False:\n",
        "tests/test_sec_check.py",
    ),
    # ---- 日志装配（tests/test_logging_wired.py）----
    (
        "L1 app.* 的日志装配整块摘掉（INFO 全被 lastResort 丢掉）",
        "app/main.py",
        '_app_log = logging.getLogger("app")\n'
        "if not _app_log.handlers:\n"
        "    _app_handler = logging.StreamHandler()\n"
        '    _app_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))\n'
        "    _app_log.addHandler(_app_handler)\n"
        "    _app_log.setLevel(logging.INFO)\n",
        "",
        "tests/test_logging_wired.py",
    ),
    (
        "L2 装配挂在 WARNING 级别上（等于没装配）",
        "app/main.py",
        "    _app_log.setLevel(logging.INFO)\n",
        "    _app_log.setLevel(logging.WARNING)\n",
        "tests/test_logging_wired.py",
    ),
    (
        "L3 只设级别不挂 handler",
        "app/main.py",
        "    _app_log.addHandler(_app_handler)\n",
        "",
        "tests/test_logging_wired.py",
    ),
    # RM1~RM5：RoamMark 景点初稿那一腿（10-25，方案 docs/方案-roammark-AI转发.md §六）。
    # ⚠ RM1、RM2、RM3 三把在 10-25 第一遍跑是**扑空**的（尺子有洞），补了尺子才咬住，
    # 所以三条都留名在这里：谁动这八组用例，先读那三条对应的注释。
    (
        "RM1 留一枚没人叫的旧函数（舱壁从 Semaphore 换成一个整数后，那种一被叫上就当场 AttributeError 的死码）",
        "app/services/spot_draft.py",
        "async def draft_spot(images: list[bytes]",
        "def _probe_dead_slot_state() -> bool:\n    return _inflight > 0\n\n\nasync def draft_spot(images: list[bytes]",
        "tests/test_roammark_spot_draft.py::test_这两份新文件里不许留没人叫的函数",
    ),
    (
        "RM2 舱壁从 3 发抬到 99 发（单发实测 19.6 秒，同一台机器上还跑着图麦笔记现网）",
        "app/services/spot_draft.py",
        "INFLIGHT_LIMIT = 3\n",
        "INFLIGHT_LIMIT = 99\n",
        "tests/test_roammark_spot_draft.py::test_舱壁就是三发这个数字",
    ),
    (
        "RM3 摘掉合计字节那道闸（超限那一发交给 DeepSeek 去切 TLS，用户手机上只剩\"网络异常\"）",
        "app/services/spot_draft.py",
        "    if total > MAX_TOTAL_BYTES:\n",
        "    if False and total > MAX_TOTAL_BYTES:\n",
        "tests/test_roammark_spot_draft.py::test_合计字节那道闸真的在拦",
    ),
    (
        "RM4 回体里多带一个图字节（\"只回话不回图\"那句成假话）",
        "app/services/spot_draft.py",
        '    out["took_ms"] = took_ms\n',
        '    out["took_ms"] = took_ms\n    out["leak"] = images[0][:20].hex()\n',
        "tests/test_roammark_spot_draft.py::test_回体只有那几键多一个都不行",
    ),
    (
        "RM5 口令没配时当成\"不检\"（等于给整台机器开一个匿名 AI 出口）",
        "app/api/routes/roammark.py",
        "    if not gate:\n",
        "    if False:\n",
        "tests/test_roammark_spot_draft.py::test_口令没配时这一路整组关闭而不是不检",
    ),
    # RM6~RM10：10-25 代码全面审计补的五把（正本 `TmNote/审计-RoamMark代码-20261025.md` §五）。
    # 这五把打的都是"旧尺子量不到的那一格"：RM6/RM7 是两条吞变异的断言，RM8/RM9/RM10 是三段从没被执行过的代码。
    (
        "RM6 摘掉 declared-length 那道守卫（先把几十 MB 读进来才拒＝舱壁白装）",
        "app/api/routes/roammark.py",
        "    if declared.isdigit() and int(declared) > BODY_LIMIT:",
        "    if False and declared.isdigit() and int(declared) > BODY_LIMIT:",
        "tests/test_roammark_spot_draft.py::test_声明的体长超了当场413不读体",
    ),
    (
        "RM7 摘掉解码前的串长粗筛（超没超限都得先白解一次几十 MB）",
        "app/services/spot_draft.py",
        "        if len(item) > MAX_IMAGE_BYTES * 4 // 3 + 1024:",
        "        if False and len(item) > MAX_IMAGE_BYTES * 4 // 3 + 1024:",
        "tests/test_roammark_spot_draft.py::test_单张超上限的粗筛发生在解码之前",
    ),
    (
        "RM8 摘掉这一路的限流装饰器（三道闸的第一道；测试件整体关着限流所以一直没人叫它）",
        "app/api/routes/roammark.py",
        '@limiter.limit("10/minute", key_func=get_ip_key)\n',
        "",
        "tests/test_roammark_spot_draft.py::test_第一道闸挂在这一路上",
    ),
    (
        "RM9 去掉上游错误体里的钥脱敏（排查 401 全靠那一句，而那句里可能带着钥）",
        "app/services/spot_draft.py",
        '        body = r.text[:300].replace(key, "<key>")',
        "        body = r.text[:300]",
        "tests/test_roammark_spot_draft.py::test_真上游回401时哨兵钥进不了日志但日志里得有痕迹",
    ),
    (
        "RM10 超时不再单立一类（504 退化回 502：屏上「太慢了」与「对方没答」成了同一句话）",
        "app/services/spot_draft.py",
        '        raise AIUpstreamTimeout(f"upstream no answer in',
        '        raise AIUpstreamError(f"upstream no answer in',
        "tests/test_roammark_spot_draft.py::test_上游超时回504与独立code而不是500",
    ),
]


def _sha(raw: bytes) -> str:
    """字节指纹。

    为什么不调 `md5 -q`：那是 BSD/macOS 才有的外部命令（`反向验证-lib.sh:72/:194/:257` 全靠它），
    这一把秤要能在 Linux 的现网机上跑——搬到那边去只会每条刀都报"没落盘"。
    """
    return hashlib.sha256(raw).hexdigest()


def _surface(before: str, after: str) -> int:
    """这一刀在文件里实际改了多少行（增、删都算，上下文不算）。"""
    return sum(1 for ln in difflib.unified_diff(before.splitlines(), after.splitlines(), n=0)
               if ln[:1] in "+-" and ln[:3] not in ("+++", "---"))


_INFLIGHT = []          # 正被改坏的那只文件 [(path, 原字节)]——崩在半路时按它兜底还原
_ORIG = {}              # 每只文件进这一把之前的字节；用来认出"上一趟没还原干净"


def _sweep_inflight():
    while _INFLIGHT:
        p, raw = _INFLIGHT.pop()
        try:
            p.write_bytes(raw)
            print("· 兜底还原 %s" % p.name)
        except OSError as exc:
            print("!! 兜底还原失败：%s —— %s 还停在手改坏的那版上，手工按 git 那份还原" % (exc, p))


def apply_mutation(rel, old, new):
    """把 old 换成 new，返回 (原文, 命中处数, 报错说明)。

    不要求"恰好一次"：A3 那条额度复查在两个 worker 里各有一处，两处都该一起改坏，
    只改一处的话另一处仍然兜着，测出来的结果会偏乐观。
    ⚠ 但"多处"必须出声（10-25 审计 M23）：一处都没换是 SKIP，换了 5 处却只报一条刀名，
    读的人会把"这五处都红了"当成"这一处红了"。
    """
    p = BACKEND / rel
    src = p.read_text(encoding="utf-8")
    n = src.count(old)
    if n < 1:
        return src, 0, "锚点没命中，变异没打上"
    mutated = src.replace(old, new)
    if mutated == src:
        return src, n, "★突变没落盘★：替换跑完了文件一字未改，这条不算数"
    p.write_bytes(mutated.encode("utf-8"))
    return src, n, None


def main():
    # 刀名重复＝同一只文件的两份备份互相覆盖（`反向验证-lib.sh:174-178` 那一家）：
    # 台账上只看得到一条名字，分不清红的是哪一刀。这种账拒开，别跑一半才发现。
    names = [m[0] for m in MUTATIONS]
    dupes = sorted({x for x in names if names.count(x) > 1})
    if dupes:
        print("★刀名重复★，这一趟不开跑：%s" % "；".join(dupes))
        return 1

    leaked = []        # 没牙的刀（假绿／红得不明不白／语法崩／没落盘）
    wide = []          # 宽刀（锚点多处、或改动面 >2 行）：不改结论，只出声
    for name, rel, old, new, tests in MUTATIONS:
        p = BACKEND / rel
        try:
            original = p.read_bytes()
        except OSError as exc:
            print(f"SKIP  {name}  · 读不到 {rel}：{exc}")
            leaked.append((name, "读不到目标文件"))
            continue
        # 记下每只文件进刀前的字节：收尾那一次"还原干净了吗"只对得到这个数，
        # 而它认的是整趟跑完之后工作树的账（一把刀没还原干净，后面每一把的基线都是脏的）。
        _ORIG.setdefault(str(p), original)

        # —— 第一道闸：改动面（锚点出现几处、一共动了几行）先出声，再谈红不红 ——
        src, hits, err = apply_mutation(rel, old, new)
        if err:
            print(f"SKIP  {name}  · {err}")
            leaked.append((name, err))
            continue
        after = p.read_bytes()
        if _sha(after) == _sha(original):
            # 写进去了却没变＝这一刀压根没打到东西，报"用例咬住了"是自欺（lib.sh:194 那一条）
            print(f"BAD   {name}  · ★突变没落盘★（写完字节却没变）")
            leaked.append((name, "突变没落盘"))
            continue
        if hits > 1:
            print(f"⚠ {name} · 锚点在这只文件里出现 {hits} 处，这一刀把每一处都换掉了 —— 核一下改动面对不对")
            wide.append((name, f"锚点 {hits} 处全换"))
        nlines = _surface(src, src.replace(old, new))
        if nlines > 2:
            print(f"⚠ {name} · 这一刀动了 {nlines} 行，屏幕上那句刀名报不出这么大的面")
            wide.append((name, f"改动 {nlines} 行"))

        # —— 第二道闸：语法。改崩语法之后 pytest 一定非零，那种红不是牙（lib.sh:202）——
        mutated_text = after.decode("utf-8", "replace")
        try:
            ast.parse(mutated_text)
        except SyntaxError as exc:
            print(f"BAD   {name}  · ★突变把文件改崩了★：%s 行 %s —— 语法都不通了，这种红不算牙，重写这一刀"
                  % (exc.msg, exc.lineno))
            leaked.append((name, "突变把语法改崩了"))
            p.write_bytes(original)
            continue

        _INFLIGHT.append((p, original))
        try:
            r = subprocess.run(
                [PY, "-m", "pytest", *tests.split(), "-q", "--no-header", "-p", "no:cacheprovider"],
                cwd=str(BACKEND), capture_output=True, text=True,
            )
            out = (r.stdout or "") + (r.stderr or "")
            lines = out.splitlines()
            tail = [ln for ln in lines if "passed" in ln or "failed" in ln]
            # —— 第三道闸：数 FAILED／ERROR 那几行。非零退出却一条都没有，说明这一趟压根没跑起来
            # （用法错／收集中断／解释器问题），把它记成"有牙"就是 M23 说的那副假牙（lib.sh:237）。——
            teeth = sum(1 for ln in lines if ln.startswith("FAILED") or ln.startswith("ERROR "))
            if r.returncode == 0:
                print(f"LEAKED  {name}  · {tail[-1] if tail else out[-120:]}")
                leaked.append((name, "改坏了但用例全绿"))
            elif teeth == 0:
                print(f"BAD     {name}  · ★红得不明不白★（退出码 {r.returncode}，一条 FAILED／ERROR 都没有）"
                      f" —— 那不是牙，先问这一趟怎么没跑起来")
                leaked.append((name, f"退出码 {r.returncode} 却没有 FAILED／ERROR 行"))
            else:
                print(f"CAUGHT  {name}  · {tail[-1] if tail else '%d 条 FAILED／ERROR' % teeth}")
        finally:
            p.write_bytes(original)
            _INFLIGHT[:] = [x for x in _INFLIGHT if x[0] != p]
            # —— 还原做字节校验：写完就当没事，是进程被 SIGKILL 时把手改坏的那版留在工作树的入口。
            if _sha(p.read_bytes()) != _sha(original):
                print(f"!! {name} 还原后字节对不上 ⇒ {rel} 停在手改坏的那版上，先停下别往下跑")
                return 1

    # 还原后再跑一遍全套，确认没把文件改坏
    r = subprocess.run([PY, "-m", "pytest", "tests/", "-q", "--no-header", "-p", "no:cacheprovider"],
                       cwd=str(BACKEND), capture_output=True, text=True)
    restored = r.returncode == 0
    print(f"\n还原后全套：{'PASS' if restored else 'FAIL'}  · "
          f"{[ln for ln in (r.stdout or '').splitlines() if 'passed' in ln or 'failed' in ln][-1:]}")

    # 收尾再对一次全盘指纹：逐把那一次只保证"这一把还原了"，这一句保证的是"整趟跑完工作树是干净的"。
    drift = sorted(str(Path(q)) for q, raw in _ORIG.items() if _sha(Path(q).read_bytes()) != _sha(raw))
    if drift:
        print("\n★还原后仍有文件与进刀前对不上★：%s" % "；".join(drift))
    if wide:
        print(f"\n宽刀 {len(wide)} 条（不改结论，只报改动面）：")
        for n, why in wide:
            print(f"  ⚠ {n} — {why}")

    if leaked or drift:
        if leaked:
            print(f"\n{len(leaked)} 条变异没被测到：")
            for n, why in leaked:
                print(f"  ✗ {n} — {why}")
        if drift:
            print("\n工作树没还原干净 ⇒ 这一趟每一把的基线都可能是脏的，上面的红与绿都不作数")
        return 1
    print(f"\n{len(MUTATIONS)} 条变异全部被测到，还原后全套通过" if restored else "\n还原失败")
    return 0 if (restored and not leaked) else 1


atexit.register(_sweep_inflight)
signal.signal(signal.SIGTERM, lambda *_: (_sweep_inflight(), sys.exit(143)))


if __name__ == "__main__":
    sys.exit(main())
