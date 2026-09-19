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

**代码已改完、尚未部署**（v2.2 第 2 步，2026-09-19 本轮；**全部只到本地，线上仍是旧版**）：
- ✅ **截图认字已换成自建开源 RapidOCR**：`services/ocr.py` 从腾讯云 TC3 签名整体重写为进程内调用，**对外两个函数签名一字未改**，worker 与既有测试零改动。落实了 4 条实测要求：识别前缩放长边 ≤1600、单张串行（线程锁）、按检测框坐标重排为视觉顺序、过滤噪声行。**本机同图对照：峰值 RSS 1,076.6MB → 666.6MB，识别字符数 294 → 301**（不是拿推理凑的）。新增 19 条测试（审查后再补 6 条：暂存的每用户批次数与全局预算、坏图给中文字段、HEIC 在门口拒），与原有 19 条合并 **38 passed**
- ✅ **图片格式改为"进门就拒"，不支持 HEIC**：`/screenshots/stage` 按**文件头**放行 PNG/JPEG/GIF/BMP/TIFF/WEBP，其余返回 400 + 23 字中文提示。不做 HEIC 支持是决策不是遗漏：`pillow-heif` 会与"对外只有两扇门"冲突且重演 R13 那类原生库坑，前端改用 `sizeType:['compressed']` 又要拿识别率换兼容。**顺带修了一个让提示到不了用户眼前的断点**：`wx.uploadFile` 的 `res.data` 是字符串（`wx.request` 才是对象），页面按 `err.data.detail` 取会拿到 `undefined`，现在非 2xx 时先 parse 再 reject。同时把"提取成功"改成"已存入笔记"——`completed` 只证明笔记建好了，不证明提炼成功（**这条文案要重新提审才生效**）
- ✅ **OCR 补了像素闸门**（同日审查实测）：`_prepare` 原先"先全尺寸解码、再缩放长边"，而"单张 ≤10MB"管得住字节管不住像素——实测 **0.43MB 的纯色 PNG（12000×12000 / 1.44 亿像素）能过掉格式闸门，把进程峰值 RSS 顶到 1,271MB / 6.86s**。Pillow 自己的阈值挡不住这一档（1.79 亿像素以上才报错，8950 万～1.79 亿只 warn），所以改成在 `load()` **之前**用文件头宽高判像素数：`MAX_PIXELS=40_000_000`，超了直接拒。同一张图现在 **37MB / 0.015s** 拒掉；真机截图 3420×2214 只有 760 万像素，约 50 倍余量
- ✅ **用户可见错误改成中文收口**（同日审查）：新增 `app/core/errors.py::UserError`，**只有它的文本允许进 toast**，其余异常在 `ingest_tasks.failure_message()` 与 `scraper.scrape_url()` 两处收口成通用中文、原文留日志。搬迁了两处泄漏：RapidOCR 导入失败原先把"opencv 缺 libGL.so.1 / apt install libgl1"抛给用户，URL 抓取原先把 httpx 的英文异常（含完整 URL）原样透出。顺带把 charset 声明错的页面改成 `errors="replace"`，不再让整条任务失败
- ✅ **微信 AppSecret 不再经异常文本外泄**（同日第三轮，**HEAD 旧版与工作区新版 A/B 实跑对照**）：`get_access_token` 原先用 `resp.raise_for_status()`，而 httpx 会把**整条请求 URL 拼进异常文本**，那条 URL 的 query 里就带着 AppSecret。喂同一份"微信 token 接口返回 502"的桩跑真实链路：旧版 `HTTPException(500).detail` = `生成小程序码失败: Server error '502 Bad Gateway' for url '…/cgi-bin/token?…&secret=<明文>'`，新版 `502` + `微信接口暂不可用，请稍后重试`。而 `/api/shares/{token}/qrcode` **不要求登录**（只要一个有效 share token）。现在两处凭据接口都不再 `raise_for_status`：状态码与响应体只写日志，往外抛固定中文；`shares.py` 改 502；`auth.py` 的 code2session 同规则处理，并补掉"响应非 JSON"和"缺 openid"两条裸异常。4 条哨兵测试（密钥注入假值）断言**异常文本、日志、HTTP 响应体三处都不含它**。⚠️ **这条在现网旧版里就成立，本地修完但按"不部署"执行，所以窗口目前仍然开着**（见 PRD R14）
- ✂️ **COS 已整块删除**：`storage.py` + `routes/assets.py` + `main.py` 两处接线 + `config.py` 的 `COS_*`×4 + `TENCENT_OCR_*`×2 + `requirements.txt` 的 `cos-python-sdk-v5`。**`assets` 表和 `cover_asset_id` 外键故意留着**（线上库删表要迁移，收益为零，且无运行时代码碰它）
- ⚠️ **`DEEPSEEK_API_KEY` 本轮刻意没删**：`services/llm.py` 仍在读它，删字段会让代码引用不存在的配置项。它随第 3 步（提炼接混元）一起删——**"凭据收口一次性做完"因此被拆成两次**，这是执行偏差，别当成计划本来如此
- 🔧 **结构化提炼仍未动**：目标是从 DeepSeek 换成**云函数内的混元**（吃已领取的 10 亿 Token），**代码一行未写**；改造完成前提炼停在"降级存原文"态——内容照常入库，只是没有摘要/要点/标签，UI 已隐藏对应区块不破版

