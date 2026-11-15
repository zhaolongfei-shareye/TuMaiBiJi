"""把一枚验过归属的邮箱绑到当前这个人身上（`POST /v1/account/email/send|bind`）。

站长 11-15 的原话：「邮箱作为唯一身份依据，设置邮箱后，我们平台向邮箱发送一个邮件，
邮件里面，提供一个 6 位数字，回到应用端，填入……就完成绑定。」并授权「这个新增功能
你自己可以安排」。服务端这一半解决的就是 `docs/方案-2.1大版本.md` §二 那一句：
「一个微信账号绑一个已验证邮箱 → 之后他可以用邮箱登录进**同一个 `user_id`**」。

这一份文件钉的事，按代价从大到小：

1. **不许并错人**（数据混合不可逆）。目标 account 名下已有**别的微信真人** ⇒ 409，
   而且红的那一发库里什么都不许动：两条 account、各自的笔记、两格代次全部原样。
2. **也不许把该并的挡掉**。H5 那四枝把 `email:`／`phone:`／`guest:`／`pwd:` 这类前缀
   直接塞进了 `users.openid`（`v1_auth.py:207/:266/:371/:468`），那种行不是微信真人。
   这一条用**真门**量：先走 `/v1/auth/email` + `/v1/auth/email-login` 建出"安卓那一边的人"，
   再从小程序绑同一枚邮箱 ⇒ 必须并成一条。手工造形状会掩盖"两只门算出的 `provider_uid`
   不一样"那一种错（少了前缀、少一次转小写，fixture 照样绿、现网每次都新建第二条 account），
   所以这里连发码都从登录那只门走。
3. **归属一变两侧旧钥匙全废**（契约 §二 第 4 步，与 `redeem` 同一条），但发起者不该被踢下线
   ⇒ 回体当场给一把新钥匙，判据拿它真打一次 legacy 门。
4. **纯新绑不算归属变更**：不抬代次，手里那把继续能用（与 `/v1/auth/upgrade` 同一口径）。
5. **发码门不许当枚举机**：格式不对／正在冷却／邮箱属于谁都回同一句 `{}`；
   只有 Redis 不可用才 503——"验证码已发送"这句话不许在那枚码从没被记下来时说出口。

⚠ 送达那一格分两段账，别引串：
本机段——11-15 夜拿子账号密钥（只挂 `QcloudSESFullAccess`，值不在仓里也不在服务器）直发 6 封
到外部邮箱，正文两个变量全渲染，腾讯云回执六行 `SendStatus=0`＋`DeliverStatus=1`；模板
`tmbj_email_bind_code` 念 `TemplateStatus=0`（官方：已通过）。
现网段——11-15 20:42 这批代码与 `.env` 那四栏一起上了现网，20:46 用部署后的
`email.send_code` 真发一封到站外一次性邮箱：`noreply@agentsbin.cn` → 主题「图麦笔记验证码」、
正文含 6 位码，回执 `MessageId=qcloudses-30-1306692112-date-20261115204656-scxv90daqhbb1`。
下面量的是账与凭证；发信形状那几条钉的是**真接口回过的错**，不是照文档猜的字段名。
比对那一支钉的是**现网 Redis 的真实版本**（6.0.16 没有 `GETDEL`，见
`test_现网那台Redis没有GETDEL_正码也验得过`），也不是照文档写的。
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_v1_auth_and_link import (  # noqa: E402
    _account_token, _bearer, _note, _reload, _user_token, _wechat_person, client, db,
)

from app.models.account import Account, AccountIdentity  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.models.user import User  # noqa: E402

ADDR = "person@example.com"
OTHER = "second@example.com"
SEND = "/v1/account/email/send"
BIND = "/v1/account/email/bind"
SESSION = "/v1/auth/session"          # 只认 legacy 钥匙（`get_current_user`）的一扇门


class _FakePipeline:
    """排队语义照 redis-py：入队只回 `QUEUED`，`execute()` 才按顺序真跑并回结果列表。

    `verify_code` 拿的就是这一支（MULTI 里 GET＋DEL），所以假件必须把"两条命令一次送"
    这个形状留住——各写一条独立命令的假件量不出取与删之间会不会被人插进来。
    """

    def __init__(self, conn):
        self.conn = conn
        self.queue = []

    def get(self, key):
        self.queue.append(("get", key))
        return True

    def delete(self, key):
        self.queue.append(("delete", key))
        return True

    def execute(self):
        out = [getattr(self.conn, cmd)(key) for cmd, key in self.queue]
        self.queue = []
        return out


class _FakeRedis:
    """只实现 `services/email.py` 真用到的那四条命令（TTL / SETEX / GET / DEL＋MULTI 那一支）。

    值按 redis-py 的默认形状回 **bytes**（`decode_responses` 是关的）：`verify_code` 里
    那一句 `stored.decode() if isinstance(stored, bytes)` 就是为这个形状写的，假件回 str
    就把那一支变成没量过的死路。

    这里**故意不提供 `getdel`**：现网那台 Redis 是 6.0.16，服务端不认这条命令（见
    `test_现网那台Redis没有GETDEL_正码也验得过`）。
    """

    def __init__(self):
        self.kv: dict[str, tuple[str, int]] = {}

    def ttl(self, key):
        hit = self.kv.get(key)
        return -2 if hit is None else hit[1]

    def setex(self, key, ttl, value):
        self.kv[key] = (value, ttl)
        return True

    def get(self, key):
        hit = self.kv.get(key)
        return None if hit is None else hit[0].encode()

    def delete(self, key):
        return 1 if self.kv.pop(key, None) is not None else 0

    def pipeline(self, transaction=True, shard_hint=None):
        assert transaction, "取与删必须在同一次事务里，否则并发能读到同一枚码各自判对"
        return _FakePipeline(self)


@pytest.fixture
def mailbox(monkeypatch):
    """邮箱那条链的 Redis 换成假件；发信通道**不替它打桩**，让它真跑"四栏没配齐"那一档。

    这样"没有 SMTP 凭据时发码门不炸、也不谎报失败"是用例跑出来的，不是我读代码读出来的
    ——而那一档恰好就是现网今天的状态。
    """
    from app.services import email as email_service

    conn = _FakeRedis()
    monkeypatch.setattr(email_service, "get_redis_conn", lambda: conn)
    return conn.kv


# ---- 小工具 ----

def _code_key(addr):
    return f"email:code:{addr}"


def _cool_key(addr):
    return f"email:cool:{addr}"


def _send(client, headers, mailbox, addr=ADDR):
    """打绑定那扇发码门，取回**存进 Redis 的那一枚**码（不是"我以为发了哪一枚"）。"""
    resp = client.post(SEND, json={"email": addr}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {}, "发码门的回体必须只有一句空话，多一个字符都是给枚举机喂料"
    return mailbox[_code_key(addr)][0]


def _clear_cooldown(mailbox, addr=ADDR):
    """抹掉冷却那一格：同一趟里要连着发两枚码（登录门吃掉一枚、绑定门再要一枚）。"""
    mailbox.pop(_cool_key(addr), None)


def _login_with_email(client, mailbox, addr=ADDR):
    """走**真门**用邮箱登进来（H5／安卓那一路），回 (token, users.id)。

    登录门自己会落冷却格，所以这里顺手抹掉，让调用方下一句 `_send` 拿得到新码。
    """
    assert client.post("/v1/auth/email", json={"email": addr}).status_code == 200
    code = mailbox[_code_key(addr)][0]
    assert _cool_key(addr) in mailbox, "登录门发完码没落冷却格，后面那句抹掉它就没意义了"
    _clear_cooldown(mailbox, addr)
    resp = client.post("/v1/auth/email-login", json={"email": addr, "code": code})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"], resp.json()["user_id"]


def _emails_of(db, account_id):
    return (db.query(AccountIdentity)
            .filter(AccountIdentity.account_id == account_id,
                    AccountIdentity.provider == "email")
            .all())


def _gen_of(db, user_id):
    return db.query(User).filter(User.id == user_id).one().generation


def _account_alive(db, account_id):
    return db.query(Account).filter(Account.id == account_id).first() is not None


def _note_owner(db, note_id):
    return db.query(Note).filter(Note.id == note_id).one().user_id


# ---- 发码那一扇门 ----

class Test发码那一扇门:
    def test_没登录发不出去(self, client, db, mailbox):
        assert client.post(SEND, json={"email": ADDR}).status_code == 401
        assert mailbox == {}, "401 那一趟连一枚码都不该存进 Redis"

    def test_iPhone那把账号钥匙开不了这一扇门(self, client, db, mailbox):
        """发起绑定的正是**有东西要保住的那一端**（小程序／安卓手里是 legacy 钥匙）。
        iPhone 那把 `kind=account` 在这里必须 401，否则"替别人发起绑定"就多了一扇门。"""
        _user, account = _wechat_person(db)
        resp = client.post(SEND, json={"email": ADDR},
                           headers=_bearer(_account_token(account)))
        assert resp.status_code == 401, resp.text
        assert mailbox == {}

    def test_格式不对回同一句话而且什么都不存(self, client, db, mailbox):
        """三句都过不了 `EMAIL_RE`，但回体与真地址一字不差：`a@b.c` 与 `person@example.com`
        听起来一模一样，攻击者就分不出"格式没过"和"这邮箱没人用"。"""
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        for bad in ("no-at-sign", "a@b.c", "foo@bar"):
            resp = client.post(SEND, json={"email": bad}, headers=headers)
            assert resp.status_code == 200, f"{bad} → {resp.text}"
            assert resp.json() == {}
        assert mailbox == {}, "格式没过就不许往 Redis 里写东西"

    def test_冷却中不再发第二枚(self, client, db, mailbox):
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        first = _send(client, headers, mailbox)
        assert mailbox[_cool_key(ADDR)][0] == "1", "发成功必须落下冷却那一格"
        assert _send(client, headers, mailbox) == first, "冷却中又存了一枚新码＝那一档 TTL 白挂"

    def test_Redis不可用时不许谎报已发送(self, client, db, monkeypatch):
        """存储崩了必须 503。回 200 的话界面会念"验证码已发到您的邮箱"，而那枚码从没被记下来，
        用户填什么都是 400——这是这条链上最难自查的一种骗人。

        ⚠ `check_cooldown` 自己把 Redis 异常吞了（回 0＝不冷却），所以这一趟会一路走到
        `store_code` 才响；这正是 503 那一支存在的理由。
        """
        from app.services import email as email_service

        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))

        def boom():
            raise ConnectionError("假 Redis：连接不上")

        monkeypatch.setattr(email_service, "get_redis_conn", boom)
        assert client.post(SEND, json={"email": ADDR}, headers=headers).status_code == 503

    def test_现网那台Redis没有GETDEL_正码也验得过(self, monkeypatch):
        """11-15 20:47 现读服务器：`conn.info("server")` 回 **redis_version 6.0.16**，
        而 `GETDEL` 是 6.2 才有的命令。旧代码那句 `hasattr(conn, "getdel")` 判的是
        **客户端**（服务器上的 redis-py 8.1.0 一直有这个方法），命令真发出去服务端回
        `unknown command GETDEL`，异常被 `verify_code` 的 `except` 吞成 False
        ⇒ 现网第一次真发码就撞上"填对也念验证码错"。

        ⚠ 桩必须长成真事那一型：**方法在，一调就抛** `ResponseError`。
        只把 `getdel` 从假件里删掉，判的还是"客户端有没有这个方法"——那正是这个错判
        能活过整份用例的原因（假件没方法 ⇒ 走 pipeline ⇒ 绿；服务器有方法没命令 ⇒ 红）。
        """
        from app.services import email as email_service

        from redis.exceptions import ResponseError

        class _Redis60(_FakeRedis):
            def __init__(self):
                super().__init__()
                self.getdel_calls = 0

            def getdel(self, key):
                self.getdel_calls += 1
                raise ResponseError("unknown command `GETDEL`, with args beginning with: ")

        conn = _Redis60()
        monkeypatch.setattr(email_service, "get_redis_conn", lambda: conn)
        email_service.store_code(ADDR, "123456")
        assert email_service.verify_code(ADDR, "123456") is True, "正码被吞成 False＝绑定永远走不完"
        assert conn.getdel_calls == 0, "还在打 GETDEL＝6.0 上每一次比对都先撞一记异常"
        assert email_service.verify_code(ADDR, "123456") is False, "取走之后同一枚不许再用"


# ---- 绑定：一枚没人用过的邮箱 ----

class Test绑定一枚没人用过的邮箱:
    def test_新绑不抬代次手里钥匙继续能用(self, client, db, mailbox):
        """加一种登录方式不是归属变更（与 `/v1/auth/upgrade` 同一口径）。
        判据不写"我以为代次没动"，写"手里那把钥匙真打一扇门还开得住"。"""
        user, account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        resp = client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["merged"] is False, "库里没第二个人，谈不上合并"
        assert body["account_id"] == account.id, "纯新绑不该把人挪到另一条 account 上"

        _reload(db)
        rows = _emails_of(db, account.id)
        assert [r.provider_uid for r in rows] == [f"email:{ADDR}"], \
            "挂上去那串必须是 `email:<小写地址>`（与 H5 邮箱登录同一串，见 `email_provider_uid`）"
        assert rows[0].verified_at is not None, "收得到验证码＝归属已确认，这一格不许留 NULL"
        assert _gen_of(db, user.id) == user.generation, "纯新绑不许抬代次"
        assert client.get(SESSION, headers=headers).status_code == 200, "旧钥匙被纯新绑打失效了"

    def test_回体里那把新钥匙当场开得动门(self, client, db, mailbox):
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        resp = client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers)
        assert resp.status_code == 200, resp.text
        assert client.get(SESSION, headers=_bearer(resp.json()["token"])).status_code == 200

    def test_再点一次确认库里什么都不动(self, client, db, mailbox):
        """他多点一次是常态。这一趟既要幂等，也不许把 `verified_at` 刷成今天——
        那一格记的是"什么时候验过归属"，刷它等于抹掉第一次的证据（也是解绑闸门的依据）。"""
        user, account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                    headers=headers)
        _reload(db)
        first_verified_at = _emails_of(db, account.id)[0].verified_at
        gen_before = _gen_of(db, user.id)

        _clear_cooldown(mailbox)
        resp = client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["merged"] is False
        _reload(db)
        rows = _emails_of(db, account.id)
        assert len(rows) == 1, f"一个人只许留一枚邮箱，现在 {len(rows)} 枚"
        assert rows[0].verified_at == first_verified_at, "第二次绑定把验证时间刷成今天了"
        assert _gen_of(db, user.id) == gen_before, "重复绑定不许抬代次"

    def test_大小写与前后空格算同一枚邮箱(self, client, db, mailbox):
        """`A@B.com` = `a@b.com`（H5 邮箱登录早就转小写了）。绑定时不转的话，同一个人输两次
        会落出两枚身份行，界面上"绑了没有"就有两个答案。"""
        user, account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        resp = client.post(BIND, json={"email": f"  {ADDR.upper()} ",
                                       "code": _send(client, headers, mailbox)}, headers=headers)
        assert resp.status_code == 200, resp.text
        _reload(db)
        assert [r.provider_uid for r in _emails_of(db, account.id)] == [f"email:{ADDR}"]

    def test_码不对时账上一行都不动而那枚码当场销毁(self, client, db, mailbox):
        """销毁是 `GETDEL` 的语义：猜错也取走。留着同一枚码＝6 位数字给到 10⁶ 次机会，
        那就不是"一枚码一次机会"。"""
        user, account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        code = _send(client, headers, mailbox)
        wrong = "000000" if code != "000000" else "111111"

        resp = client.post(BIND, json={"email": ADDR, "code": wrong}, headers=headers)
        assert resp.status_code == 400, resp.text
        assert _code_key(ADDR) not in mailbox, "猜错的那一发把码留下了＝可以拿同一枚码反复试"
        _reload(db)
        assert _emails_of(db, account.id) == [], "码没对却把身份行挂上了"
        assert _gen_of(db, user.id) == user.generation

    def test_一枚码只能用一次(self, client, db, mailbox):
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        code = _send(client, headers, mailbox)
        assert client.post(BIND, json={"email": ADDR, "code": code},
                           headers=headers).status_code == 200
        assert client.post(BIND, json={"email": ADDR, "code": code},
                           headers=headers).status_code == 400

    def test_码格式没过时不消费Redis里那枚好码(self, client, db, mailbox):
        """`CODE_RE` 挡在非数字前面：先验格式再打 Redis。反过来（先 GETDEL 再判格式）
        会把用户上一枚还能用的码白烧掉。"""
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        code = _send(client, headers, mailbox)
        assert client.post(BIND, json={"email": ADDR, "code": "abcdef"},
                           headers=headers).status_code == 400
        assert _code_key(ADDR) in mailbox, "格式没过却把码消费掉了"
        assert client.post(BIND, json={"email": ADDR, "code": code},
                           headers=headers).status_code == 200, "那枚好码被误烧了"


# ---- 绑定：并账（"打通多端"真正发生的那一支）----

class Test绑一枚属于另一个端的邮箱:
    def test_安卓用同一枚邮箱登过_绑上来并成一条(self, client, db, mailbox):
        user, account = _wechat_person(db)
        mine_id = account.id
        my_note = _note(db, user, title="小程序里的那一篇")
        my_token = _user_token(user)

        h5_token, h5_user_id = _login_with_email(client, mailbox)
        assert h5_user_id != user.id, "前提没了：邮箱登录没能建出另一个人"

        resp = client.post(BIND, json={"email": ADDR, "code": _send(client, _bearer(my_token), mailbox)},
                           headers=_bearer(my_token))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["merged"] is True, "另一条 account 就在库里，这一趟必须真并了账"
        assert body["account_id"] == mine_id, "有笔记的那一边是主账号（`choose_main` 第 1 条）"

        _reload(db)
        assert _account_alive(db, mine_id), "主账号没了"
        assert db.query(Account).filter(Account.id != mine_id).count() == 0, "输的那一条没删干净"
        assert db.query(User).filter(User.id == h5_user_id).one().account_id == mine_id, \
            "那一边的登录行留在原地，而原地的 account 已经删了＝指向空处"
        assert [r.provider_uid for r in _emails_of(db, mine_id)] == [f"email:{ADDR}"], \
            "并过来之后名下那枚邮箱必须只有一行"
        assert _note_owner(db, my_note.id) == str(user.id), "笔记不许搬家"

        # 发起者不该被并账踢下线：回体那把新钥匙当场能用。
        assert client.get(SESSION, headers=_bearer(body["token"])).status_code == 200
        # 而合并之前那两把旧钥匙都作废（小程序那把 + 安卓邮箱登录那把）。
        assert client.get(SESSION, headers=_bearer(my_token)).status_code == 401, "旧钥匙还活着"
        assert client.get(SESSION, headers=_bearer(h5_token)).status_code == 401

        # 并账之后**再从邮箱登进来**落哪一行：必须是小程序那一行（有笔记的那一行）。
        # 这一句钉的是"落点稳定"，不是"两端都看得见"——反序那一档（安卓先登并写过笔记）
        # 会留下第二行 `users` 而它的笔记读不到，修法记在 §8.531 待拍⑥（甲／乙／丙／丁，等他拍）。
        _clear_cooldown(mailbox)
        _token2, landed_user_id = _login_with_email(client, mailbox)
        assert landed_user_id == user.id, \
            f"邮箱登录落到 user {landed_user_id}，而有笔记那一行是 {user.id}（落点由没有 ORDER BY 的 .first() 决定）"

    def test_两边都有笔记时一行都不搬(self, client, db, mailbox):
        """`merge_into` 动的是"哪条 account 活着"，业务表挂 `users.id` ⇒ 笔记**不许**跟着搬。
        搬了就等于把另一个人的几百篇笔记换个抽屉，那是这条链唯一不可逆的错法。"""
        user, account = _wechat_person(db)
        my_note = _note(db, user, title="小程序的")
        my_token = _user_token(user)

        _h5_token, h5_user_id = _login_with_email(client, mailbox)
        h5_user = _reload(db).query(User).filter(User.id == h5_user_id).one()
        other_note = _note(db, h5_user, title="安卓的")

        headers = _bearer(my_token)
        resp = client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["merged"] is True

        _reload(db)
        assert _note_owner(db, my_note.id) == str(user.id)
        assert _note_owner(db, other_note.id) == str(h5_user_id), "并账的时候顺手把笔记也搬了"

    def test_绑完再从邮箱登进来不会长出第三个人(self, client, db, mailbox):
        """并账的全部意义：这一枚邮箱此后**永远**指向同一个人。
        如果绑定挂的 `provider_uid` 和登录门算出的差一个字符，这里就会悄悄多出第三条 account,
        而他看到的是"我绑了邮箱，换个设备登录后笔记却是空的"。"""
        user, account = _wechat_person(db)
        mine_id = account.id
        _note(db, user, title="小程序里的那一篇")
        my_token = _user_token(user)

        _login_with_email(client, mailbox)
        headers = _bearer(my_token)
        assert client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers).status_code == 200

        _reload(db)
        users_before = db.query(User).count()
        _clear_cooldown(mailbox)
        _h5_token, third_login_user_id = _login_with_email(client, mailbox)   # 第三次从同一枚邮箱登进来
        _reload(db)
        assert db.query(User).count() == users_before, "邮箱登录又新建了一行 users"
        assert db.query(Account).count() == 1, "并完账再登录又长出第二条 account"
        assert db.query(User).filter(User.account_id != mine_id).count() == 0
        # §二 那句"进同一个 `user_id`"的**这一种**顺序：登录必须解出小程序那一行，
        # 否则 H5 拿到的是另一行的钥匙、读不到小程序里的笔记（反序那一档记在 §8.531 待拍⑥，本轮不修）。
        assert third_login_user_id == user.id, \
            f"邮箱登录解出 user {third_login_user_id}，而名下那一行是 {user.id}"
        notes = client.get("/api/notes/", headers=_bearer(_h5_token))
        assert notes.status_code == 200, notes.text
        assert any(n["title"] == "小程序里的那一篇" for n in notes.json()), \
            "钥匙对上了却读不到小程序那一篇 ⇒ 归属与数据挂载点不是同一层，这一条要红给人看"

    def test_那枚邮箱属于另一个微信真人时当场409(self, client, db, mailbox):
        """两个人各有微信号、共用一枚邮箱（家庭共用邮箱是真实场景）。放过去就是两份笔记并成一份，
        而且没有任何一层能再把它们分开。这一条与上一条是同一道闸的两刃。"""
        user, account = _wechat_person(db, openid="o_me")
        other_user, other_account = _wechat_person(db, openid="o_other")
        other_note = _note(db, other_user, title="另一个人的")
        mine_id, my_gen = account.id, user.generation
        from app.services import accounts as accounts_service
        accounts_service.add_identity(db, other_account, "email", f"email:{ADDR}")
        db.commit()
        other_id = other_account.id

        headers = _bearer(_user_token(user))
        resp = client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers)
        assert resp.status_code == 409, resp.text
        assert "另一个" in resp.json()["detail"], resp.json()

        _reload(db)
        assert _account_alive(db, other_id), "409 那一趟把别人的 account 删了"
        assert _account_alive(db, mine_id), "409 那一趟把自己这条 account 弄没了"
        assert db.query(User).filter(User.id == other_user.id).one().account_id == other_id
        assert _note_owner(db, other_note.id) == str(other_user.id), "闸门挡住了但笔记搬了"
        assert _emails_of(db, mine_id) == [], "拒绝了合并却把邮箱挂到自己名下"
        assert _gen_of(db, user.id) == my_gen, "闸门挡住之后仍然抬代次＝把人踢下线当报错用"


    def test_并过来那一侧还带着旧邮箱时名下只留这一枚(self, client, db, mailbox):
        """并账会把**对面那枚邮箱**也搬过来，于是名下同时挂着 a@ 与 b@。
        留两枚的后果不是"多一个入口"：`GET /v1/account` 那句"绑了没有"只念得出其中一枚，
        而另一枚照样登得进同一份笔记——他以为已经换掉的那一种登录方式其实还活着。"""
        user, account = _wechat_person(db)
        mine_id = account.id
        _note(db, user, title="小程序里的那一篇")
        headers = _bearer(_user_token(user))
        assert client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers).status_code == 200
        _reload(db)
        gen_before = _gen_of(db, user.id)

        _login_with_email(client, mailbox, OTHER)      # 另一条 account 用 b@ 登进来
        resp = client.post(BIND, json={"email": OTHER,
                                       "code": _send(client, headers, mailbox, OTHER)},
                           headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["merged"] is True

        _reload(db)
        assert [r.provider_uid for r in _emails_of(db, mine_id)] == [f"email:{OTHER}"], \
            "名下留了两枚邮箱"
        assert _gen_of(db, user.id) == gen_before + 1, "摘掉一种登录方式必须抬代次"


# ---- 换绑与门的边界 ----

class Test换绑与边界:
    def test_换绑把旧那一枚摘掉并抬一次代次(self, client, db, mailbox):
        """摘掉一种登录方式按 `unbind` 的口径要抬代次：从那一枚邮箱换来的钥匙不该继续开门。
        抬完当场发新钥匙，所以他自己不受影响。"""
        user, account = _wechat_person(db)
        mine_id = account.id
        first = _bearer(_user_token(user))
        assert client.post(BIND, json={"email": ADDR, "code": _send(client, first, mailbox)},
                           headers=first).status_code == 200
        _reload(db)
        gen_before = _gen_of(db, user.id)
        second = _bearer(_user_token(db.query(User).filter(User.id == user.id).one()))

        resp = client.post(BIND, json={"email": OTHER, "code": _send(client, second, mailbox, OTHER)},
                           headers=second)
        assert resp.status_code == 200, resp.text

        _reload(db)
        assert [r.provider_uid for r in _emails_of(db, mine_id)] == [f"email:{OTHER}"], \
            "旧邮箱还挂在名下＝两枚邮箱都能登进同一份笔记"
        assert _gen_of(db, user.id) == gen_before + 1, "换绑必须抬一次代次"
        assert client.get(SESSION, headers=second).status_code == 401, "换绑前那把钥匙该作废"
        assert client.get(SESSION, headers=_bearer(resp.json()["token"])).status_code == 200

    def test_没登录绑不上(self, client, db, mailbox):
        assert client.post(BIND, json={"email": ADDR, "code": "123456"}).status_code == 401

    def test_只有账号钥匙开不了绑定门(self, client, db, mailbox):
        _user, account = _wechat_person(db)
        resp = client.post(BIND, json={"email": ADDR, "code": "123456"},
                           headers=_bearer(_account_token(account)))
        assert resp.status_code == 401, resp.text

    def test_绑定过的邮箱在我是谁那一格里看得见(self, client, db, mailbox):
        """iPhone 之后要按 `GET /v1/account` 的 providers 判断"还要不要绑邮箱"；
        绑完那一格里没有 `email` 的话界面会永远念"还没绑"。"""
        user, account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        assert client.post(BIND, json={"email": ADDR, "code": _send(client, headers, mailbox)},
                           headers=headers).status_code == 200
        who = client.get("/v1/account", headers=_bearer(_account_token(account)))
        assert who.status_code == 200, who.text
        assert sorted(who.json()["providers"]) == ["email", "wechat"], who.json()


# ---- 发信那一发的请求形状（SES API）----
#
# 上面那些用例全走"四栏没配齐 ⇒ 只写日志"那一档，也就是现网今天的状态；那一条链上
# `httpx` 一次都没出过网，所以**签名与参数名一行没被量过**。而这几个名字是 11-15 一发一发
# 打真接口试出来的（`Sender` 回 `MissingParameter FromEmailAddress`；`Body`／`Content`／
# `Simple` 全部回 `UnknownParameter`；只有 `Template` 走得通）。下面这几条钉的就是这几处，
# 改回文档里那两个"看着更像"的名字必须当场红。

_SES_ID = "AKIDfakefakefakefakefakefakefakefa"
_SES_KEY = "fakefakefakefakefakefakefakefake"
_SES_FROM = "noreply@agentsbin.cn"
_SES_TPL = "235732"

# 11-15 夜六发真信的回体形状：成功只有 `RequestId`/`MessageId` 两栏。
_SES_OK = (200, {"Response": {"RequestId": "00000000-0000-0000-0000-000000000000",
                              "MessageId": "qcloudses-fake-message-id"}})


class _Resp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = json.dumps(payload, ensure_ascii=False)

    def json(self):
        return self._payload


class _Ses:
    """假 `httpx.AsyncClient`：记下**真发出去的**那一发（body＋头），并按脚本回响应。"""

    requests: list = []
    script = _SES_OK

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, headers=None, content=None):
        _Ses.requests.append({"url": url, "headers": dict(headers or {}),
                             "body": json.loads(content)})
        status, payload = _Ses.script
        return _Resp(status, payload)


@pytest.fixture
def ses(db, monkeypatch):
    """四栏配齐＋httpx 换假件 ⇒ 让 `send_code` 真走到出网那一步。

    四栏是从 `settings` 里读、经 `service_secrets.resolve` 落回退值（测试库里没有这几枚名字），
    所以这里补的是真读的那条链，不是把 `_resolve_all` 替掉。
    """
    from app.services import email as email_service

    _Ses.requests = []
    _Ses.script = _SES_OK
    for name, value in (("EMAIL_SES_SECRET_ID", _SES_ID),
                        ("EMAIL_SES_SECRET_KEY", _SES_KEY),
                        ("EMAIL_SES_FROM_ADDRESS", _SES_FROM),
                        ("EMAIL_SES_TEMPLATE_ID", _SES_TPL)):
        monkeypatch.setattr(email_service.settings, name, value)
    monkeypatch.setattr(email_service.httpx, "AsyncClient", _Ses)
    return lambda: _Ses.requests[-1] if _Ses.requests else None


def _send_direct(addr, code):
    from app.services import email as email_service

    return asyncio.run(email_service.send_code(addr, code))


class Test不该出网的那几档:
    def test_少任何一栏都不出网(self, db, ses, monkeypatch, caplog):
        from app.services import email as email_service

        for name in ("EMAIL_SES_SECRET_ID", "EMAIL_SES_SECRET_KEY",
                     "EMAIL_SES_FROM_ADDRESS", "EMAIL_SES_TEMPLATE_ID"):
            _Ses.requests = []
            monkeypatch.setattr(email_service.settings, name, "")
            with caplog.at_level("INFO", logger="app.services.email"):
                assert _send_direct(ADDR, "123456") is True, f"{name} 空掉时兜底档仍要回 True"
            assert _Ses.requests == [], f"{name} 空着却出了网"
            assert any("EMAIL_SES" in r.message for r in caplog.records), \
                "走日志兜底时必须留下那一句，否则现网只看到'发了'却查是哪一档"

    def test_模板ID填成名字时不出网并判失败(self, db, ses, monkeypatch, caplog):
        """后台密钥页那一格最容易粘成模板名（`tmbj_email_bind_code`）。转 int 打出去只会回一句
        看不懂的 `InvalidTemplateID`，所以这一档在出网之前就拦掉，并回 False＝不落冷却。"""
        from app.services import email as email_service

        monkeypatch.setattr(email_service.settings, "EMAIL_SES_TEMPLATE_ID",
                            "tmbj_email_bind_code")
        with caplog.at_level("ERROR", logger="app.services.email"):
            assert _send_direct(ADDR, "123456") is False
        assert ses() is None, "非数字模板 ID 却出了网"
        assert "EMAIL_SES_TEMPLATE_ID 要的是纯数字模板 ID" in caplog.text, \
            "拦下来了却没说是哪一栏填错＝现网日志只剩一句裸 ValueError"

    def test_发信失败不落冷却(self, client, db, mailbox, ses, monkeypatch):
        """邮件没出去却落下 60 秒冷却＝用户明明什么都没收到，再点一次还念"请稍后再试"。"""
        from app.services import email as email_service

        _Ses.script = (200, {"Response": {"Error": {
            "Code": "FailedOperation.InvalidTemplateID", "Message": "操作失败。 模板ID无效或者不可用。"}}})
        user, _account = _wechat_person(db)
        headers = _bearer(_user_token(user))
        assert client.post(SEND, json={"email": ADDR}, headers=headers).status_code == 200
        assert _Ses.requests != [], "四栏配齐时这一扇门该真走到出网那一步"
        assert _code_key(ADDR) in mailbox, "发信失败也不该把码丢掉（码是日志兜底档的凭证）"
        assert _cool_key(ADDR) not in mailbox, "发信失败却罚用户等 60 秒"


class Test出网那一发的形状:
    def test_发信地址那栏叫FromEmailAddress(self, db, ses):
        """文档正文里那栏写的是 `Sender`，真接口点名的却是另一个：`MissingParameter
        FromEmailAddress`。这一句钉的是实测过的那一个。"""
        assert _send_direct(ADDR, "246813") is True
        body = ses()["body"]
        assert body["FromEmailAddress"] == _SES_FROM
        assert "Sender" not in body, "回退到文档里那个名字＝每一发都 MissingParameter"

    def test_收件人必须是Destination数组(self, db, ses):
        assert _send_direct(ADDR, "135790") is True
        assert ses()["body"]["Destination"] == [ADDR]

    def test_正文只有Template这一支且TemplateData是字符串(self, db, ses):
        """`Body`／`Content`／`HtmlContent`／`TextContent`／`HtmlBody`／`EmailContent`／`Simple`
        全部回 `UnknownParameter`；`TemplateData` 要的是**一个 JSON 字符串**，塞对象会被拒。"""
        assert _send_direct(ADDR, "864213") is True
        body = ses()["body"]
        for dead in ("Body", "Content", "HtmlContent", "TextContent", "HtmlBody",
                     "EmailContent", "Simple"):
            assert dead not in body, f"{dead} 这一支实测回 UnknownParameter"
        tpl = body["Template"]
        assert tpl["TemplateID"] == int(_SES_TPL)
        assert isinstance(tpl["TemplateData"], str), "TemplateData 塞对象＝这一发必被拒"
        data = json.loads(tpl["TemplateData"])
        assert data["code"] == "864213"
        from app.services import email as email_service

        assert data["minutes"] == str(email_service.settings.EMAIL_CODE_TTL_MINUTES), \
            "正文里那句'几分钟后失效'必须与 Redis 那枚 TTL 同一份来源"
        assert body["Subject"], "Subject 是顶层必填，模板只管正文"

    def test_签名头的日期必须与时间戳同一天(self, db, ses):
        """TC3 的 scope 用 UTC 日期、`X-TC-Timestamp` 用秒；两者错开腾讯云直接回 400
        `InvalidRequest`（`sms.py` 那条注释记的就是这个）。这里不重算签名，只钉这条不变量。"""
        assert _send_direct(ADDR, "112233") is True
        headers = ses()["headers"]
        assert headers["X-TC-Action"] == "SendEmail"
        assert headers["X-TC-Version"] == "2020-10-02"
        assert headers["X-TC-Region"] == "ap-hongkong"
        auth = headers["Authorization"]
        assert auth.startswith("TC3-HMAC-SHA256 Credential=%s/" % _SES_ID)
        date, service, tail = auth.split("Credential=")[1].split(",")[0].split("/")[1:4]
        assert (service, tail) == ("ses", "tc3_request")
        stamped = datetime.fromtimestamp(int(headers["X-TC-Timestamp"]), timezone.utc)
        assert date == stamped.strftime("%Y-%m-%d"), "scope 的日期与时间戳不同天＝腾讯云回 InvalidRequest"
        signed = auth.split("SignedHeaders=")[1].split(",")[0]
        for name in signed.split(";"):
            assert name in {h.lower() for h in headers}, f"{name} 签进了头却没真发出去"

    def test_http200里的业务错误算失败(self, db, ses):
        """SES 的错放在 `Response.Error` 而 http 仍回 200（实测那一发就是这样）：
        只看状态码会把"没发出去"记成"发成功了"。"""
        _Ses.script = (200, {"Response": {"Error": {
            "Code": "FailedOperation.InvalidTemplateID", "Message": "模板ID无效或者不可用。"}}})
        assert _send_direct(ADDR, "556677") is False

    def test_HTTP层错误也算失败(self, db, ses):
        _Ses.script = (403, {"Response": {"Error": {"Code": "FailedAuth", "Message": "nope"}}})
        assert _send_direct(ADDR, "556677") is False
