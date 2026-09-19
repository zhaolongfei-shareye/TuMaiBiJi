# 图麦笔记

微信小程序 + FastAPI 后端，将截图/链接自动提取为结构化笔记，构建个人知识库。

## 项目概述

**核心功能**：粘贴公众号文章链接或上传截图 → 自动提取内容 → LLM 生成摘要和要点 → 存入个人知识库

> 📄 **完整产品需求、技术依赖总表与 MVP 减法结论见 [`docs/产品需求.md`](docs/产品需求.md)**（当前 v2.2）。
> 本节仅为速览；两者冲突时以 `docs/产品需求.md` 为准（它逐条带 2026-09-19 的线上实测与本机探针证据）。

**已实现并线上验证**（2026-09-19）：
- ✅ 微信登录 + JWT 用户隔离（openid 不下发客户端；跨用户隔离已用第二个临时账号**真验**，非仅代码层）
- ✅ 笔记列表 / 详情 / 编辑 / 删除 / 置顶 / 搜索 / 分页
- ✅ **搜索已纳入正文**（`content` + `original_content`），没有提炼时也能按内容找
- ✅ **提炼不可用时自动降级存原文**，任务仍 `completed`（不再是整条链路失败）
- ✅ 分享图改内容驱动布局（提炼字段为空时不再出空白卡）
- ✅ 分类管理、手写笔记、分享图 + 小程序码、壁纸主题、多语言
- ✅ 零第三方凭据下 18 项接口通过（+1 项为探测脚本假阳性，已 curl 复测）

**架构已定案、代码尚未改**（v2.2，2026-09-19 深夜）：
- 🔧 **截图认字**：从腾讯云 OCR 换成**自建开源 RapidOCR**（跑在我们服务器进程里）。**不申请任何密钥、不限次数、不按次付费**。选型已本机实测通过（中文可用、单张最慢 5.71s、常驻约 160MB），**代码仍是腾讯云实现**
- 🔧 **结构化提炼**：从 DeepSeek 换成**云函数内的混元**（吃已领取的 10 亿 Token）。**代码一行未写**；改造完成前提炼停在"降级存原文"态——内容照常入库，只是没有摘要/要点/标签，UI 已隐藏对应区块不破版
- ✂️ **待删除**：`TENCENT_OCR_*`×2、`DEEPSEEK_API_KEY`、`COS_*`×4 共 7 个配置字段，以及 `storage.py` + `routes/assets.py` + `cos-python-sdk-v5`

**已决策下线**：语音转写链路 2026-09-19 **整体删除**（前端录音 UI、后端 route/worker task、`asr.py`、两个配置字段、i18n key、`permission.scope.record` 全清）。因此《隐私保护指引》不再需要申报麦克风权限。

