# 图麦笔记

微信小程序 + FastAPI 后端，将截图/链接自动提取为结构化笔记，构建个人知识库。

## 项目概述

**核心功能**：粘贴公众号文章链接或上传截图 → 自动提取内容 → LLM 生成摘要和要点 → 存入个人知识库

> 📄 **完整产品需求、技术依赖总表与 MVP 减法结论见 [`docs/产品需求.md`](docs/产品需求.md)**（当前 v2.2）。
> 本节仅为速览；两者冲突时以 `docs/产品需求.md` 为准（它逐条带 2026-09-19 的线上实测与本机探针证据）。

> 🆕 **2026-09-19 状态**：小程序**已审核通过**（用户告知；过审的版本号、是否已点"发布"、后台合法域名核对，三项待进后台核实）。同日完成命名统一：本地目录与 **GitHub 仓库均已改名 `TuMaiBiJi`**（origin 已更新并验通），旧名 `WeTuShanJi` / `微图闪记` 全库清零，代码与脚本里的 `wtsj` 缩写也已改完，**只剩三处线上标识故意保留**（服务器目录、systemd unit 名、`apiBase` 里的 `/wtsj` 路径），原因见 PRD §8.2 末尾。

**已实现并线上验证**（2026-09-19）：
- ✅ 微信登录 + JWT 用户隔离（openid 不下发客户端；跨用户隔离已用第二个临时账号**真验**，非仅代码层）
- ✅ 笔记列表 / 详情 / 编辑 / 删除 / 置顶 / 搜索 / 分页
- ✅ **搜索已纳入正文**（`content` + `original_content`），没有提炼时也能按内容找
- ✅ **提炼不可用时自动降级存原文**，任务仍 `completed`（不再是整条链路失败）
- ✅ 分享图改内容驱动布局（提炼字段为空时不再出空白卡）
- ✅ 分类管理、手写笔记、分享图 + 小程序码、壁纸主题、多语言
- ✅ 零第三方凭据下 18 项接口通过（+1 项为探测脚本假阳性，已 curl 复测）

