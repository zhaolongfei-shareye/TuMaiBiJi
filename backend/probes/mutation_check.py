"""变异测试：把已经修好的东西逐个改坏，确认对应用例真的会红。

全绿本身不证明测到了——断言可能压根没经过被改的那行，或者观测量本身就是被修的东西。
每条变异跑完立刻还原；任何一条"改坏了还全绿"都说明那处修复是裸奔的。
前 11 条是额度/注销那一轮，S1~S10 是分享快照这一轮。
"""
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
    # 2026-09-24 取消 100 篇闸门之后，原来那两条"落库前复查额度"和两条"注销追回邀请奖励"
    # 的锚点随着代码一起没了（那是设计如此，不是漏修）。换成守现在这两条：台账要记得上、
    # 注销要把台账两个方向一起删掉。
    (
        "A3 worker 落库后不记邀请台账",
        "app/tasks/ingest_tasks.py",
        "            record_first_note(db, user_id, note)\n",
        "",
        "tests/test_quota_and_invite.py tests/test_worker_identity.py",
    ),
    (
        "A5 注销不删邀请台账（已注销的人还在替别人凑数）",
        "app/api/routes/user.py",
        "    db.query(Invitation).filter(\n"
        "        (Invitation.invitee_id == user.id) | (Invitation.inviter_id == user.id)\n"
        "    ).delete()\n",
        "",
        "tests/test_account_deletion.py",
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
        "        if active_shares(db, db_note.id):\n",
        "        if True:\n",
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
]


def run(rel, old, new):
    """把 old 全量替换成 new。

    不要求"恰好一次"：A3 那条额度复查在两个 worker 里各有一处，两处都该一起改坏，
    只改一处的话另一处仍然兜着，测出来的结果会偏乐观。
    """
    p = BACKEND / rel
    src = p.read_text(encoding="utf-8")
    n = src.count(old)
    if n < 1:
        return None, f"锚点没命中，变异没打上"
    p.write_text(src.replace(old, new), encoding="utf-8")
    return src, None


def main():
    leaked = []
    for name, rel, old, new, tests in MUTATIONS:
        original, err = run(rel, old, new)
        if err:
            print(f"SKIP  {name}  · {err}")
            leaked.append((name, err))
            continue
        try:
            r = subprocess.run(
                [PY, "-m", "pytest", *tests.split(), "-q", "--no-header", "-p", "no:cacheprovider"],
                cwd=str(BACKEND), capture_output=True, text=True,
            )
            caught = r.returncode != 0
            tail = [ln for ln in r.stdout.strip().splitlines() if "passed" in ln or "failed" in ln]
            print(f"{'CAUGHT' if caught else 'LEAKED'}  {name}  · {tail[-1] if tail else r.stdout[-120:]}")
            if not caught:
                leaked.append((name, "改坏了但用例全绿"))
        finally:
            (BACKEND / rel).write_text(original, encoding="utf-8")

    # 还原后再跑一遍全套，确认没把文件改坏
    r = subprocess.run([PY, "-m", "pytest", "tests/", "-q", "--no-header", "-p", "no:cacheprovider"],
                       cwd=str(BACKEND), capture_output=True, text=True)
    restored = r.returncode == 0
    print(f"\n还原后全套：{'PASS' if restored else 'FAIL'}  · "
          f"{[ln for ln in r.stdout.strip().splitlines() if 'passed' in ln or 'failed' in ln][-1:]}")

    if leaked:
        print(f"\n{len(leaked)} 条变异没被测到：")
        for n, why in leaked:
            print(f"  ✗ {n} — {why}")
        return 1
    print(f"\n{len(MUTATIONS)} 条变异全部被测到，还原后全套通过" if restored else "\n还原失败")
    return 0 if (restored and not leaked) else 1


if __name__ == "__main__":
    sys.exit(main())
