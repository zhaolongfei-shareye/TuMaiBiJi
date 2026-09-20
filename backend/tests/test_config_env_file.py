"""配置装载回归测试：`.env` 的查找路径，以及配置校验失败的外泄面。

起因（2026-09-19 部署 AppSecret 修复时踩到）：在服务器 /home/ubuntu 下跑一个
`import app.core.config` 的脚本，它读到了同机另一个项目的 `.env`；而 `extra` 默认 forbid
的校验错误又把这些字段的原值打印了出来。这里钉的是四件事：路径钉死、多余字段忽略、
校验失败不回显任何值、测试进程手里不能出现真凭据。

    cd backend && .venv/bin/python -m pytest tests/test_config_env_file.py -v

env 由 `conftest.py` 在本文件之前钉好，这里不再重复设。
"""
import os
import subprocess
import sys
from pathlib import Path

import conftest
import pytest
from pydantic import ValidationError

from app.core.config import PROJECT_ROOT, Settings, _load_settings, settings

DECOY_CORS = "DECOY-cors-8K2P"
DECOY_DB = "sqlite:////tmp/DECOY-9M4Q.db"
# 假密钥：一旦有哪个通道把字段原值带出去，这里就能抓到
LEAK_SENTINEL = "DECOY-leak-sentinel-3T7X"
SENTINEL_APP_SECRET = "SENTINEL-appsecret-4c9a"
SENTINEL_DB_PASSWORD = "SENTINEL-dbpass-8h2k"
JWT_PLACEHOLDER = "change-me-in-production-use-a-long-random-string"


def _decoy_env(tmp_path: Path) -> Path:
    env = tmp_path / ".env"
    env.write_text(
        f"CORS_ORIGINS={DECOY_CORS}\n"
        f"DATABASE_URL={DECOY_DB}\n"
        "JWT_SECRET_KEY=decoy-jwt-not-a-real-one\n"
        f"OTHER_PROJECT_SIGNING_SECRET={LEAK_SENTINEL}\n",
        encoding="utf-8",
    )
    return env


def test_env_file_is_pinned_absolute_and_extra_is_ignore():
    env_file = Settings.model_config["env_file"]
    assert Path(env_file).is_absolute(), "env_file 写成相对路径时它按当前工作目录解析"
    assert Path(env_file) == PROJECT_ROOT / ".env"
    # PROJECT_ROOT 必须真的是 backend/，否则钉死的路径指向别处
    assert (PROJECT_ROOT / "app" / "main.py").exists()
    assert Settings.model_config.get("extra") == "ignore"
    assert Settings.model_config.get("hide_input_in_errors") is True


def test_stray_keys_do_not_raise_and_never_echo_their_values(tmp_path, monkeypatch):
    env = _decoy_env(tmp_path)
    for key in ("CORS_ORIGINS", "DATABASE_URL"):
        monkeypatch.delenv(key, raising=False)
    try:
        loaded = Settings(_env_file=env)
    except ValidationError as e:
        pytest.fail(f"未知字段让配置加载失败了。若报错文本含字段值即密钥外泄：{LEAK_SENTINEL in str(e)}")
    # 这条同时证明"测试真的在读 dotenv"，否则下面的用例会因为没读而假绿
    assert loaded.CORS_ORIGINS == DECOY_CORS


def test_current_directory_env_file_is_ignored(tmp_path, monkeypatch):
    _decoy_env(tmp_path)
    monkeypatch.chdir(tmp_path)
    for key in ("CORS_ORIGINS", "DATABASE_URL"):
        monkeypatch.delenv(key, raising=False)
    loaded = Settings()
    assert loaded.CORS_ORIGINS != DECOY_CORS
    assert loaded.DATABASE_URL != DECOY_DB


def test_config_failure_message_carries_no_values_and_no_exception_link(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", JWT_PLACEHOLDER)
    monkeypatch.setenv("WECHAT_APP_SECRET", SENTINEL_APP_SECRET)
    monkeypatch.setenv("DATABASE_URL", f"postgresql://postgres:{SENTINEL_DB_PASSWORD}@db.internal:5432/wtsj")
    with pytest.raises(RuntimeError) as excinfo:
        _load_settings()
    message = str(excinfo.value)
    assert "JWT_SECRET_KEY" in message, "摘要里还得说清是哪个字段错的"
    assert SENTINEL_APP_SECRET not in message
    assert SENTINEL_DB_PASSWORD not in message
    # pydantic 的 str() 会截断中间，但 errors() 里字段原值是完整的：异常对象本身不能留在链上
    assert excinfo.value.__cause__ is None
    assert excinfo.value.__context__ is None


def test_startup_refuses_bad_config_without_printing_values(tmp_path):
    """子进程走真实通道：CPython 自己打印 traceback，那才是终端和 journal 会留下的东西。"""
    child_env = {k: v for k, v in os.environ.items() if not k.startswith(
        ("DATABASE_", "WECHAT_", "JWT_", "HUNYUAN_", "EXTRACT_", "REDIS_", "CORS_"))}
    child_env.update({
        "DATABASE_URL": f"postgresql://postgres:{SENTINEL_DB_PASSWORD}@db.internal:5432/wtsj",
        "WECHAT_APP_SECRET": SENTINEL_APP_SECRET,
        "JWT_SECRET_KEY": JWT_PLACEHOLDER,
        "PYTHONPATH": str(PROJECT_ROOT),
    })
    # cwd 故意不是项目目录：本轮事故就是跑错目录引起的
    result = subprocess.run([sys.executable, "-c", "import app.core.config"],
                            cwd=str(tmp_path), env=child_env,
                            capture_output=True, text=True)
    assert "ModuleNotFoundError" not in result.stderr, "子进程没找到包，这条测试就成了空跑"
    assert result.returncode != 0, "配置坏了必须拒绝启动"
    stderr = result.stderr
    assert "配置校验未通过" in stderr
    assert "ValidationError" not in stderr, "原始 pydantic 校验异常不应逃到调用方"
    assert SENTINEL_DB_PASSWORD not in stderr
    assert SENTINEL_APP_SECRET not in stderr


def test_this_process_holds_only_disposable_config_values():
    """`test_note_flows` 的夹具会 drop_all()，地址一旦被环境里的业务库污染就是在真库上删表。"""
    assert settings.DATABASE_URL == conftest.TEST_DB
    assert settings.JWT_SECRET_KEY == conftest.TEST_JWT
    assert settings.EXTRACT_PROVIDER == conftest.TEST_EXTRACT_PROVIDER
    assert settings.HUNYUAN_CF_KEY == conftest.PLACEHOLDER_CF_KEY
    assert settings.WECHAT_APP_SECRET == conftest.FAKE_WECHAT_APP_SECRET
    assert settings.WECHAT_APP_ID == conftest.FAKE_WECHAT_APP_ID