**代码已改完**（v2.2 第 2 步，2026-09-19 本轮）——**除 AppSecret 外泄那条修复已单独上线，其余全部只到本地，线上仍是旧版**：
- ✅ **截图认字已换成自建开源 RapidOCR**：`services/ocr.py` 从腾讯云 TC3 签名整体重写为进程内调用，**对外两个函数签名一字未改**，worker 与既有测试零改动。落实了 4 条实测要求：识别前缩放长边 ≤1600、单张串行（线程锁）、按检测框坐标重排为视觉顺序、过滤噪声行。**本机同图对照：峰值 RSS 1,076.6MB → 666.6MB，识别字符数 294 → 301**（不是拿推理凑的）。新增 19 条测试（审查后再补 6 条：暂存的每用户批次数与全局预算、坏图给中文字段、HEIC 在门口拒），与原有 19 条合并 **38 passed**
- ✅ **图片格式改为"进门就拒"，不支持 HEIC**：`/screenshots/stage` 按**文件头**放行 PNG/JPEG/GIF/BMP/TIFF/WEBP，其余返回 400 + 23 字中文提示。不做 HEIC 支持是决策不是遗漏：`pillow-heif` 会与"对外只有两扇门"冲突且重演 R13 那类原生库坑，前端改用 `sizeType:['compressed']` 又要拿识别率换兼容。**顺带修了一个让提示到不了用户眼前的断点**：`wx.uploadFile` 的 `res.data` 是字符串（`wx.request` 才是对象），页面按 `err.data.detail` 取会拿到 `undefined`，现在非 2xx 时先 parse 再 reject。同时把"提取成功"改成"已存入笔记"——`completed` 只证明笔记建好了，不证明提炼成功（**这条文案要重新提审才生效**）
- ✅ **OCR 补了像素闸门**（同日审查实测）：`_prepare` 原先"先全尺寸解码、再缩放长边"，而"单张 ≤10MB"管得住字节管不住像素——实测 **0.43MB 的纯色 PNG（12000×12000 / 1.44 亿像素）能过掉格式闸门，把进程峰值 RSS 顶到 1,271MB / 6.86s**。Pillow 自己的阈值挡不住这一档（1.79 亿像素以上才报错，8950 万～1.79 亿只 warn），所以改成在 `load()` **之前**用文件头宽高判像素数：`MAX_PIXELS=40_000_000`，超了直接拒。同一张图现在 **37MB / 0.015s** 拒掉；真机截图 3420×2214 只有 760 万像素，约 50 倍余量
- ✅ **用户可见错误改成中文收口**（同日审查）：新增 `app/core/errors.py::UserError`，**只有它的文本允许进 toast**，其余异常在 `ingest_tasks.failure_message()` 与 `scraper.scrape_url()` 两处收口成通用中文、原文留日志。搬迁了两处泄漏：RapidOCR 导入失败原先把"opencv 缺 libGL.so.1 / apt install libgl1"抛给用户，URL 抓取原先把 httpx 的英文异常（含完整 URL）原样透出。顺带把 charset 声明错的页面改成 `errors="replace"`，不再让整条任务失败
- ✅ **微信 AppSecret 不再经异常文本外泄**（同日第三轮，**已单独部署到现网**，2026-09-19 22:37）：`get_access_token` 原先用 `resp.raise_for_status()`，而 httpx 会把**整条请求 URL 拼进异常文本**，那条 URL 的 query 里就带着 AppSecret。喂同一份"微信 token 接口返回 502"的桩跑真实链路：旧版 `HTTPException(500).detail` = `生成小程序码失败: Server error '502 Bad Gateway' for url '…/cgi-bin/token?…&secret=<明文>'`，新版 `502` + `微信接口暂不可用，请稍后重试`。而 `/api/shares/{token}/qrcode` **不要求登录**（只要一个有效 share token）。现在两处凭据接口都不再 `raise_for_status`：状态码与响应体只写日志，往外抛固定中文；`shares.py` 改 502；`auth.py` 的 code2session 同规则处理，并补掉"响应非 JSON"和"缺 openid"两条裸异常。4 条哨兵测试（密钥注入假值）断言**异常文本、日志、HTTP 响应体三处都不含它**。**上线后在生产机上用真实凭据复验三条**：桩打 token 接口 → 异常与日志均不含密钥；真调微信拉小程序码 → 200 / 54,175 字节；假 code 打登录 → 401 且响应体里微信 errmsg 原文出现 0 次。只重启 `wtsj-api`（PID 变了、`NRestarts=0`），`wtsj-worker` 未被牵连。过程与回滚点见 PRD §8.7
- ✅ **配置校验失败不再回显任何字段值 + 测试环境收口**（同日第五轮，接上一条做，**已随 v2.2 整批于 2026-09-20 上线**）：上一轮我写"泄露已堵住"是过头的，审查后实测出两件事。① `hide_input_in_errors=True` 只清 `str(exc)`（实测文本从 297 降到 197 字节），**`exc.errors()` 里字段原值是完整的**（含哨兵，实测 1,324 字节）——所以"看不到"其实是 pydantic 把中间截断了，首尾两个字段的值照样完整。现在配置装载失败统一转成只含"字段名 + 原因"的 `RuntimeError`，且 `raise` 写在 `except` 外面，原异常不再挂在 `__context__` 上被 traceback 连带打出来（这两种写法各测过一次）。② 新增 `backend/tests/conftest.py`，在任何测试模块碰到 `app.*` 之前用**赋值**钉死 `DATABASE_URL` 与三套假凭据：因为 `settings` 是模块级单例，谁先 import 就按谁当时的环境定型，而 `test_note_flows` 的夹具里有 `drop_all()`——把 conftest 改成 `setdefault` 再预置一个业务库地址跑一次，**那个库文件真的被创建了**，也就是说这套测试此前有能力删真库的表。现在预置敌意地址跑仍 60 全绿且不产生该文件。**这一条不能单独上线**：线上 `config.py` 有 17 个字段、`ocr.py`/`asr.py`/`storage.py` 共 18 处引用 `TENCENT_OCR_*`/`TENCENT_ASR_*`/`COS_*`，覆盖成仓库版（已删这些字段）会让 API 直接起不来 → 详见 PRD §8.9 / R15 修正 / R16
- ✅ **`.env` 不再按当前工作目录查找**（同日第四轮，**已随 v2.2 整批于 2026-09-20 上线**）：部署 AppSecret 那条时，第一版验证脚本的 cwd 落在 `/home/ubuntu`，`env_file=".env"` 于是去读了**同机另一个项目的 `.env`**；线上 `config.py` 又没有 `model_config` 那一行（`extra` 默认 `forbid`），pydantic 就把对方的支付 appkey、`admin_signing_secret` 等字段值原样印进 `extra_forbidden` 报错。**外泄面已量化**：不经过任何 `detail`，客户端拿不到；本项目两个 unit 的 journal 里 grep 命中 **0 次**，泄露范围就是那次终端输出。改法两行：`env_file=PROJECT_ROOT / ".env"`（由 `__file__` 反推的绝对路径，本地 `backend/` == 服务器根目录）+ 显式 `extra="ignore"`。**三条测试各自做过反向验证**——把 `env_file` 改回相对就红 2 条，把 `ignore` 去掉本地整文件 collection error（本仓 `.env` 真残留 8 条腾讯字段，逐条回显），所以不是"写了个碰不到 bug 的测试"。**对方项目那个 `.env` 一个字节没动**（`watermark-image-api` 容器在用）。过程与量化见 PRD §8.8 / R15
- ✂️ **COS 已整块删除**：`storage.py` + `routes/assets.py` + `main.py` 两处接线 + `config.py` 的 `COS_*`×4 + `TENCENT_OCR_*`×2 + `requirements.txt` 的 `cos-python-sdk-v5`。**`assets` 表和 `cover_asset_id` 外键故意留着**（线上库删表要迁移，收益为零，且无运行时代码碰它）
- ✅ **`DEEPSEEK_API_KEY` 已删除**（`dcf28fe`，2026-09-20）：此前"刻意暂留"的理由是 `services/llm.py` 仍在读它，现在 provider 分层落地、读它的代码没了，暂留前提消失。**有测试锁住**（`test_deepseek_is_fully_gone` 断言 `llm.py` 搜不到 deepseek 且 `settings` 上无该字段）。`key_usable()` 按原计划保留，转用于云函数触发凭据
- 🔧 **结构化提炼：代码已完成，链路尚未打通**（`dcf28fe`）：新增哑管道云函数 `cloudfunctions/extract/` + 后端 `EXTRACT_PROVIDER` 分层（`hunyuan_cf` / `none` / `wechat_ai` 预留位），pytest 67 → 84 全过。**但三件事任一不成立时提炼仍走降级**（这仍是设计内的合法态，不是故障）：云函数未部署、`HUNYUAN_CF_URL/KEY` 未填、**服务器到 `*.api.tcloudbasegateway.com` 这条通道在本环境是否开放尚未实测**。降级态表现是：内容照常入库，只是没有摘要/要点/标签，UI 已隐藏对应区块不破版
- ✅ **截图笔记的标题不再取成分页标记**（R17，`f83b416`，**已于 2026-09-20 00:56 二次上线并在生产机复验**）：三条链路凑出的必然事故——`ocr_images()` 给每张图无条件前插 `--- 第N页 ---`、截图任务调 `extract_knowledge()` 时漏传 `fallback_title`（URL 那条传了，这个不对称是缺陷的一半）、服务器无提炼密钥必然降级而 `_degraded()` 取正文首行当标题。现在**标记只在"认出字的页 ≥ 2"时才加**（空页不占页码），并新增 `title_hint()` 取第一条正文行、自己跳过标记行。**多张时标记故意留着**（长截图的分页来源信息，且有测试钉着）。生产机复验读数：单张 4.0s → 标题 `产品周会纪要2026-09-19`、正文 292 字无标记；两张一批 6.0s → 标题仍取第一页正文、正文 665 字里两处标记齐全。新增 7 条测试（60 → 67 全绿）+ 三次"故意改坏看红几条"的反向验证，过程见 PRD §8.11

