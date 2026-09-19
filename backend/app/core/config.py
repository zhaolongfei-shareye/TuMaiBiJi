from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

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

    # extra 默认为 forbid：.env 里残留已删除的字段（如 TENCENT_ASR_*、COS_*、TENCENT_OCR_*）会让服务启动即崩溃
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