**已领到的平台权益**（2026-09-19，微信「小程序成长计划 2026」）：混元 **10 亿 Token + 10 万张生图**，有效期至 **2027-03-19**（**过期即作废，这是排期的硬约束**）；云开发环境 `cloudbase-d6gzh0i0tff02943a` 已开通。**关键约束：这份额度只能在小程序端和云函数内使用，自建服务器直连 AI 兼容端点不会抵扣、会改扣套餐。**

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite（当前实况，PostgreSQL 尚未迁移）→ 阶段二再评估 pgvector
- **任务队列**: Redis + RQ（异步 ingest）
- **OCR**: **目标 = 自建开源 RapidOCR**（`rapidocr` + `onnxruntime`，纯 CPU，模型随 wheel 装约 30MB，进程内调用、零外部请求）。**现状代码仍是腾讯云 OCR**，属 v2.2 待改造项
- **LLM**: **目标 = 云函数内的混元**（`wx-server-sdk ≥ 4.0.1` 的 `cloud.ai()`，吃成长计划免费额度）。**现状代码仍是 DeepSeek，v2.2 删除**。**提炼只有两级：混元 → 降级存原文**（缺凭据 / 超时 / 429 / 返回非 JSON 都走降级，不阻断入库）。**只维护一家大模型**是本项目的定案
- **文件存储**: 腾讯云 COS 已封装但**前端零调用** → v2.2 定案整块删除（含 4 个配置字段与依赖）
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
│   │   ├── api/routes/          # auth notes categories ingest shares tasks user assets
│   │   ├── services/
│   │   │   ├── scraper.py       # 公众号/网页抓取（含 SSRF 防护）
│   │   │   ├── ocr.py           # 现状：腾讯云 OCR（TC3 签名）→ v2.2 换自建 RapidOCR，函数签名不变
│   │   │   ├── llm.py           # 现状：DeepSeek 提炼 → v2.2 改调云函数混元（_degraded/key_usable 保留）
│   │   │   ├── wechat.py        # access_token 缓存 + 小程序码
│   │   │   ├── storage.py       # 腾讯云 COS（前端零调用，v2.2 整块删除）
│   │   │   └── queue.py         # RQ 入队 + 任务状态
│   │   ├── tasks/ingest_tasks.py  # worker 侧两条链路（URL / 截图）
│   │   ├── core/                # config / auth(JWT) / rate_limit
│   │   ├── models/              # user note category share job asset
│   │   └── db/database.py
│   ├── tests/test_note_flows.py # 闭环 + 搜索覆盖 + 跨用户隔离（19 项）
│   ├── worker.py                # RQ worker 入口
│   ├── deploy.sh                # systemd 托管 + 真实重启断言 + 配置自检
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
pip install -r requirements.txt      # v2.2 后含 rapidocr + onnxruntime（模型随 wheel 装，运行时不联网下载）
cp .env.example .env
# v2.2 起 .env 只需要 3 个值：WECHAT_APP_ID / WECHAT_APP_SECRET / JWT_SECRET_KEY
# （JWT_SECRET_KEY 缺失或仍为公开占位符 → 服务启动即失败；云函数上线后再加 1 个触发凭据）

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

访问 http://localhost:8000/docs 查看 API 文档

### 小程序

1. 微信开发者工具导入 `miniprogram/` 目录
2. 修改 `app.js` 中的 `apiBase` 为你的后端地址
3. 编译运行

## 尚未实现

实测于 2026-09-19 深夜（旧版此段列的"搜索纳入正文 / 提炼降级 / 分享卡布局"**均已完成**，别再照那份清单干活；"腾讯云 OCR 凭据"这一条随 v2.2 换库**已作废**）：

- [ ] **自建 OCR 换库** — `services/ocr.py` 仍是腾讯云实现。选型已本机实测通过，改造要落实 4 条：识别前缩放到长边 ≤1600、单张串行、按检测框坐标重排、过滤噪声单字行。**一张 3420×2214px 的图未缩放单独跑，进程峰值 RSS 实测 1,064MB vs 服务器可用 1,992MB，缩放是硬性前置而非优化项**
  - ⚠️ 部署第一个坑（本机 macOS 测不出）：`rapidocr` 硬依赖 **GUI 版 `opencv_python`**，无桌面的 Ubuntu 服务器上 `import cv2` 可能因缺 `libGL.so.1` 失败。上服务器先单跑一次 `python -c "import cv2"`，再决定 `apt install libgl1` 还是换 `opencv-python-headless`
- [ ] **凭据收口** — `config.py` 删 7 个字段（`TENCENT_OCR_*`×2、`DEEPSEEK_API_KEY`、`COS_*`×4）+ `.env.example` 同步 + `requirements.txt` 换依赖 + 删 `storage.py`/`routes/assets.py` + 重写 `deploy.sh` 自检映射
- [ ] **云函数中转混元** — 一行代码都还没写。动手前先做一次最小实测（echo 函数 + 单次混元调用），确认三件事：真实超时上限（官方文档 60s/900s/15s 互相矛盾）、本环境是否开放 HTTP 网关、控制台实际开的是哪个模型名。**最硬的一条不变：混元调用必须发生在云函数内部**，服务器直连 AI 兼容端点会导致免费额度不抵扣、改扣套餐
- [ ] 笔记列表下拉刷新（全项目无 `onPullDownRefresh`）
- [ ] 标签筛选 UI（标签目前只展示不筛选）
- [ ] SQLite FTS5 / 标签多对多关联表（规模化再评估）
- [ ] 微信 AI（小微）接入 — **本轮结论是不写任何代码**：开发模式未开放提审评测，且官方明确禁止把相关代码合入正式版。可结合的钩子记录在 PRD §8.6

