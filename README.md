# 图麦笔记

微信小程序 + FastAPI 后端，将截图/链接自动提取为结构化笔记，构建个人知识库。

## 项目概述

**核心功能**：粘贴公众号文章链接或上传截图 → 自动提取内容 → LLM 生成摘要和要点 → 存入个人知识库

> 📄 **完整产品需求、依赖矩阵与 MVP 减法结论见 [`docs/产品需求.md`](docs/产品需求.md)**。
> 本节仅为速览；两者冲突时以 `docs/产品需求.md` 为准（它逐条带 2026-09-19 的线上实测证据）。

**已实现并线上验证**（2026-09-19，零第三方凭据下 19 项接口全通）：
- ✅ 微信登录 + JWT 用户隔离（openid 不下发客户端）
- ✅ 笔记列表 / 详情 / 编辑 / 删除 / 置顶 / 搜索 / 分页
- ✅ 分类管理、手写笔记、分享图 + 小程序码、壁纸主题、多语言

**已实现但待凭据才能启用**：
- ⏳ URL 剪藏的「自动提炼」— 缺 `DEEPSEEK_API_KEY`（采集本身已实测可用）
- ⏳ 截图 OCR — 缺腾讯云 OCR 两个字段
- ⏳ 语音转写 — 缺腾讯云 ASR 两个字段
- ⚠️ 三者当前都强依赖 LLM 且**无降级**，LLM 不可用即整条任务失败（PRD §7.3 列为 P0 风险）

**后续规划**：
- 阶段二：B站视频（字幕提取）、视频号（元宝解析法）
- 阶段三：抖音/小红书（签名对抗）、语义搜索

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite（当前实况，PostgreSQL 尚未迁移）→ 阶段二再评估 pgvector
- **任务队列**: Redis + RQ（异步 ingest）
- **OCR**: 腾讯云 OCR（免费 1000 次/月）
- **ASR**: 腾讯云 ASR `SentenceRecognition`（注意 60 秒上限）
- **LLM**: DeepSeek API（~0.01-0.05 元/篇）
- **文件存储**: 腾讯云 COS 已封装但**前端零调用**，暂不属于必需依赖
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
│   │   │   ├── asr.py           # 腾讯云 ASR 一句话识别
│   │   │   ├── llm.py           # DeepSeek 结构化提炼（含重试）
│   │   │   ├── wechat.py        # access_token 缓存 + 小程序码
│   │   │   ├── storage.py       # 腾讯云 COS（前端未接入）
│   │   │   └── queue.py         # RQ 入队 + 任务状态
│   │   ├── tasks/ingest_tasks.py  # worker 侧三条链路
│   │   ├── core/                # config / auth(JWT) / rate_limit
│   │   ├── models/              # user note category share job asset
│   │   └── db/database.py
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

实测于 2026-09-19，仅保留**确实还没做**的项（旧版此段列的服务层四项其实早已完成）：

- [ ] **搜索纳入正文** —— 现仅搜 `title` + `summary`（`notes.py:87-88`），无 LLM 时等于只能按标题找。**这是当前最该补的一条**
- [ ] 笔记列表下拉刷新（全项目无 `onPullDownRefresh`）
- [ ] 标签筛选 UI（标签目前只展示不筛选）
- [ ] LLM 失败降级（现缺 key / 超时即整条任务 `failed`，不存原文）
- [ ] 分享图内容驱动布局（LLM 字段为空时会出大片空白卡）
- [ ] SQLite FTS5 / 标签多对多关联表（规模化再评估）

## 成本估算

- **域名**: ~60 元/年
- **LLM API**: ~5-15 元/月（300 篇/月）
- **OCR**: 腾讯云免费 1000 次/月，超出自建 PaddleOCR
- **ASR**: 腾讯云按量计费
- **服务器**: 已有，0 元
- **总计**: < 20 元/月（**零凭据的 S0′ 档可做到 0 元/月增量**）

## 关键决策记录

- **数据库**: SQLite（当前实况；旧版记录的"已迁移 PostgreSQL"**未生效**，MVP 阶段判定为不必迁）
- **ASR**: **腾讯云 ASR `SentenceRecognition`**（旧版记录的"自建 SenseVoice-Small"未采纳；注意 60 秒上限）
- **文件存储**: COS 已封装但前端零调用 → 不进 MVP，从配置面移除
- **LLM 定位**: DeepSeek 只负责"提炼"，全项目仅 3 个调用点，**不是功能地基**；架构上改为可选 + 自动降级
- **视频号解析**: 元宝 cookie 法（非官方接口，个人自用可接受）；匿名抓取实测只能拿到空壳，故整体延后
- **部署**: systemd 托管，禁止 `pkill` + `nohup`（曾与 systemd 抢进程导致 5,966 次崩溃重启）

## 下一步

见 [`docs/产品需求.md` §8 Release Approach](docs/产品需求.md)。摘要：

1. 不依赖任何凭据先做 4 件事：搜索纳入正文、LLM 降级、分享卡布局、移除 COS 配置
2. 以 S0′ 档提审（0 个新 key）
3. 拿到 `DEEPSEEK_API_KEY` 后填上即自动升级为 S0″，无需改代码
4. 再按 OCR / ASR 依次放开截图与语音入口

## License

MIT
