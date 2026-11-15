"""短信验证码比对（`services/sms.py:verify_code`）钉在现网 Redis 的真实能力上。

为什么这一份文件值得单独存在：11-15 邮箱那条（`services/email.py`）撞过一次同样的事故——
现网 Redis **服务端**是 6.0.16，`GETDEL` 是 6.2 才有的命令，而代码里那句
`hasattr(conn, "getdel")` 判的是**客户端库**（服务器上的 redis-py 一直有这个方法）。
分支因此永远走"用 GETDEL"那一支，服务端回 `unknown command`，异常被 `except` 吞成 False
⇒ **码发得出去、用户填对照样念"验证码错"**。邮箱那一处已修并随第八十五次上了现网；
这一处是同一个形状，今天还没被触发（`.env` 里没有 `SMS_*` 五栏 ⇒ 走"验证码写日志"那一档，
只有从日志里抄码真登一次才会撞上），修法一致：取与删放进同一次 MULTI。

⚠ 下面那只假 Redis 故意**提供 `getdel`、一调就抛** `ResponseError`。
如果把 `getdel` 从假件里删掉，量到的还是"客户端有没有这个方法"——那正是这个错判
能活过整份用例的原因（假件没方法 ⇒ 走 pipeline ⇒ 绿；服务器有方法没命令 ⇒ 红）。
"""
import os
import sys

import pytest
from redis.exceptions import ResponseError

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import sms as sms_service  # noqa: E402

PHONE = "13800138000"
CODE = "123456"


class _FakePipeline:
    """排队语义照 redis-py：入队只回 `QUEUED`，`execute()` 才按顺序真跑并回结果列表。"""

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


class _Redis60:
    """只实现 `services/sms.py` 真用到的那几条命令，形状照 redis-py 默认（`decode_responses`
    关着 ⇒ `get` 回 **bytes**；回 str 会让比对里那句 `.decode()` 变成没量过的死路）。

    `getdel` 在，但一调就抛——这就是现网那台 6.0.16 的行为。
    """

    def __init__(self):
        self.kv: dict[str, tuple[str, int]] = {}
        self.getdel_calls = 0
        self.pipeline_calls = 0

    def getdel(self, key):
        self.getdel_calls += 1
        raise ResponseError("unknown command `GETDEL`, with args beginning with: ")

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
        self.pipeline_calls += 1
        assert transaction, "取与删必须在同一次事务里，否则并发能读到同一枚码各自判对"
        return _FakePipeline(self)


@pytest.fixture
def conn(monkeypatch):
    c = _Redis60()
    monkeypatch.setattr(sms_service, "get_redis_conn", lambda: c)
    return c


class Test比对:
    def test_现网那台Redis没有GETDEL_正码也验得过(self, conn):
        sms_service.store_code(PHONE, CODE)
        assert sms_service.verify_code(PHONE, CODE) is True, "正码被吞成 False＝短信登录永远进不去"
        assert conn.getdel_calls == 0, "还在打 GETDEL＝6.0 上每一次比对都先撞一记异常"

    def test_取走之后同一枚不许再用(self, conn):
        sms_service.store_code(PHONE, CODE)
        assert sms_service.verify_code(PHONE, CODE) is True
        assert sms_service.verify_code(PHONE, CODE) is False, "留着同一枚码＝6 位数字给到 10⁶ 次机会"

    def test_猜错也销毁(self, conn):
        sms_service.store_code(PHONE, CODE)
        assert sms_service.verify_code(PHONE, "000000") is False
        assert conn.kv == {}, "错码不许把键留下——那等于允许多次试"

    def test_走的是事务不是两条独立命令(self, conn):
        sms_service.store_code(PHONE, CODE)
        sms_service.verify_code(PHONE, CODE)
        assert conn.pipeline_calls == 1, "两条各发各的＝取与删之间能被并发插进来"
        assert conn.getdel_calls == 0

    def test_格式不对一趟Redis都不许打(self, monkeypatch):
        """先验格式再碰 Redis：反过来（先取走再判格式）会让任何一串乱码吃掉别人的验证码。"""
        calls = []

        def _boom():
            calls.append(1)
            raise AssertionError("不该打 Redis")

        monkeypatch.setattr(sms_service, "get_redis_conn", _boom)
        assert sms_service.verify_code("1380013800", CODE) is False   # 少一位
        assert sms_service.verify_code(PHONE, "12ab56") is False      # 非数字
        assert sms_service.verify_code(PHONE, "1234567") is False     # 超长
        assert calls == []

    def test_Redis挂了回False不抛(self, monkeypatch):
        """站长 10-09 拍的那条「登录口不许因为旁路挂掉」：比对这一发宁可念"验证码错"，
        也不许把 500 甩到用户脸上。"""
        def _down():
            raise ConnectionError("Redis 连不上")

        monkeypatch.setattr(sms_service, "get_redis_conn", _down)
        assert sms_service.verify_code(PHONE, CODE) is False
