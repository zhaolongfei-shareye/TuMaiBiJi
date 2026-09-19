from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

# backend/ 目录（服务器上就是 /home/ubuntu/wtsj-backend，本地是 repo 里的 backend/）。
# 用 __file__ 反推而不是取当前工作目录，见下面 model_config 处的注释。
PROJECT_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./tmbj.db"
    DEEPSEEK_API_KEY: str = ""
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    CORS_ORIGINS: str = "*"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    @model_validator(mode="after")
    def _require_jwt_secret(self) -> "Settings":
        placeholder = "change-me-in-production-use-a-long-random-string"
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == placeholder:
            raise ValueError(
                "JWT_SECRET_KEY 未配置或仍为公开占位符，请在 .env 中设置一个长随机字符串后重启服务"
            )
        return self

    # env_file 必须是绝对路径。写成 ".env" 时它按**当前工作目录**解析：从 /home/ubuntu
    # 下跑任何 import app.core.config 的脚本，就会去读同机另一个项目的 .env（2026-09-19 实测踩到）。
    # extra 不写则默认 forbid，多出来的字段会抛 ValidationError，而它的报错文本会把字段值
    # 原样打出来（input_value=<密钥>）——等于把别人的密钥读进来再印出去。
    # 两个都堵：路径钉死在本项目根目录，字段忽略不报错。
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

settings = Settings()
