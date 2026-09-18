from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./wtsj.db"
    DEEPSEEK_API_KEY: str = ""
    TENCENT_OCR_SECRET_ID: str = ""
    TENCENT_OCR_SECRET_KEY: str = ""
    TENCENT_ASR_SECRET_ID: str = ""
    TENCENT_ASR_SECRET_KEY: str = ""
    COS_SECRET_ID: str = ""
    COS_SECRET_KEY: str = ""
    COS_REGION: str = ""
    COS_BUCKET: str = ""
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    CORS_ORIGINS: str = "*"
    JWT_SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    class Config:
        env_file = ".env"

settings = Settings()
