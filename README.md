# 微图闪记

微信小程序 + FastAPI 后端，将截图/链接自动提取为结构化笔记，构建个人知识库。

## 项目概述

**核心功能**：粘贴公众号文章链接或上传截图 → 自动提取内容 → LLM 生成摘要和要点 → 存入个人知识库

**MVP 范围（阶段一）**：
- ✅ 粘贴公众号 URL → 抓取正文
- ✅ 上传截图（多图）→ OCR 识别
- ✅ LLM 提取结构化笔记（标题/摘要/要点/标签）
- ✅ 笔记列表、详情、删除
- ⏳ 标签筛选、全文搜索（阶段二）

**后续规划**：
- 阶段二：B站视频（字幕提取）、视频号（元宝解析法）
- 阶段三：抖音/小红书（签名对抗）、语义搜索

## 技术栈

### 后端
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite（MVP）→ PostgreSQL + pgvector（阶段二）
- **OCR**: 腾讯云 OCR（免费 1000 次/月）/ PaddleOCR 自建
- **LLM**: DeepSeek API（~0.01-0.05 元/篇）
- **网页抓取**: httpx + BeautifulSoup + trafilatura

### 前端
- **框架**: 微信小程序原生
- **页面**: 笔记列表 / 创建笔记 / 笔记详情

## 项目结构

```
WeTuShanJi/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── api/routes/          # API 路由
│   │   │   ├── notes.py         # 笔记 CRUD
│   │   │   └── ingest.py        # 内容导入（URL/截图）
│   │   ├── services/            # 业务逻辑（待实现）
│   │   │   ├── ocr.py           # OCR 服务
│   │   │   ├── scraper.py       # 公众号文章抓取
│   │   │   └── llm.py           # LLM 摘要
│   │   ├── models/note.py       # 数据模型
│   │   ├── db/database.py       # SQLite 连接
│   │   └── core/config.py       # 配置
│   ├── requirements.txt
│   └── .env.example
└── miniprogram/
    ├── pages/
    │   ├── index/               # 笔记列表
    │   ├── create/              # 创建笔记
    │   └── detail/              # 笔记详情
    ├── utils/api.js             # API 调用封装
    ├── app.js / app.json / app.wxss
    └── sitemap.json
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

## 待实现（阶段一）

### 后端服务层
- [ ] `services/scraper.py`: 公众号文章抓取（httpx + trafilatura）
- [ ] `services/ocr.py`: 腾讯云 OCR 集成
- [ ] `services/llm.py`: DeepSeek API 调用，结构化输出
- [ ] `api/routes/ingest.py`: 完善 URL/截图导入逻辑

### 数据库
- [ ] 笔记全文搜索（SQLite FTS5）
- [ ] 标签关联表（多对多）

### 小程序
- [ ] 笔记列表下拉刷新、上拉加载
- [ ] 标签筛选 UI
- [ ] 搜索功能

## 成本估算

- **域名**: ~60 元/年
- **LLM API**: ~5-15 元/月（300 篇/月）
- **OCR**: 腾讯云免费 1000 次/月，超出自建 PaddleOCR
- **服务器**: 已有，0 元
- **总计**: < 20 元/月

## 关键决策记录

- **数据库**: SQLite（MVP 简单够用）→ PostgreSQL（阶段二迁移，支持语义检索）
- **视频号解析**: 元宝 cookie 法（非官方接口，个人自用可接受）
- **ASR**: 自建 SenseVoice-Small（中文快准，CPU 可跑）

## 下一步

1. 实现 `services/scraper.py`（公众号文章抓取）
2. 实现 `services/ocr.py`（腾讯云 OCR）
3. 实现 `services/llm.py`（DeepSeek 结构化输出）
4. 完善 `api/routes/ingest.py` 导入逻辑
5. 端到端测试：粘贴 URL → 生成笔记 → 展示

## License

MIT