> 🚀 **2026-09-20 00:00 整批已部署到现网**（用户下达"部署到服务器"）。欠了四件事现在补了三件：`df -h` 磁盘 16G 可用（够 273MB）、`import cv2` 单跑过（**R13 真的在这台机器上复现了**，`libGL.so.1` 命中 0，走 `apt install -y libgl1 libglib2.0-0` 解决）、缩放后峰值 RSS 已用真实中文长截图（1170×3200）在生产机读到 **465.6MB**（按 0.15s 轮询 worker 的 cgroup，**必须按 cgroup 采**：RQ 每个任务 fork 子进程，主进程 RSS 全程只有 33MB）。第四件"真机走一遍"仍待用户拿手机点。**端到端已在服务器自证**：860×1166 那张 6.2s、长图 4.0s 走完 `stage → process → worker → 入库 → 列表/搜索可见`，中文逐行完整；HEIC 假文件门口 400 给中文。**过程中新抓一条 R17：截图笔记的标题全是 `--- 第1页 ---`**（分页标记被降级逻辑当成第一行取走）——**已于同日 00:56 单独二次上线并在生产机复验通过，见下面那条 ✅ 与 PRD §8.11**。

> 📱 **2026-09-20 白天"真机走一遍"已做（iPhone 体验版），结论见 PRD §8.12**：先对现网做全接口体检（真 JWT / 真截图 / 真 URL），**全部 200、零错误**——含截图 OCR 端到端 6.1s 出笔记、URL 导入 4.0s、分享建码 + 55KB 小程序码回传。所以用户报的"每个功能都不可用"实际是 **3 个前端 bug + 1 个后台配置漏项，后端一条都没坏**（`9623dd7`，体验版 `1.0.2`）：首页 `onShow` 不带 reset 导致整表追加重复；分享图因 `exec` 回调异常逃出 try/catch 而**永久卡在"生成分享图…"且无任何提示**；截图上传失败是「uploadFile 合法域名」漏配（与 request 分开配置的两栏，服务器全天零条 `stage` 请求即为证据）。**编辑页摘要为空不是 bug**，是提炼降级态的正确表现。验证上留一条方法：**拿改前版本跑同一套断言得 8 条不过、改后 0 条不过**——没有前后对比的"测试通过"不算证据
>
> 部署用的两个坑要记住：① **`onnxruntime==1.30.0` 在服务器上装不上**——服务器是 Ubuntu 22.04 / **Python 3.10.12**（本机 3.13.1），pip 报 `No matching distribution found`，境内镜像里 3.10 可用的最高版是 1.23.2，已实装它，`requirements.txt` 改成 `>=1.23.2,<2` 并写明原因；② **`deploy.sh` 里没有 `pip install` 步骤**，依赖必须在服务器 venv 里先手动装，且 `deploy.sh` 的 OCR 预检排在 restart **之前**，装不上就是"不重启、线上继续跑旧版"，不会把现网搞挂。回滚点：`/home/ubuntu/deploy-backup/backend-code-20260919-235350.tar.gz` + 同目录部署前 `pipfreeze`；`asr.py`/`storage.py`/`assets.py` 三个死文件是 `mv` 走的，在 `deploy-backup/retired-20260919-235350/`。全过程与读数的逐条记录见 PRD §8.10。
>
> ⚠️ **例外（已执行）**：最后那条 AppSecret 外泄修复**已按用户指令单独提前部署**——它只改 `wechat.py` / `shares.py` / `auth.py` 三个文件加新增的 `errors.py`，全在 API 进程内（不碰 worker、无 pip、无迁移），当天 22:37 只重启 `wtsj-api` 上线并在生产机复验通过。**不是走 `upload.sh`/`deploy.sh`**：那两个脚本会整包覆盖 `backend/`，会把 OCR 那批未授权部署的代码一起带上线。

