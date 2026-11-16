"""一次性探针（跑完删，不入库）：H5 自己这一侧就能造出"名下两行 users"吗？

11-15 那两档探针走的是「小程序 ↔ 安卓」（`_wechat_person` 那条微信行做发起者）。
11-16 现网 H5 的「填 6 位码绑定邮箱」那一格已上屏 ⇒ 新增一条**全程不碰小程序**的顺序：
设备 A 用邮箱登进来并写笔记 → 设备 B 以游客号登录并写笔记 → 在 B 上绑同一枚邮箱。
这一趟问三件事：① 闸门放不放行（`real_wechat_users` 筛掉带冒号的 openid）② 并完名下几行
③ 之后每一把钥匙读得到几篇、有没有哪把够得着全部。

跑法：
    cp 本文件到 backend/tests/test_zz_probe_h5_only_rows.py
    cd backend && env -u NO_PROXY -u no_proxy .venv/bin/python -m pytest \\
        tests/test_zz_probe_h5_only_rows.py -q -s --tb=line
    rm backend/tests/test_zz_probe_h5_only_rows.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_email_bind import (  # noqa: E402
    ADDR, BIND, SEND, _clear_cooldown, _login_with_email, _send, mailbox,
)
from test_v1_auth_and_link import _bearer, _note, _reload, client, db  # noqa: E402

from app.models.account import Account  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.models.user import User  # noqa: E402


def _user_of(db, user_id):
    return _reload(db).query(User).filter(User.id == user_id).one()


def _guest_login(client, device_id):
    resp = client.post("/v1/auth/guest", json={"device_id": device_id})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["token"], body["user_id"]


def _notes_readable(client, token):
    resp = client.get("/api/notes/", headers=_bearer(token))
    if resp.status_code != 200:
        return f"HTTP {resp.status_code}"
    body = resp.json()
    return [n["title"] for n in body] if isinstance(body, list) else str(body)[:120]


def test_探针_全程H5_游客绑上别人那枚邮箱之后名下几行(client, db, mailbox):
    # 设备 A：邮箱登录（库里先有 email 身份那条 account + 一行 users），写一篇。
    token_a, uid_a = _login_with_email(client, mailbox)
    user_a = _user_of(db, uid_a)
    _note(db, user_a, title="设备A邮箱那一篇")
    acct_a = user_a.account_id
    print(f"\n[探针] A 邮箱登录 user {uid_a} / account {acct_a} openid={user_a.openid!r}")

    # 设备 B：游客号登录（另一条 account + 另一行 users），写一篇。
    token_b, uid_b = _guest_login(client, "device-B")
    user_b = _user_of(db, uid_b)
    _note(db, user_b, title="设备B游客那一篇")
    acct_b = user_b.account_id
    print(f"[探针] B 游客登录 user {uid_b} / account {acct_b} openid={user_b.openid!r}")
    assert acct_a != acct_b, "前提没了：两枚设备本该是两条 account"

    # 在 B 上绑同一枚邮箱（B 此刻手里是游客那把钥匙）。
    headers = _bearer(token_b)
    resp = client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                       headers=headers)
    print(f"[探针] B 绑 A 那枚邮箱 → HTTP {resp.status_code} {resp.text[:200]}")
    assert resp.status_code == 200, "★这一发就是答案：闸门把这条路挡死了★"
    body = resp.json()
    keep_id = body["account_id"]
    token_b2 = body["token"]

    _reload(db)
    rows = _reload(db).query(User).filter(User.account_id == keep_id).order_by(User.id).all()
    print(f"[探针] merged={body['merged']} keep account={keep_id} 名下 users 行 "
          f"= {[(r.id, r.openid) for r in rows]}")
    print(f"[探针] 库里 account 总数 = {db.query(Account).count()}（原 2 条）")
    print(f"[探针] 名下行数 = {len(rows)}")

    # 三把钥匙各读得到什么
    print(f"[探针] 绑定回体那把（B 手里）读到 = {_notes_readable(client, token_b2)}")
    print(f"[探针] A 那把旧的（并账应已作废）读到 = {_notes_readable(client, token_a)}")
    _clear_cooldown(mailbox)
    token_c, landed = _login_with_email(client, mailbox)
    print(f"[探针] 之后再拿邮箱登录 → 落 user {landed}，读到 = {_notes_readable(client, token_c)}")
    print(f"[探针] 邮箱登录落点 == A 那一行？ {landed == uid_a} ／ == B 那一行？ {landed == uid_b}")

    owners = {}
    for n in _reload(db).query(Note).all():
        owners.setdefault(str(n.user_id), []).append(n.title)
    print(f"[探针] 库里的笔记按 user_id 分 = {owners}（行数没删，只是钥匙够不够得着）")
