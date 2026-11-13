from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import ValidationError, model_validator

# backend/ 目录（服务器上就是 /home/ubuntu/wtsj-backend，本地是 repo 里的 backend/）。
# 用 __file__ 反推而不是取当前工作目录，见下面 model_config 处的注释。
PROJECT_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    # 故意**不给可用的默认值**：理由与那条 `@model_validator` 一起看（`_require_database_url`）。
    DATABASE_URL: str = ""
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
    # 站名识别那一发走的**是另一条云函数**（`cloudfunctions/site_name`），地址单独一栏：
    # 它与提炼共用同一个云开发环境、同一把触发凭据（`HUNYUAN_CF_KEY`），但函数不同、契约不同。
    # 默认空＝这一级整段跳过（`llm.site_channel_ready`），因为那条函数还没部署——部署要站长一句口令。
    SITE_NAME_CF_URL: str = ""
    # 故意比提炼那枚短得多（90 秒 → 15 秒）：这一枚值失败了只损失一个名字，屏上退到通用那档，
    # 不值得让 worker 陪它等一分多钟。函数自己的执行超时必须比这一枚小，否则我们先放弃它还在跑。
    SITE_NAME_CF_TIMEOUT: float = 15.0
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
    # ---- 每人每天的花费上限（10-25 第八轮审计 M33；计数落在 `models/daily_usage.py`）----
    # 分钟闸只挡"一时打满"，挡不住"一天里陆陆续续打满"：一次提炼内部最多打四趟上游
    # （`services/llm.py:MAX_RETRIES`），分钟闸 × 重试＝一个人一分钟最多 40 发花钱调用。
    # 档位是站长 10-25 拍的：提炼 50 条/天、内容检查 200 次/天。数值放这里而不是代码常量里，
    # 因为"抬一档"是运营决定，不该等于一次改代码＋一次部署；判据（`tests/test_日量闸.py`）
    # 读的是这两栏，改档位不会让用例假绿。
    EXTRACT_DAILY_LIMIT: int = 50
    SEC_CHECK_DAILY_LIMIT: int = 200
    # `/v1/extract`（iPhone 那一发"只回提炼结果、不在服务端建笔记"的口）的**全站**日闸。
    # 为什么那一档 50 挡不住这一口：`EXTRACT_DAILY_LIMIT` 记在"人"身上，而 iPhone 这一路
    # 没有账号（现读：`ios/Sources` 全仓 0 处 `AuthenticationServices`，隐私那一屏明写
    # 「这个应用没有账号」），能拿来记账的最多是一枚**设备自己生成的随机串**——那种串
    # 每换一枚就多 50 条，所以**按设备记的只是公平，不是钱的上限**。钱的上限只能由这一栏
    # 给：全站一天打满多少条，是一个能在控制台核对的数，不是一个"大概不会超"的乐观值。
    # 档位推的哪一档写在 `services/daily_budget.py` 顶部那段（口径是"满输入一次约 1.2 万
    # token"，那是**下界推算不是实付**——CloudBase 的 token→资源点折算系数官方不公开）。
    EXTRACT_GLOBAL_DAILY_LIMIT: int = 200
    # `/v1/extract` 那一步的墙钟上限（秒）。为什么这一口要自己掐一道而 `/api/ingest/*` 不掐：
    # 那三路是 worker 里跑的，没有人在屏前等；这一路是用户在新建那一屏按下右滑条之后**等的那几秒**，
    # 上游的 `HUNYUAN_CF_TIMEOUT` 是 90 秒、外面还套 `MAX_RETRIES=3`，最坏一分多钟，
    # 那已经不是"提炼中"而是"看起来坏了"。到点按降级那一档回（摘要留空），与
    # `llm.py:_degraded` 同一个形状，不另造一种"超时态"。
    # ⚠ iPhone 那一端的请求超时必须比这一枚大（同 `DEEPSEEK_TIMEOUT` 上面那两条的理由：
    # 服务器还在等、手机先断了，看起来像我们的错）。
    EXTRACT_DEADLINE_SECONDS: float = 45.0
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

    # ---- RoamMark 那一路的景点初稿转发（方案 docs/方案-roammark-AI转发.md）----
    # 这一组的钥**正常不在这里配**：站长 10-24 拍的是"后台那一栏我自己填"，所以它的正身是
    # `service_secrets` 表里那行 `DEEPSEEK`；下面这一栏只是"库里那一行删掉之后回到哪一层"的那一层，
    # 现网 `.env` 里今天**没有**这一行（有的那行叫 `DEEPSEEK_API_KEY`、是个占位符，这一路不吃它，
    # 理由见 `services/spot_draft.py:current_key`）。留空就是"这一路没配"，接口回 503 说人话。
    DEEPSEEK: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    # ⚠ 能读图的只有 flash：官方价目页 Vision 那一栏 `deepseek-v4-pro` 写的是 Not supported（10-25 现读，
    # 且现网那把钥真打 /models 回的就是这两枚）。换 model 名要一起换提示词那一路的期望，别只改这一行。
    DEEPSEEK_VISION_MODEL: str = "deepseek-flash"
    # 单发实测 19.6 秒（一次 9 图、服务器侧、峰时）⇒ 客户端那一侧的超时**必须比这个数大**，
    # 否则服务器还在等、手机已经断了，看起来像我们的错（与 `HUNYUAN_CF_TIMEOUT` 上面那条同一个理由）。
    DEEPSEEK_TIMEOUT: float = 90.0
    # 这组口的门闩（`routes/roammark.py:_check_gate`）。**留空 = 整组 503**，与 `ADMIN_TOKEN`、
    # `APPLE_CLIENT_ID` 同型：没配就必须是"这个功能不可用"，不能退化成"没配就当不检"。
    # ⚠ 它不是密钥：这一串编在 RoamMark 的包里，逆向我就能拿到，所以它挡的是"随手 curl 刷钱"，
    # 不挡铁了心的人——真正兜底的是 IP 限流与三发在飞那道舱壁。**别拿它当凭据轮换**。
    ROAMMARK_APP_GATE: str = ""
    # 图麦笔记 iPhone 那一路匿名口的门闩（`routes/v1_extract.py:_check_gate`），形状照上面那枚抄，
    # 理由也一样：**留空 = 这一口 503**，不是"没配就当不检"。
    # 为什么 iPhone 这一口需要它：那一端**没有账号**（现读 `ios/Sources` 全仓 0 处
    # `AuthenticationServices`，隐私那一屏明写「这个应用没有账号」），所以它拿不出一个"只有本人
    # 才有"的东西；能把刷钱从"随手 curl"抬到"先从包里把这串扒出来"的，就只有这一枚共享门闩
    # ＋ IP 限流 ＋ 在飞舱壁 ＋ 全站日闸那四样叠起来。单独任何一样都不够，这句要留在账上。
    # ⚠ 它不是凭据，别按密钥轮换它；换它要连 App 包一起重发。
    TUMARKNOTE_APP_GATE: str = ""

    # ---- 外链贴图随笔记存档（方案 docs/方案-公众号贴图随笔记存档.md）----
    # 服务端手里没有云开发存储的写凭据（.env 现读：只有 WECHAT_*/JWT_*/ADMIN_*/DATABASE_URL/
    # REDIS_URL/CORS_ORIGINS 那一串），而那把 API Key 的形状是"网关地址＋Bearer Key 打一个云函数"。
    # 站长拍的是"图存放的路径与用户主动上传/拍照一样处理"＝对象必须真进云开发那个桶，
    # 所以字节要穿一层云函数（`cloudfunctions/image_store`）才能落桶并换回 `cloud://` fileID。
    # **两行里任何一行没配＝整条不做**（一张都不下载、屏上也不报"没存上"）：代码可以先上现网，
    # 通道配好的那天才生效。这与 `MP_ASSETS_FREEZE`／`POSTER_TEMPLATES` 同型——
    # 半条链挂在屏上、静默少图，是这台机器上被打回过的那类事。
    IMAGE_STORE_CF_URL: str = ""
    # 同一个环境签发的管理员 API Key（不设有效期那一种）。故意与 `HUNYUAN_CF_KEY` 分两枚：
    #  Key 能单独轮换而地址不变，而且"提炼那把钥匙顺手也能往桶里写"这种事不该靠巧合成立。
    IMAGE_STORE_CF_KEY: str = ""
    # 客户端（这里是 worker）等待上限必须大于云函数自己的执行超时，理由同 `HUNYUAN_CF_TIMEOUT` 那段。
    # 现网这个新函数默认只有 3 秒（抬它要控制台那一下），所以这里先给 20 秒兜住，别照抄 90。
    # 10-25 第八轮审计 M31 抬到 30 秒：自家现网实测 1 MB→4882 ms、3 MB→504（15308 ms）、
    # 4 MB→200（**18231 ms**）＝20 秒预算只剩 9%，一张正常的 4 MB 原图随时会变成"没跟过来"。
    # 为什么停在这里：客户端 `utils/api.js:96` 那枚整请求上限是 30 秒，转存那一趟（最多九张、
    # 每张一趟）本来就可能超出它——那一半由 M6 的闸与 M7 的补抄兜住（超时后第二次点会补抄回来），
    # 不是靠压低这一档兜住。再抬到 45 秒只会让"客户端早就走了、服务端还在写"那一段更长。
    IMAGE_STORE_CF_TIMEOUT: float = 30.0

    # ---- H5 手机号+验证码登录（/v1/auth/sms、/v1/auth/login）----
    # 腾讯云短信凭据。前五项任一为空 = 开发模式：验证码只写日志不发短信，H5 登录口照常能用。
    # 五栏都走 service_secrets 那条链（库里优先、.env 兜底），所以生产环境由后台密钥页写入，
    # 不必 ssh 上去改 .env、不必重启。`SMS_SECRET_ID`/`SMS_SECRET_KEY` 是腾讯云 API 密钥
    # （CAM 那一对），不是短信应用里的 AppKey；另三栏是公开标识但也一起收进 CONSUMED_NAMES——
    # 那张名单钉的是"源码真读了哪些字面量"，少一个名字后台就会对活着的配置说"没人读"。
    SMS_SECRET_ID: str = ""
    SMS_SECRET_KEY: str = ""
    # 短信应用 ID（腾讯云控制台→短信→应用管理→应用列表→SDK AppID，纯数字）。
    SMS_SDK_APPID: str = ""
    # 签名内容（审核通过的那一句中文，例「图麦笔记」）。腾讯云 API 不包书名号。
    SMS_SIGN_NAME: str = ""
    # 模板 ID（腾讯云控制台→短信→国内消息→模板列表里那一行，纯数字）。
    # 模板内容必须只有一个变量：{1}，服务端往里塞 6 位数字验证码。
    SMS_TEMPLATE_ID: str = ""
    # 验证码活多久（分钟）。Redis 里那一枚 key 的 TTL 与回给客户端的「X 分钟内有效」都读它。
    SMS_CODE_TTL_MINUTES: int = 5
    # 同一手机号两次发送之间最少间隔（秒）。防连点、防刷钱（每条短信腾讯云收一分钱左右）。
    SMS_COOLDOWN_SECONDS: int = 60

    # ---- H5 邮箱+验证码登录（/v1/auth/email、/v1/auth/email-login）----
    # AWS SES 或任意 SMTP 凭据。五栏任一为空 = 开发模式：验证码只写日志不发邮件，与短信兜底同型。
    # 五栏都走 service_secrets 那条链（库里优先、.env 兜底），生产环境由后台密钥页写入。
    EMAIL_SMTP_HOST: str = ""
    EMAIL_SMTP_PORT: int = 587
    EMAIL_SMTP_USER: str = ""
    EMAIL_SMTP_PASSWORD: str = ""
    EMAIL_FROM_ADDRESS: str = ""
    # 验证码活多久（分钟）。与短信共用同一枚 TTL 配置，不另开一档。
    EMAIL_CODE_TTL_MINUTES: int = 5
    # 同一邮箱两次发送之间最少间隔（秒）。与短信冷却同型。
    EMAIL_COOLDOWN_SECONDS: int = 60

    # ---- 开发态固定登录（H5 跑通流程用，不依赖短信/邮件）----
    # 默认全关：`DEV_LOGIN_ENABLED=False` 时这四栏一个都不参与任何判断，生产行为零变化。
    # 打开后，只有「账号 == 锁定的那一枚」且「码 == DEV_LOGIN_CODE」才跳过 Redis 校验与真实发信——
    # 不是"任意账号 + 固定码"，blast radius 锁死在一个专用测试号上。
    # 用完必须关：这一档一旦在生产 .env 里开着，等于给那个号留了一道不验码的登录门。
    DEV_LOGIN_ENABLED: bool = False
    DEV_LOGIN_PHONE: str = ""
    DEV_LOGIN_EMAIL: str = ""
    DEV_LOGIN_CODE: str = ""

    @model_validator(mode="after")
    def _require_jwt_secret(self) -> "Settings":
        placeholder = "change-me-in-production-use-a-long-random-string"
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == placeholder:
            raise ValueError(
                "JWT_SECRET_KEY 未配置或仍为公开占位符，请在 .env 中设置一个长随机字符串后重启服务"
            )
        return self

    @model_validator(mode="after")
    def _require_database_url(self) -> "Settings":
        """数据库地址**不许退到内置默认值**（10-25 第八轮审计 M1）。

        原来这里默认 `sqlite:///./tmbj.db`，于是 `.env` 少抄这一栏时服务照样起、`/health` 照样 200，
        只是连的是一只当场新建的空库——站长的第一反应是"笔记全丢了"，而真库一个字节都没动，
        查账的人还会先去看备份。盘上那两只 0 字节的壳文件（现网 `app.db`、本机 `backend/tmbj.db`）
        就是这一条活过的证据。少一栏现在与 `JWT_SECRET_KEY` 同型：拒绝启动，说人话。
        """
        if not self.DATABASE_URL.strip():
            raise ValueError(
                "DATABASE_URL 未配置：请在 .env 中写明数据库地址后重启服务"
                "（这一栏没有可用的默认值——退到默认会连上一只新建的空库，症状与丢数据一模一样）"
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