**已决策下线**：语音转写链路 2026-09-19 **整体删除**（前端录音 UI、后端 route/worker task、`asr.py`、两个配置字段、i18n key、`permission.scope.record` 全清）。因此《隐私保护指引》不再需要申报麦克风权限。

**已领到的平台权益**（2026-09-19，微信「小程序成长计划 2026」）：混元 **10 亿 Token + 10 万张生图**，有效期至 **2027-03-19**（**过期即作废，这是排期的硬约束**）；云开发环境 `cloudbase-d6gzh0i0tff02943a` 已开通。**关键约束：这份额度只能在小程序端和云函数内使用，自建服务器直连 AI 兼容端点不会抵扣、会改扣套餐。**

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite（当前实况，PostgreSQL 尚未迁移）→ 阶段二再评估 pgvector
- **任务队列**: Redis + RQ（异步 ingest）
- **OCR**: **自建开源 RapidOCR**（`rapidocr==3.9.2` + `onnxruntime>=1.23.2,<2` + `opencv-python==5.0.0.93`，纯 CPU，进程内调用、零外部请求、无任何密钥）。**模型文件只占 30MB，整条依赖树装上占 ≈273MB**（`du` 实测：cv2 119 + onnxruntime 80 + numpy 34 + rapidocr 32 + shapely 7）——**上服务器第一步是 `df -h`**。**已于 2026-09-20 整批部署到现网并在生产机端到端自证**（PRD §8.10）。部署当天撞到两条与运行环境相关的实事：一是 `onnxruntime==1.30.0` 那个钉法被证伪，服务器上 pip 报 `No matching distribution found`（服务器 Python 3.10.12，本机 3.13.1），所以改成区间、服务器实装镜像里 3.10 可用的最高版 1.23.2；二是 GUI 版 opencv 需要的 `libGL.so.1` 在服务器上确实不存在（R13 复现），用 `apt install -y libgl1 libglib2.0-0` 解决。另有代码侧两个坑已写进注释：引擎把传入的 `ndarray` 当 **BGR**，所以我们喂 `PIL.Image` 让它自己做 RGB→BGR；`RapidOCR.__call__` 会改自身状态，**非线程安全**，必须串行
- **LLM**: **云函数内的混元**（`wx-server-sdk ≥ 4.0.1` 的 `cloud.ai()` → `createModel('cloudbase').generateText({model, messages, temperature})`，读 `result.text`；该接口**不提供** `maxTokens`，别照 OpenAI 兼容端点的习惯传）。**DeepSeek 已删除**（`dcf28fe`）。**提炼只有两级：混元 → 降级存原文**（缺凭据 / 超时 / 429 / 返回非 JSON 都走降级，不阻断入库）。**只维护一家大模型**是本项目的定案。⚠️ **混元调用必须发生在云函数内部**，服务器直连 AI 兼容端点会导致成长计划的免费额度不抵扣、改扣套餐
- **文件存储**: ~~腾讯云 COS~~ → **本轮已整块删除**（路由、service、4 个配置字段、依赖）。数据库里的 `assets` 表保留，未来若做"笔记内嵌图片"是**重新设计**而不是捡起现成的
- **网页抓取**: httpx + BeautifulSoup + trafilatura（含 SSRF 防护）
- **鉴权**: PyJWT（HS256）+ slowapi 限流
- **部署**: systemd 托管（`wtsj-api` / `wtsj-worker`）+ nginx 反代

