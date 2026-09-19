# 图麦笔记

微信小程序 + FastAPI 后端，将截图/链接自动提取为结构化笔记，构建个人知识库。

## 项目概述

**核心功能**：粘贴公众号文章链接或上传截图 → 自动提取内容 → LLM 生成摘要和要点 → 存入个人知识库

> 📄 **完整产品需求、依赖矩阵与 MVP 减法结论见 [`docs/产品需求.md`](docs/产品需求.md)**。
> 本节仅为速览；两者冲突时以 `docs/产品需求.md` 为准（它逐条带 2026-09-19 的线上实测证据）。

**已实现并线上验证**（2026-09-19）：
- ✅ 微信登录 + JWT 用户隔离（openid 不下发客户端；跨用户隔离已用第二个临时账号**真验**，非仅代码层）
- ✅ 笔记列表 / 详情 / 编辑 / 删除 / 置顶 / 搜索 / 分页
- ✅ **搜索已纳入正文**（`content` + `original_content`），无 LLM 时也能按内容找
- ✅ **LLM 不可用时自动降级存原文**，任务仍 `completed`（不再是整条链路失败）
- ✅ 分享图改内容驱动布局（提炼字段为空时不再出空白卡）
- ✅ 分类管理、手写笔记、分享图 + 小程序码、壁纸主题、多语言
- ✅ 零第三方凭据下 18 项接口通过（+1 项为探测脚本假阳性，已 curl 复测）

**已实现但待凭据才能启用**：
- ⛔ **截图 OCR — 缺腾讯云 OCR 两个字段，且已提为 MVP 必需**（这是当前唯一的凭据阻塞项，也是链路上的硬单点：没 OCR 就没内容可存）
- ⏳ URL 剪藏的「自动提炼」— 缺 `DEEPSEEK_API_KEY`（采集本身已实测可用；缺 key 只影响提炼，不影响入库）

**已决策下线**：语音转写链路 2026-09-19 **整体删除**（前端录音 UI、后端 route/worker task、`asr.py`、两个配置字段、i18n key、`permission.scope.record` 全清）。因此《隐私保护指引》不再需要申报麦克风权限。

**后续规划**：提炼切到**微信云函数中转混元**（吃成长计划免费额度，见下）；阶段二 B站/视频号；阶段三 抖音/小红书、语义搜索。

**已领到的平台权益**（2026-09-19，微信「小程序成长计划 2026」）：混元 **10 亿 Token + 10 万张生图**，有效期至 **2027-03-19**；云开发环境 `cloudbase-d6gzh0i0tff02943a` 已开通。**关键约束：这份额度只能在小程序端和云函数内使用，自建服务器直连 AI 兼容端点不会抵扣、会改扣套餐。**

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite（当前实况，PostgreSQL 尚未迁移）→ 阶段二再评估 pgvector
- **任务队列**: Redis + RQ（异步 ingest）
- **OCR**: 腾讯云 OCR（个人实名即可开通，免费 1000 次/月）— **MVP 必需**
- **LLM**: 现状 DeepSeek API（按 token 计价）；**目标切到云函数中转混元**（免费额度）。缺 key / 失败时降级存原文，不阻断入库
- **文件存储**: 腾讯云 COS 已封装但**前端零调用**，暂不属于必需依赖（配置面尚未清理，见"下一步"）
- **网页抓取**: httpx + BeautifulSoup + trafilatura（含 SSRF 防护）
- **鉴权**: PyJWT（HS256）+ slowapi 限流
- **部署**: systemd 托管（`wtsj-api` / `wtsj-worker`）+ nginx 反代

### 前端
- **框架**: 微信小程序原生（个人小程序无 `web-view`，必须原生）
- **页面**: 11 个（笔记列表 / 新建入口 / 我的 / 详情 / 手写编辑 / 分享出图 / 分享落地 / 分类 / 壁纸 / 语言 / 关于）
- **TabBar**: 自定义组件，支持 i18n 动态切换

## 项目结构