> **本轮明确不部署。** 因此上面每一条的"验"都只到本机：**服务器端 `import cv2` 是否报缺 `libGL.so.1`（R13）、缩放后的真实峰值 RSS、真机"截图 → 认字 → 入库 → 列表可见"三件全部未发生**。`deploy.sh` 已新增 OCR 运行期预检（真跑一张合成图、打印耗时与峰值 RSS），部署当天顺手就有数——但注意 `deploy.sh` 里**没有 `pip install` 步骤**，新依赖要先在服务器 venv 里手动装。
>
> ⚠️ **唯一一条"不带新依赖、可以单独提前部署"的是最后那条 AppSecret 外泄**：它只改 `wechat.py` / `shares.py` / `auth.py` 三个文件，全在 API 进程内（不碰 worker、不碰 OCR、无 pip、无迁移），重启 `wtsj-api` 即可生效。其余各条都得等依赖装完一起上。

**已决策下线**：语音转写链路 2026-09-19 **整体删除**（前端录音 UI、后端 route/worker task、`asr.py`、两个配置字段、i18n key、`permission.scope.record` 全清）。因此《隐私保护指引》不再需要申报麦克风权限。

**已领到的平台权益**（2026-09-19，微信「小程序成长计划 2026」）：混元 **10 亿 Token + 10 万张生图**，有效期至 **2027-03-19**（**过期即作废，这是排期的硬约束**）；云开发环境 `cloudbase-d6gzh0i0tff02943a` 已开通。**关键约束：这份额度只能在小程序端和云函数内使用，自建服务器直连 AI 兼容端点不会抵扣、会改扣套餐。**

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite（当前实况，PostgreSQL 尚未迁移）→ 阶段二再评估 pgvector
- **任务队列**: Redis + RQ（异步 ingest）
- **OCR**: **自建开源 RapidOCR**（`rapidocr==3.9.2` + `onnxruntime==1.30.0` + `opencv-python==5.0.0.93`，纯 CPU，进程内调用、零外部请求、无任何密钥）。**模型文件只占 30MB，整条依赖树装上占 ≈273MB**（`du` 实测：cv2 119 + onnxruntime 80 + numpy 34 + rapidocr 32 + shapely 7）——**上服务器第一步是 `df -h`**。**代码已落地**（本机测试通过，服务器未部署）。两个坑已写进注释：① 引擎把传入的 `ndarray` 当 **BGR**，所以我们喂 `PIL.Image` 让它自己做 RGB→BGR；② `RapidOCR.__call__` 会改自身状态，**非线程安全**，必须串行
- **LLM**: **目标 = 云函数内的混元**（`wx-server-sdk ≥ 4.0.1` 的 `cloud.ai()`，吃成长计划免费额度）。**现状代码仍是 DeepSeek，第 3 步删除**。**提炼只有两级：混元 → 降级存原文**（缺凭据 / 超时 / 429 / 返回非 JSON 都走降级，不阻断入库）。**只维护一家大模型**是本项目的定案
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
│   │   │   ├── llm.py           # 现状 DeepSeek 提炼 → 第 3 步改调云函数混元（_degraded/key_usable 保留）
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
# （JWT_SECRET_KEY 缺失或仍为公开占位符 → 服务启动即失败；云函数上线后再加 1 个触发凭据）
# DEEPSEEK_API_KEY 是第 3 步前的遗留项，留空即可，不影响启动

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **装完依赖先单跑一次 `python -c "import cv2"` 再启动服务。** `rapidocr` 硬依赖 **GUI 版 `opencv_python`**（已在 `requirements.txt` 里显式钉住 `opencv-python==5.0.0.93`），无桌面的 Ubuntu 上可能因缺 `libGL.so.1` 直接失败——本机 macOS 永远测不出这一条。真报错了二选一：`apt install libgl1`，或把**那一行**的包名换成 `opencv-python-headless==5.0.0.93`（两个 wheel 都发 cp37-abi3 的 manylinux 包，已确认；**别两个都装**：它们往同一个 `cv2/` 目录写，会静默互相覆盖）。`deploy.sh` 第 2 节已经把这段检查做成了自动的，且在 `systemctl restart` 之前——不过就不推新代码。