### 前端
- **框架**: 微信小程序原生（个人小程序无 `web-view`，必须原生）
- **页面**: 11 个（笔记列表 / 新建入口 / 我的 / 详情 / 手写编辑 / 分享出图 / 分享落地 / 分类 / 壁纸 / 语言 / 关于）
- **TabBar**: 自定义组件，支持 i18n 动态切换

## 项目结构

```
TuMaiBiJi/
├── docs/
│   └── 产品需求.md            # ⭐ PRD v2.2：技术依赖总表 / MVP 减法 / 验收标准
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口 + 路由挂载
│   │   ├── api/routes/          # auth notes categories ingest shares tasks user（assets 路由已删）
│   │   ├── services/
│   │   │   ├── scraper.py       # 公众号/网页抓取（含 SSRF 防护）
│   │   │   ├── ocr.py           # ✅ 自建 RapidOCR：缩放≤1600 / 串行锁 / 按框重排 / 降噪，对外签名与腾讯云版一致
│   │   │   ├── llm.py           # 提炼 provider 分层：hunyuan_cf / none / wechat_ai 预留位（DeepSeek 已删；_degraded/key_usable 保留）
│   │   │   ├── wechat.py        # access_token 缓存 + 小程序码
│   │   │   └── queue.py         # RQ 入队 + 任务状态（storage.py 已随 COS 一起删除）
│   │   ├── tasks/ingest_tasks.py  # worker 侧两条链路（URL / 截图）—— 本轮零改动，靠 ocr.py 签名不变
│   │   ├── core/                # config / auth(JWT) / rate_limit
│   │   ├── models/              # user note category share job asset（留着，但已无路由读写它）
│   │   └── db/database.py
│   ├── probes/ocr_probe.py      # OCR 性能探针（PRD §6.1-C 的数据来源，macOS/Linux 的 RSS 单位已自动换算）
│   ├── tests/test_note_flows.py # 闭环 + 搜索覆盖 + 跨用户隔离（19 项）
│   ├── tests/test_ocr_flows.py  # 自建 OCR 的 19 项：缩放 / 排序 / 降噪 / 串行 / 批次与暂存上限 / 格式白名单 / 坏图中文字段 / 失败态
│   ├── worker.py                # RQ worker 入口
│   ├── deploy.sh                # systemd 托管 + 真实重启断言 + 配置自检 + 第 2 节 OCR 预检（在 restart 之前，不过就不推新代码）
│   ├── upload.sh                # 打包上传（排除 .env / *.key / AppleDouble）
│   ├── requirements.txt
│   └── .env.example
├── cloudfunctions/              # 【v2.2 待新建】提炼中转云函数（Node + wx-server-sdk ≥ 4.0.1）
│   └── extract/                 #   cloud.ai() → createModel → generateText；独立部署，不随 upload.sh 走
└── miniprogram/
    ├── pages/                   # index create me detail write share(+/view) categories wallpaper language about
    ├── custom-tab-bar/          # 自定义 TabBar（微信约定根目录名，非 components/）
    ├── utils/                   # api.js / i18n.js
    ├── assets/                  # 图标等静态资源
    └── app.js / app.json / app.wxss / sitemap.json
```

## 快速开始

### 后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt      # 已含 rapidocr + onnxruntime + opencv-python（模型随 wheel 装、运行时不联网下载；整套依赖 ≈273MB）
cp .env.example .env
# 必需只有 3 个值：WECHAT_APP_ID / WECHAT_APP_SECRET / JWT_SECRET_KEY
# （JWT_SECRET_KEY 缺失或仍为公开占位符 → 服务启动即失败）
# 提炼走云函数：HUNYUAN_CF_URL / HUNYUAN_CF_KEY 留空即可，此时提炼自动降级为"只存原文"
# 想临时关掉提炼（如提审期）：EXTRACT_PROVIDER=none，一个出网请求都不发

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **装完依赖先单跑一次 `python -c "import cv2"` 再启动服务。** `rapidocr` 硬依赖 **GUI 版 `opencv_python`**（已在 `requirements.txt` 里显式钉住 `opencv-python==5.0.0.93`），无桌面的 Ubuntu 上可能因缺 `libGL.so.1` 直接失败——本机 macOS 永远测不出这一条。真报错了二选一：`apt install libgl1`，或把**那一行**的包名换成 `opencv-python-headless==5.0.0.93`（两个 wheel 都发 cp37-abi3 的 manylinux 包，已确认；**别两个都装**：它们往同一个 `cv2/` 目录写，会静默互相覆盖）。`deploy.sh` 第 2 节已经把这段检查做成了自动的，且在 `systemctl restart` 之前——不过就不推新代码。

