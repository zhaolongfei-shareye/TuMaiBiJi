"""app.* 的日志到底有没有出口。

坑是这一轮现网撞出来的：给"小程序码回源微信"写了一行 INFO，本意是把"有没有烧配额"
变成可查的事实，结果部署后连打 9 次码，journald 里一条都没有——而同一个文件的 ERROR
查得到。原因：uvicorn 只配它自己那四个 logger，root 上没有 handler，app.* 的记录最后
由 logging.lastResort 兜底，而那个 handler 的级别是 WARNING。也就是说 INFO 全被丢了。

这套断言刻意不去读 pytest 捕获到的 stdout/stderr：pytest 自己的日志插件会插到 root 上，
"这行有没有出现在 capfd 里"测的是 pytest 的行为，不是生产的。生产要的是两件事，
就分开各测一件——级别放行、handler 写的是 fd 2（systemd 就是把 stderr 收进 journald 的）。
"""
import logging
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_log.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.main  # noqa: F401  ← 装配就发生在这个 import 里


def test_APP下的INFO级别是放行的():
    """生产里查不到那行回源日志，就是因为级别卡在这里。"""
    assert logging.getLogger("app.services.wechat").isEnabledFor(logging.INFO), (
        "app.* 的 INFO 被丢了：生产上写的每一行 info 都是空操作"
    )


def test_handler是走输出流而不是往文件里写():
    """装配的是 StreamHandler（默认 sys.stderr），systemd 把 stderr 收进 journald。

    这里不断言"流就是 fd 2"：pytest 在收集阶段就把 sys.stderr 换成了它的捕获对象，
    那条只能在现网验——部署完连打几次小程序码，journalctl 里数得到"小程序码回源微信"
    这一行才算数（probes/share_live_probe.py 的 ④ 就是干这个的）。
    """
    kinds = [type(h).__name__ for h in logging.getLogger("app").handlers]
    assert any(isinstance(h, logging.StreamHandler) for h in logging.getLogger("app").handlers), \
        f"app 上没有走输出流的 handler，现有的是 {kinds}"


def test_记录真的会经过那个handler():
    """级别放行 + 挂在 stderr 之外，还要证明一条 info 确实投递到了 handler 手上。"""
    log = logging.getLogger("app.services.probe_test")
    probe = logging.Handler()
    seen = []
    probe.emit = lambda record: seen.append(record.getMessage())
    log.addHandler(probe)
    try:
        log.info("图麦笔记探针一行")
    finally:
        log.removeHandler(probe)
    assert seen == ["图麦笔记探针一行"]


def test_重复导入不会堆第二份handler():
    """uvicorn --reload 和测试里多次 import 都会重跑模块顶层，handler 翻倍日志就翻倍。"""
    import importlib

    before = len(logging.getLogger("app").handlers)
    importlib.reload(app.main)
    assert len(logging.getLogger("app").handlers) == before