## 成本估算

- **域名**: ~60 元/年
- **服务器**: 已有，0 元
- **认字（OCR）**: **0 元，且无按次概念** — 自建开源库跑在自己进程里。v2.1 那句"腾讯云免费 1000 次/月，超出自建 PaddleOCR"整体作废：既然自建方案已实测可用，就没有先按次付费的理由
- **提炼（LLM）**: 目标 **0 元**（混元 10 亿 Token，**至 2027-03-19**）。超额后按用户决策自动转扣云开发套餐；**DeepSeek 出局，不再作为花钱的退路**
- **云开发**: 待确认是免费体验版还是 19.9 元/月；**不开按量付费**，超配额时系统直接限制使用而非扣费
- **总计**: 目标 **≈ 60 元/年**（域名）。前提：混元只从云函数内调用、不开按量付费

## 关键决策记录

- **大模型只维护一家 = 混元**。DeepSeek 删除（服务器该 key 从来是空的，删它不损失任何现有能力）。提炼失败不再换模型，而是**降级存原文**
- **OCR = 自建开源 RapidOCR**。~~"唯一可行路径是腾讯云 OCR"~~ 那句话只否证了**微信自带 OCR 接口**（个人主体过不了微信认证，实测 101003），从未评估自建路线；混元的视觉模型也已于 2026-06-22 下线，**已领的 token 做不了 OCR**，所以认字只能自己跑库
- **对外依赖只留两扇门**：服务器进程内的一个 OCR 库 + 云函数里的混元。任何"再接一家云产品 / 再造一个按次付费依赖"的提议，都要先解释为什么这两扇门不够
- **内存方案 = 收紧批次 + 缩放 + 串行**，不回退落盘（落盘不降低 OCR 峰值，还会把 worker 与 API 的文件系统耦合重新系上）
- **数据库**: SQLite（当前实况；旧版记录的"已迁移 PostgreSQL"**未生效**，MVP 阶段判定为不必迁）
- **语音**: **整体下线**。旧版记录的"腾讯云 ASR `SentenceRecognition`（60 秒上限）"已作废，代码已删除
- **海外站点**: **明确不支持**。服务器出海超时（`en.wikipedia.org` ConnectTimeout），抓取失败给可读文案
- **文件存储**: COS 前端零调用 → 整块删除（含配置面与依赖）
- **提炼的作用面**: 只有"提炼"这一个动作碰大模型，全项目仅 **2 个调用点**（`ingest_tasks.py:25` URL、`:65` 截图），且都在采集完成之后。**没有任何自动归类、语义搜索、问答功能依赖大模型**
- **视频号解析**: 元宝 cookie 法（非官方接口，个人自用可接受）；匿名抓取实测只能拿到空壳，故整体延后
- **部署**: systemd 托管，禁止 `pkill` + `nohup`（曾与 systemd 抢进程导致 5,966 次崩溃重启）
- **账号主体**: `wx4416d1283b5de721`（图麦笔记，个人主体），与水印项目独立。**注意**：这条 2026-09-19 下午曾被判为"已核对"而实际核对到了另一个号上，晚间才真核对完成

## 下一步

见 [`docs/产品需求.md` §8.2 上线阶梯](docs/产品需求.md)（v2.2 重排）。摘要：

1. **自建 OCR 换库 + 凭据收口** — 0 个新 key，全在 agent 能力内；改完要在**服务器上**重测缩放后的峰值 RSS（本机数值不能照抄）
2. **云函数最小验证** — echo 函数 + 单次混元调用，确认超时 / 网关 / 扣的是哪份额度。**部署方式需用户点头**（控制台上传 zip，或 `tcb login` 扫码）
3. 验证通过才把提炼接到混元；**不通过什么都不用回滚** —— 提炼停在降级态，产品照常可用，不再存在"没有第二家模型就上不了线"这回事
4. **提审前用户侧三件事**：request 合法域名加 `https://api.agentsbin.cn`（这是唯一还卡着发布的一项）、《隐私保护指引》只需相册、确认最新版本号与提交范围

> ⏳ 本轮（2026-09-19）明确**暂不部署**：文档 + 代码 + 测试先在本地提交回滚点，上线单独等点头。

## License

MIT