跑测试：`.venv/bin/python -m pytest -q`（**60 项** = 闭环 29 + 自建 OCR 25 + 配置装载 6；**整套不依赖 Redis**——把 `REDIS_URL` 指向死端口重跑仍全绿，因为限流用例走 `.__wrapped__` 绕过了 slowapi；也不需要网络、不需要任何真实密钥，凭据用例注入的是哨兵假值）

> ⚠️ **测试环境的 env 由 `backend/tests/conftest.py` 统一钉死**（赋值，不是 `setdefault`）。原因：`app.core.config.settings` 是模块级单例，**谁先 import 就按谁当时的环境定型**，测试文件里再改 `os.environ` 已经无效；而闭环测试的夹具会 `drop_all()`。本轮新增测试文件时真踩出过一次（整套安静地连上了本地 Postgres，22 个 connection error），所以这条收口进了 conftest 并配一条断言兜住。**新增测试文件不要再往自己文件顶部写 `os.environ[...] = ...`**，需要特殊配置请用 `monkeypatch`。

访问 http://localhost:8000/docs 查看 API 文档

### 小程序

1. 微信开发者工具导入 `miniprogram/` 目录
2. 修改 `app.js` 中的 `apiBase` 为你的后端地址
3. 编译运行

## 尚未实现

实测于 2026-09-19 深夜（旧版此段列的"搜索纳入正文 / 提炼降级 / 分享卡布局"**均已完成**，别再照那份清单干活；"腾讯云 OCR 凭据"这一条随 v2.2 换库**已作废**）：

- [x] ~~**自建 OCR 换库**~~ → **已完成并于 2026-09-20 部署到现网**。`services/ocr.py` 已整体换成进程内 RapidOCR，4 条要求全部落地并有测试锁死（缩放≤1600 / 串行 / 按框重排 / 降噪）。同图对照：峰值 RSS 1,076.6MB → 666.6MB（本机），服务器实测长图任务链路 cgroup 峰值 465.6MB
  - ⚠️ **当时剩下的唯一风险在服务器，2026-09-20 部署当天两条都落了地**：GUI 版 `opencv_python` 要的 `libGL.so.1` 在服务器上确实没有（本机 macOS 测不出），已用 `apt install -y libgl1 libglib2.0-0` 解决 —— 遗留一条：apt 装的系统库不在任何脚本里，重装机器会复发（R13）；缩放后的峰值 RSS 也已用真实中文长截图在生产机重测为 465.6MB，本机那个 666MB 确实不能照抄（详见 PRD §6.1-C、§8.10）
- [x] ~~**凭据收口**~~ → **已全部完成**（`dcf28fe` 补上最后一项）：已删 `TENCENT_OCR_*`×2 + `COS_*`×4 + `DEEPSEEK_API_KEY` 共 7 个字段、`storage.py`/`routes/assets.py`、`cos-python-sdk-v5`；新增 `EXTRACT_PROVIDER` + `HUNYUAN_CF_URL`/`KEY`/`TIMEOUT`。`.env.example` 与 `deploy.sh` 自检同步重写，自检另加 provider 分支（未实现/未知取值打印"该 provider 未实现，走降级"，不静默不崩——四种取值已逐一手跑）
- [~] **云函数中转混元** → **代码部分完成（`dcf28fe`），链路未通**：`cloudfunctions/extract/` 哑管道 + provider 分层已写完并离线验证（pytest 84 全过、云函数假 SDK 21 条断言全过）。**动手实测前有三件事没答案**：真实超时上限（官方文档 60s/900s/15s 互相矛盾，故 `HUNYUAN_CF_TIMEOUT` 做成配置项）、本环境是否开放 HTTP 网关、控制台实际开的是哪个模型名（故模型 id 走 `HUNYUAN_MODEL_ID` 环境变量，免得猜错还要重传 zip）。**最硬的一条不变：混元调用必须发生在云函数内部**，服务器直连 AI 兼容端点会导致免费额度不抵扣、改扣套餐
  - **"供应商可插拔"四条已按 PRD F6 落地并各有测试锁**：4 字段 JSON 契约冻结、`extract_knowledge` 保持唯一入口（`test_entry_point_count_is_two` 断言调用点只有 `ingest_tasks.py` 一处文件，不许加第三个）、`EXTRACT_PROVIDER` 三值分层、云函数只做"文本进 → JSON 出"的哑管道且**不持有提示词**（prompt 只由后端经 `event.system_prompt` 传入，两处各存一份必然漂移）
- [ ] 笔记列表下拉刷新（全项目无 `onPullDownRefresh`）
- [ ] 标签筛选 UI（标签目前只展示不筛选）
- [ ] SQLite FTS5 / 标签多对多关联表（规模化再评估）
- [ ] 微信 AI（小微）接入 — **本轮结论是不写任何代码**：开发模式未开放提审评测，且官方明确禁止把相关代码合入正式版。可结合的钩子记录在 PRD §8.6。**但接口已预留**：出向提炼做成可插拔（见上方"云函数中转混元"的子项），测试期过后同平台 AI 若开放正式调用，它就是首选供应商，届时换适配器即可

