from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import ValidationError, model_validator

# backend/ 目录（服务器上就是 /home/ubuntu/wtsj-backend，本地是 repo 里的 backend/）。
# 用 __file__ 反推而不是取当前工作目录，见下面 model_config 处的注释。
PROJECT_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./tmbj.db"
    # 提炼走云函数中转混元：只有云函数内部的 cloud.ai() 才抵扣成长计划的免费额度，
    # 本服务直连混元端点会导致额度不抵扣、改扣套餐，所以这里只有云函数的触发信息。
    EXTRACT_PROVIDER: str = "hunyuan_cf"
    HUNYUAN_CF_URL: str = ""
    # 必须是**长期有效的 API Key**，不是 access_token：后者默认 2 小时过期需 refresh，
    # 而提炼跑在 RQ worker 里，过期只会变成静默全线降级。两者填法相同（Bearer 槽）。
    HUNYUAN_CF_KEY: str = ""
    # 客户端等待上限必须**大于**云函数自己的执行超时（现网 extract 已设为 60 秒），
    # 否则函数还会跑完、我们先放弃，看起来像失败。5.4 秒那个墙是微信
    # /tcb/invokecloudfunction 的调用方限制，走网关不受它约束，但仍要实测一次。
    HUNYUAN_CF_TIMEOUT: float = 90.0
    WECHAT_APP_ID: str = ""
    WECHAT_APP_SECRET: str = ""
    # 内容安全（msgSecCheck）总开关。生产必须为 true；测试环境关掉是为了**根本不出网**
    # （conftest 里那条不变量），而不是为了让用例好写——部署自检会拿一段已知违规的
    # 文本打一次，断言必须被拦下来，所以这里不存在"关了也没人发现"的静默失效。
    SEC_CHECK_ENABLED: bool = True
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
    # extra 不写则默认 forbid，多出来的字段会抛 ValidationError 并把字段值印进报错文本。
    # hide_input_in_errors 清的是 str(exc)；实测 ValidationError.errors() 里仍带 DATABASE_URL
    # 等字段的原值，所以值不能靠这里出去——见 _load_settings()。
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        extra="ignore",
        hide_input_in_errors=True,
    )


def _load_settings() -> "Settings":
    """配置装载失败时只转成不含字段值的摘要，再让服务照常拒绝启动。

    不让 ValidationError 往外逃：它的 str() 会被 pydantic 截断，但 errors() 里每个字段的
    原值是完整的（实测含 DATABASE_URL 整串）。摘要只取 loc 与 msg；raise 故意写在 except
    外面——写在里面时原异常挂在 `__context__` 上，traceback 会连带打出它的 input_value
    （实测：首尾两个字段的值是完整的，中间才被截断）。
    """
    summary = ""
    try:
        return Settings()
    except ValidationError as e:
        summary = "；".join(
            f"{'.'.join(str(p) for p in err['loc']) or '(整体)'}: {err['msg']}"
            for err in e.errors()
        )
    raise RuntimeError(f"配置校验未通过，服务拒绝启动 → {summary}")


settings = _load_settings()
