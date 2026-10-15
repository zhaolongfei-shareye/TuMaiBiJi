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
    # Sign in with Apple 那张 `identityToken` 里 `aud` 应当等于的值。10-10 拍**甲**：它是我们
    # App 的 **bundle id**（`com.agentsbin.TumarkNote`），**不是** Services ID——Apple 的原话是
    # "A Services ID identifies your **website**"、"You must use a unique identifier — a Services ID —
    # to register each **web service** that supports Sign in with Apple"，而 App 那一侧是
    # "Enable the Sign in with Apple capability for an app in Xcode, or by editing an **App ID**"。
    # 本仓现读：`ios/TumarkNote.xcodeproj/project.pbxproj` 里主 target 的
    # `PRODUCT_BUNDLE_IDENTIFIER = com.agentsbin.TumarkNote`；`ios/Signing/TumarkNote.entitlements`
    # 里**还没有** `com.apple.developer.applesignin`，`ios/Sources` 里也一个 `ASAuthorization` 都没有
    # ——所以真票要等 #162 那颗按钮做出来才打得到这一判。
    # 它是 Apple 签进 `identityToken` 的 `aud`，也是服务端唯一能拿来判"这张 token 是不是给我们
    # 家签的"的值——所以它**不是密钥**（Apple 明确说这是公开标识），但也不能猜：
    # 猜错或留空时 `/v1/auth/apple` 一律 503，绝不退化成"不验 aud 放行"。
    # 现网 .env 里必须有这一行。填错值不报 503 而是每次登录 401，所以 `apple_identity._verified_aud`
    # 会把**观察到的**那一个写进日志：填完之后第一次真机登录要么通、要么日志里直接给出答案。
    APPLE_CLIENT_ID: str = ""
    # 内容安全（msgSecCheck）总开关。生产必须为 true；测试环境关掉是为了**根本不出网**
    # （conftest 里那条不变量），而不是为了让用例好写——部署自检会拿一段已知违规的
    # 文本打一次，断言必须被拦下来，所以这里不存在"关了也没人发现"的静默失效。
    SEC_CHECK_ENABLED: bool = True
    # 分享卡片上那张小程序码指向哪个版本。微信的默认值是 release，而"page 必须存在于该版本"
    # 这条只在正式版里成立——所以在过审之前，那张码扫开必然是打不开的。填 trial 可以让
    # 它指向体验版（只有体验成员扫得动），**发布前必须改回 release**，否则真实用户扫到的
    # 是体验版链接。deploy.sh 每次都会把这个值打出来，就是为了别让它悄悄留在 trial。
    SHARE_QR_ENV_VERSION: str = "release"
    REDIS_URL: str = "redis://localhost:6379"
    CORS_ORIGINS: str = "*"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    # 私密笔记的解锁凭证活多久（app/core/private_access.py）。故意比登录 token 短得多：
    # 登录 token 管"是不是这台设备的账号"，这条只管"接下来这几分钟里可以看私密内容"。
    # 15 分钟够翻完十几篇再重新验一次；再长就变成"解锁一次、整天敞着"，
    # 而这一闸防的恰恰是手机在别人手里那一会儿。
    PRIVATE_UNLOCK_MINUTES: int = 15

    # ---- 运营图（方案 docs/方案-cn后台资产管理.md P0-a）----
    # 后台上传的那几张落在服务器磁盘上（站长 10-11 拍的 D 甲），不进微信云开发桶：
    # 桶的公网域名不在小程序 downloadFile 白名单里，加白名单本身要跟一次发版，
    # 而"不发版换图"就是这条链存在的唯一理由（锚点 A3）。默认按 backend/ 反推，
    # 和 .env 一样用 __file__ 而不是当前工作目录——服务器上就是 /home/ubuntu/wtsj-backend/var/mp-assets。
    MP_ASSETS_DIR: str = str(PROJECT_ROOT / "var" / "mp-assets")
    # 提审期冻结闸（锚点 A6）：打开后 `/api/mp/config` 一律回"无下发"，客户端自然落回包里那张。
    # 与模板那条的 `POSTER_TEMPLATES=1` 同型——审核时首页与上线后不一致是合规风险，只能用闸门堵。
    # 默认关（= 正常下发）：这一版客户端还没有读那个口的代码，开不开都不改现网行为。
    MP_ASSETS_FREEZE: bool = False
    # 管理页那一把独立的钥匙（锚点 A7）：不进 users 表、不加 is_admin 列、不复用小程序 JWT。
    # **留空时不拒启动**，只让 `/api/admin/*` 一律 503——这一条和 APPLE_CLIENT_ID 同一个理由：
    # 现网 .env 里今天还没有这一行，把它做成 `JWT_SECRET_KEY` 那种硬失败等于让下一次部署起不来。
    # 但绝不退化成"没配就当没设过密码"：`core/admin_access.py` 里空值开不了任何门。
    ADMIN_TOKEN: str = ""
    # 后台登录态活多久。故意短：这一把钥匙能换全站首页那张图，而它存在的地方是浏览器 sessionStorage。
    # 过期只是要重新输一次，对一个人一天点不了几次的后台没有成本。
    ADMIN_SESSION_MINUTES: int = 60
    # 融合后台的换票暗号（10-15 站长拍「以我们登录为主」）：图麦克那个服务拿管理员票来我们这边
    # 验真时，要在 `X-Exchange` 头里带上这一行。**留空 = 那个验真口一律 503**，理由与 ADMIN_TOKEN
    # 同型（没配就得是"这个功能不可用"，不能是"门槛消失"）；两边不共享 JWT_SECRET_KEY，
    # 票的可信由这一台当场判——所以轮换这一行只影响"能不能换票"，不影响任何已发出去的登录态。
    ADMIN_EXCHANGE_SECRET: str = ""

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
