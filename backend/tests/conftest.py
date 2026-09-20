"""在任何测试模块碰到 app.* 之前，把配置钉成"一次性、无凭据、无外部依赖"。

为什么必须有这个文件：`app.core.config.settings` 是模块级单例，**谁先 import 就按谁当时
看到的 env 定型**，之后再改 `os.environ` 已经无效。测试文件的收集顺序按字母序，所以新增一个
名字靠前的文件就会把整套的数据库地址带到那时才定下来——本轮实际踩过（整套安静地去连本地
Postgres，报 22 个 connection error）。而 `test_note_flows.py` 的建表夹具里有 `drop_all()`，
地址一旦被环境的值污染，最坏是在真库上删表。这里用**赋值**而不是 `setdefault`，环境里残留的
业务库地址一律不算数。
"""
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

TEST_DB = "sqlite:////tmp/tumaibiji_pytest.db"
TEST_JWT = "pytest-only-secret-not-a-real-one"
# 默认 provider=none：提炼分支直接抛错走降级，**整套测试不会发出任何出网请求**。
# 需要测 hunyuan_cf 分支的用例各自 monkeypatch settings，不共用这里的全局值。
PLACEHOLDER_CF_KEY = "your-cloud-function-key"
FAKE_CF_URL = "https://pytest.invalid/functions/extract"
TEST_EXTRACT_PROVIDER = "none"
FAKE_WECHAT_APP_ID = "pytest-fake-appid"
FAKE_WECHAT_APP_SECRET = "pytest-fake-appsecret"

os.environ["DATABASE_URL"] = TEST_DB
os.environ["JWT_SECRET_KEY"] = TEST_JWT
os.environ["EXTRACT_PROVIDER"] = "none"
os.environ["HUNYUAN_CF_URL"] = FAKE_CF_URL
os.environ["HUNYUAN_CF_KEY"] = PLACEHOLDER_CF_KEY
os.environ["WECHAT_APP_ID"] = FAKE_WECHAT_APP_ID
os.environ["WECHAT_APP_SECRET"] = FAKE_WECHAT_APP_SECRET

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