跑测试：`.venv/bin/python -m pytest -q`（**54 项** = 闭环 29 + 自建 OCR 25；**整套不依赖 Redis**——把 `REDIS_URL` 指向死端口重跑仍全绿，因为限流用例走 `.__wrapped__` 绕过了 slowapi；也不需要网络、不需要任何真实密钥，凭据用例注入的是哨兵假值）

访问 http://localhost:8000/docs 查看 API 文档

### 小程序

1. 微信开发者工具导入 `miniprogram/` 目录
2. 修改 `app.js` 中的 `apiBase` 为你的后端地址
3. 编译运行

## 尚未实现

实测于 2026-09-19 深夜（旧版此段列的"搜索纳入正文 / 提炼降级 / 分享卡布局"**均已完成**，别再照那份清单干活；"腾讯云 OCR 凭据"这一条随 v2.2 换库**已作废**）：

- [x] ~~**自建 OCR 换库**~~ → **本轮已完成（代码 + 本机测试），未部署**。`services/ocr.py` 已整体换成进程内 RapidOCR，4 条要求全部落地并有测试锁死（缩放≤1600 / 串行 / 按框重排 / 降噪）。同图对照：峰值 RSS 1,076.6MB → 666.6MB，字数 294 → 301
  - ⚠️ **剩下的唯一风险在服务器**：`rapidocr` 拉的是 GUI 版 `opencv_python`，无桌面的 Ubuntu 上 `import cv2` 可能缺 `libGL.so.1`（本机 macOS 测不出）；且**缩放后的峰值 RSS 必须在服务器上重测**，本机绝对值不可用作判定（详见 PRD §6.1-C 的两条"别误读"）
- [x] ~~**凭据收口**~~ → **做了一半，剩 DeepSeek 一项**：已删 `TENCENT_OCR_*`×2 + `COS_*`×4 共 6 个字段、`storage.py`/`routes/assets.py`、`cos-python-sdk-v5`，`.env.example` 与 `deploy.sh` 自检映射同步重写并加了 OCR 运行期自检。**未做**：`DEEPSEEK_API_KEY` 删除 + 新增 `EXTRACT_PROVIDER`/云函数触发凭据——这两件属"提炼"链路，随下一条一起做（`llm.py` 现在还在读那个字段，先删会让代码引用不存在的配置项）
- [ ] **云函数中转混元** — 一行代码都还没写。动手前先做一次最小实测（echo 函数 + 单次混元调用），确认三件事：真实超时上限（官方文档 60s/900s/15s 互相矛盾）、本环境是否开放 HTTP 网关、控制台实际开的是哪个模型名。**最硬的一条不变：混元调用必须发生在云函数内部**，服务器直连 AI 兼容端点会导致免费额度不抵扣、改扣套餐
  - **同时按"供应商可插拔"写**（PRD F6 四条）：4 字段 JSON 契约冻结、`extract_knowledge` 保持唯一入口（调用点只有 2 个，不许加第三个）、`_call_llm` 下抽 `EXTRACT_PROVIDER`（`hunyuan_cf` / `none` / 微信 AI 预留位）、云函数只做"文本进 → JSON 出"的哑管道。这样将来微信自家 AI 开放正式调用时换的是适配器，不是重构
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
- **OCR = 自建开源 RapidOCR**（**本轮代码已落地，未部署**）。~~"唯一可行路径是腾讯云 OCR"~~ 那句话只否证了**微信自带 OCR 接口**（个人主体过不了微信认证，实测 101003），从未评估自建路线；混元的视觉模型也已于 2026-06-22 下线，**已领的 token 做不了 OCR**，所以认字只能自己跑库
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

1. ~~**自建 OCR 换库 + 凭据收口**~~ → **本轮已做完代码侧（54 项测试全绿），未部署**。剩余的是**服务器侧四件事**：`df -h` 看磁盘够不够 273MB、装新依赖前单跑 `import cv2`、部署当天读缩放后的峰值 RSS、真机走一遍"截图 → 认字 → 入库 → 列表可见"。**AppSecret 外泄那条（R14）不在这四件事里**：它无新依赖、不碰 worker，可单独提前部署
2. **云函数最小验证 + 收口 DeepSeek** — echo 函数 + 单次混元调用，确认超时 / 网关 / 扣的是哪份额度。**部署方式需用户点头**（控制台上传 zip，或 `tcb login` 扫码）
3. 验证通过才把提炼接到混元；**不通过什么都不用回滚** —— 提炼停在降级态，产品照常可用，不再存在"没有第二家模型就上不了线"这回事
4. **提审前用户侧三件事**：request 合法域名加 `https://api.agentsbin.cn`（这是唯一还卡着发布的一项）、《隐私保护指引》只需相册、确认最新版本号与提交范围

> ⏳ 本轮（2026-09-19）明确**暂不部署**：文档 + 代码 + 测试先在本地提交回滚点，上线单独等点头。

## License

MIT