## 成本估算

- **域名**: ~60 元/年
- **服务器**: 已有，0 元
- **认字（OCR）**: **0 元，且无按次概念** — 自建开源库跑在自己进程里。v2.1 那句"腾讯云免费 1000 次/月，超出自建 PaddleOCR"整体作废：既然自建方案已实测可用，就没有先按次付费的理由
- **提炼（LLM）**: 目标 **0 元**（混元 10 亿 Token，**至 2027-03-19**）。超额后按用户决策自动转扣云开发套餐；**DeepSeek 出局，不再作为花钱的退路**
- **云开发**: 待确认是免费体验版还是 19.9 元/月；**不开按量付费**，超配额时系统直接限制使用而非扣费
- **总计**: 目标 **≈ 60 元/年**（域名）。前提：混元只从云函数内调用、不开按量付费

## 关键决策记录

- **大模型只维护一家 = 混元**。DeepSeek 删除（服务器该 key 从来是空的，删它不损失任何现有能力；**字段暂留到第 3 步**，因为 `llm.py` 还在读）。提炼失败不再换模型，而是**降级存原文**
- **OCR = 自建开源 RapidOCR**（**代码已落地，2026-09-20 已在现网运行**）。~~"唯一可行路径是腾讯云 OCR"~~ 那句话只否证了**微信自带 OCR 接口**（个人主体过不了微信认证，实测 101003），从未评估自建路线；混元的视觉模型也已于 2026-06-22 下线，**已领的 token 做不了 OCR**，所以认字只能自己跑库
- **对外依赖只留两扇门**：服务器进程内的一个 OCR 库 + 云函数里的混元。任何"再接一家云产品 / 再造一个按次付费依赖"的提议，都要先解释为什么这两扇门不够
- **内存方案 = 缩放（长边 ≤1600）+ 单张串行**为主，收紧批次只是顺带。实测证明峰值由**单张图像素**决定（B 图单独跑就 1,064MB），不是批次累积——落盘或减小批次都降不了 OCR 那份峰值，它们治的是 Redis/磁盘另一池。**本轮已把缩放这条从推理变成对照实测**：同一张 3420×2214 图，不缩放 4.32s / 1,076.6MB → ≤1600 3.32s / 666.6MB → ≤1280 2.63s / 528.5MB，**1600 是拐点**（再压就开始掉字，所以没继续往下）。批次上限也已定值：10 张 / 单张 10MB / 合计 40MB / **每用户活跃批次 2 个** / **全局暂存 120MB** / TTL 1800s
- **提炼供应商可插拔（v2.2 追加）**：契约冻结在 4 字段 JSON、`extract_knowledge` 唯一入口、`EXTRACT_PROVIDER` 分层、云函数只做哑管道。**当前默认混元（云函数内），并为微信自家 AI 预留枚举位但不写一行调用代码**。理由：小程序生态的 AI 能力过了测试期后大概率可正式调用，届时同平台产品是最优选，预留能把二次开发从"重做提炼"降到"换一个适配器文件"
- **数据库**: SQLite（当前实况；旧版记录的"已迁移 PostgreSQL"**未生效**，MVP 阶段判定为不必迁）
- **语音**: **整体下线**。旧版记录的"腾讯云 ASR `SentenceRecognition`（60 秒上限）"已作废，代码已删除
- **海外站点**: **明确不支持**。服务器出海超时（`en.wikipedia.org` ConnectTimeout），抓取失败给可读文案
- **文件存储**: ~~COS 前端零调用 → 整块删除（含配置面与依赖）~~ → **本轮已删完**。只留数据库的 `assets` 表与外键（删表要迁移、零收益，且已无运行时代码读写它）
- **不给 OCR 同时加两个 opencv（本轮取舍）**：`rapidocr` 声明的是 GUI 版 `opencv_python`，两个 wheel 都往 `cv2/` 目录装，同时列进 `requirements.txt` 会静默互相覆盖、pip 不报错。所以只把 **GUI 版显式钉成 `opencv-python==5.0.0.93`**（让"换 headless"= 改这一行的包名），改为**在 `deploy.sh` 第 2 节真跑一次 `import cv2`**——把不确定性从"读代码时猜"挪到"部署时当场报错并打印修复命令"
- **暂存上限卡两个维度（审查后补）**：单批（10 张 / 单张 10MB / 合计 40MB）之外，还卡 **每用户活跃批次 ≤2**、**全局暂存 ≤120MB**。原来只卡单批大小，而 stage 不传 `batch_id` 就新建批次、TTL 30 分钟，一个客户端半小时内能堆几百批
- **提炼的作用面**: 只有"提炼"这一个动作碰大模型，全项目仅 **2 个调用点**（`ingest_tasks.py:25` URL、`:65` 截图），且都在采集完成之后。**没有任何自动归类、语义搜索、问答功能依赖大模型**
- **视频号解析**: 元宝 cookie 法（非官方接口，个人自用可接受）；匿名抓取实测只能拿到空壳，故整体延后
- **命名统一止于仓库与代码**：目录、GitHub 仓库、脚本临时产物、i18n key 全部改 `TuMaiBiJi`；**但服务器目录 `/home/ubuntu/wtsj-backend`、systemd unit `wtsj-api`/`wtsj-worker`、`apiBase` 里的 `/wtsj` 路径不改**。理由：URL 路径已编译进**已过审的客户端**，改它等于线上立刻 404、只能再提一版；unit 名是跑着线上流量的服务的身份。收益只是好看，风险是打断线上，所以只跟有功能变更的那轮提审一起做
- **部署**: systemd 托管，禁止 `pkill` + `nohup`（曾与 systemd 抢进程导致 5,966 次崩溃重启）
- **账号主体**: `wx4416d1283b5de721`（图麦笔记，个人主体），与水印项目独立。**注意**：这条 2026-09-19 下午曾被判为"已核对"而实际核对到了另一个号上，晚间才真核对完成