```
WeTuShanJi/
├── docs/
│   └── 产品需求.md            # ⭐ PRD：依赖矩阵 / MVP 减法 / 验收标准
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口 + 路由挂载
│   │   ├── api/routes/          # auth notes categories ingest shares tasks user assets
│   │   ├── services/
│   │   │   ├── scraper.py       # 公众号/网页抓取（含 SSRF 防护）
│   │   │   ├── ocr.py           # 腾讯云 OCR（TC3 签名）
│   │   │   ├── llm.py           # DeepSeek 结构化提炼（含重试 + key_usable() 占位符识别 + 降级）
│   │   │   ├── wechat.py        # access_token 缓存 + 小程序码
│   │   │   ├── storage.py       # 腾讯云 COS（前端未接入）
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
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env 填入 API keys

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

访问 http://localhost:8000/docs 查看 API 文档

### 小程序

1. 微信开发者工具导入 `miniprogram/` 目录
2. 修改 `app.js` 中的 `apiBase` 为你的后端地址
3. 编译运行

## 尚未实现

实测于 2026-09-19（旧版此段列的"搜索纳入正文 / LLM 降级 / 分享卡布局"**均已完成**，别再照那份清单干活）：

- [ ] **云函数中转混元（乙路线）** — 一行代码都还没写。落地前有 4 项必须实测，其中最硬的一条：**混元调用必须发生在云函数内部**，自建服务器直连 AI 兼容端点会导致免费额度不抵扣、改扣套餐
- [ ] **腾讯云 OCR 凭据** — `TENCENT_OCR_SECRET_ID` / `TENCENT_OCR_SECRET_KEY`，MVP 唯一还缺的 key
- [ ] **截图批处理的内存上限** — 全内存处理，单机可用内存约 2GB，OOM 风险未决策（回退落盘 / 收紧上限）
- [ ] **COS 配置面清理** — `deploy.sh` 已跳过这 4 个字段，但 `config.py`、`.env.example`、`requirements.txt`（`cos-python-sdk-v5`）三处仍留着
- [ ] 笔记列表下拉刷新（全项目无 `onPullDownRefresh`）
- [ ] 标签筛选 UI（标签目前只展示不筛选）
- [ ] SQLite FTS5 / 标签多对多关联表（规模化再评估）
- [ ] 微信 AI（小微）接入 — **本轮结论是不写任何代码**：开发模式未开放提审评测，且官方明确禁止把相关代码合入正式版。可结合的钩子记录在 PRD §8.6

## 成本估算

- **域名**: ~60 元/年
- **LLM**: 目标 **0 元**（成长计划混元 10 亿 Token，至 2027-03-19）；现状若继续用 DeepSeek 约 5-15 元/月（300 篇/月）
- **OCR**: 腾讯云免费 1000 次/月，超出自建 PaddleOCR
- **云开发**: 待确认是免费体验版还是 19.9 元/月；**不开按量付费**，超配额时系统直接限制使用而非扣费
- **服务器**: 已有，0 元
- **总计**: 目标 **≈ 60 元/年**（域名）+ 0 元增量。前提：混元只从云函数内调用、不开按量付费

## 关键决策记录

- **数据库**: SQLite（当前实况；旧版记录的"已迁移 PostgreSQL"**未生效**，MVP 阶段判定为不必迁）
- **提炼路线**: **乙 = 云函数中转混元**（吃成长计划免费额度）。丙（DeepSeek）已实现且已支持降级，保留为可一行配置切回的兜底，**验证完成前不删**；甲（端侧提炼）不做
- **OCR**: 提为 **MVP 必需**（个人小程序无法用微信自带 OCR，唯一可行路径是腾讯云）
- **语音**: **整体下线**。旧版记录的"腾讯云 ASR `SentenceRecognition`（60 秒上限）"已作废，代码已删除
- **海外站点**: **明确不支持**。服务器出海超时（`en.wikipedia.org` ConnectTimeout），抓取失败给可读文案
- **文件存储**: COS 已封装但前端零调用 → 不进 MVP，从配置面移除
- **LLM 定位**: DeepSeek 只负责"提炼"，语音下线后全项目仅 **2 个调用点**（`ingest_tasks.py:25` URL、`:65` 截图），**不是功能地基**；已改为可选 + 自动降级
- **视频号解析**: 元宝 cookie 法（非官方接口，个人自用可接受）；匿名抓取实测只能拿到空壳，故整体延后
- **部署**: systemd 托管，禁止 `pkill` + `nohup`（曾与 systemd 抢进程导致 5,966 次崩溃重启）
- **账号主体**: `wx4416d1283b5de721`（图麦笔记，个人主体），与水印项目独立。**注意**：这条 2026-09-19 下午曾被判为"已核对"而实际核对到了另一个号上，晚间才真核对完成

## 下一步

见 [`docs/产品需求.md` §8 Release Approach](docs/产品需求.md)（v2.1 已重排，旧版"S0′ 零 key 抢先提审"作废）。摘要：

1. **补腾讯云 OCR 两个 key**（用户侧动作）→ 同时把缺 key 时的截图入口置灰 + 文案做掉；前置是先定内存方案
2. **云函数最小验证**（echo 函数 + 单次混元调用）→ 确认超时上限、HTTP 网关是否可用、扣的是哪份额度
3. 验证通过才把提炼切到乙路线；不通过则丙转为长期方案
4. **提审前用户侧三件事**：request 合法域名加 `https://api.agentsbin.cn`、《隐私保护指引》只需相册、确认最新版本号与提交范围

## License

MIT
