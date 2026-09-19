"""配置装载回归测试：.env 的查找路径与多余字段的外泄面。

起因（2026-09-19 部署 AppSecret 修复时踩到）：在服务器 /home/ubuntu 目录下跑一个
`import app.core.config` 的脚本，它读到了同机另一个项目的 .env；而 extra=forbid 的
校验错误又把那些字段的原值打印了出来。这里把两件事各自钉一条测试。

    cd backend && .venv/bin/python -m pytest tests/test_config_env_file.py -v
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tumaibiji_pytest.db")
os.environ.setdefault("JWT_SECRET_KEY", "pytest-only-secret-not-a-real-one")
# 必须在 import app.core.config 之前设好：本文件按字母序最先被收集，谁先 import
# 谁的 env 就定型了（settings 是模块级单例）。
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from pydantic import ValidationError

from app.core.config import PROJECT_ROOT, Settings

DECOY_CORS = "DECOY-cors-8K2P"
DECOY_DB = "sqlite:////tmp/DECOY-9M4Q.db"
# 故意造一个"看起来像别人密钥"的值：一旦 extra 退回 forbid，它会被印进报错文本
LEAK_SENTINEL = "DECOY-leak-sentinel-3T7X"


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
