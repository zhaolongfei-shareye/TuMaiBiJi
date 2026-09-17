from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./wtsj.db"
    DEEPSEEK_API_KEY: str = ""
    TENCENT_OCR_SECRET_ID: str = ""
    TENCENT_OCR_SECRET_KEY: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()