## 下一步

见 [`docs/产品需求.md` §8.2 上线阶梯](docs/产品需求.md)（v2.2 重排）。摘要：

1. ~~**自建 OCR 换库 + 凭据收口**~~ → ✅ **2026-09-20 已整批部署到现网**（用户下达"部署到服务器"）。四件事里 `df -h`、`import cv2`（R13 在这台服务器上真的复现，用 `apt install -y libgl1 libglib2.0-0` 解决）、缩放后峰值 RSS（长图 465.6MB）**三件已补，只剩"真机走一遍"**。过程、回滚点与新发现的 R17 逐条见 PRD §8.10。**R17 本身已修完并单独二次上线（同日 00:56，PRD §8.11），后端现在没有已知待修的用户可见缺陷**。AppSecret 外泄那条（R14）更早已于 2026-09-19 22:37 单独上线；`.env` 装载与配置报错脱敏两条（R15 / R16 / §8.8 / §8.9）随本次整批一起生效——它们确实不能照 R14 那样单点上线（线上 `config.py` 17 个字段、18 处在读已删字段），所以走的是"同进同出"的整批路径。
2. **云函数最小验证**（代码侧已就绪 `dcf28fe`，只差部署与实测）— 上传 `cloudfunctions/extract/` 的 zip，然后回答三个没答案的问题：真实超时上限、**本环境是否开放 `*.api.tcloudbasegateway.com` 这条 HTTP 通道**、控制台实际开的模型名。**部署方式需用户点头**（控制台上传 zip，或 `tcb login` 扫码）
3. 上一条实测通过才把 `HUNYUAN_CF_URL/KEY` 填进服务器 `.env` 并部署后端；**不通过什么都不用回滚** —— 提炼停在降级态，产品照常可用，不再存在"没有第二家模型就上不了线"这回事
4. **提审前用户侧三件事**：~~request 合法域名加 `https://api.agentsbin.cn`~~（✅ 2026-09-20 已配并真机验证 iPhone 读路径已通）、**uploadFile 合法域名同样加这个地址**（截图上传走 `wx.uploadFile`，与 request 是分开配置的两栏，漏配则截图功能必然失败）、《隐私保护指引》只需相册、确认最新版本号与提交范围。**注意小程序码走的是 `wx.downloadFile` 而不是 `wx.request`（`share.js:47`），所以后台的「downloadFile 合法域名」也必须包含同一域名**——这三处是分别配置的，本条我进不去后台，只能标出来
5. **体验版**：`1.0.1` 已被 `1.0.2` 取代（`9623dd7`）——1.0.1 只含 R17 + 中性文案 + toast 三条，1.0.2 另含真机走查修掉的**首页笔记卡重复**与**分享图永久卡死**两条。上传走 `miniprogram-ci`，需把历次 `-10008` 报错里的出口 IP 逐条累加进「代码上传 IP 白名单」（这台机器是多出口 NAT，一次加一个会反复被拦）

> ✅ 部署纪律执行结果（截至 2026-09-20 01:05）：**后端已全部在现网，包括 R17 那条标题修复**——AppSecret 那条 22:37 单点上线，OCR 那批（自建 OCR、暂存配额、格式白名单、错误文案收口、`.env` 装载、配置报错脱敏）2026-09-20 整批上线并在生产机端到端自证，R17 同日 00:56 单独二次上线并在生产机复验（PRD §8.11）。**仍未部署的是小程序侧代码**：`d449dc8` 的中性文案与格式提示、`c323e49` 的 toast 送达修复都只在仓库里，现网跑的是已过审的 `1.0.0`。要真机验这两条，需要出一个体验版（上面第 5 条）。

## License

MIT
