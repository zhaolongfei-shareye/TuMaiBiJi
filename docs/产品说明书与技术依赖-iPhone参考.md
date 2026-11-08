# 图麦笔记 · 产品说明书与技术依赖（iPhone 版参考）

> 整理日期：2026-10-05
> 用途：为 iPhone 原生版开发提供完整产品功能清单、技术架构、数据模型、接口契约与设计规范参考。

---

## 一、产品定位

图麦笔记是一款**链接/截图转知识笔记**工具。用户粘贴网页链接、上传截图或手动输入文字，系统自动提炼标题、摘要、要点与标签，以卡片形式呈现，支持分享、私密管理与多种视觉模板。

**核心差异点：**
- 一键从 URL / 截图 / 文字生成结构化笔记（标题 + 摘要 + 要点 + 标签）
- 10 种卡片模板，视觉表现力强
- 分享落地页带二维码，可直接被他人导入为自己的笔记
- 私密笔记分类，6 位 PIN 锁 + 服务端闸门
- 四套莫兰迪壁纸主题，界面随主题变色

---

## 二、功能清单（按页面）

### 2.1 新建页（create）— TabBar 第 1 格

**三种录入方式：**

| 入口 | 流程 | 后端链路 |
|---|---|---|
| 粘贴链接 | 输入 URL → 异步任务：抓取网页 → LLM 提炼 → 生成笔记 | `POST /api/ingest/url` → Redis/RQ → `process_url_task` |
| 上传截图 | 选 1~N 张图片 → 异步任务：OCR → 合并文本 → LLM 提炼 | `POST /api/ingest/screenshots/stage` + `process` → `process_screenshots_task` |
| 直接写 | 手动输入文字 → 异步任务：LLM 提炼 | `POST /api/ingest/text` → `process_manual_text_task` |

**异步任务机制：**
- 提交后返回 `task_id`，前端每 2 秒轮询 `GET /api/tasks/{task_id}`
- 最长等待 5 分钟
- 任务状态：`queued` → `processing` → `completed` / `failed`

**LLM 提炼输出（云函数 extract）：**
```json
{
  "title": "提取的标题",
  "summary": "简明摘要",
  "key_points": ["要点1", "要点2", "要点3"],
  "tags": ["标签1", "标签2"]
}
```
- 模型：腾讯混元 hy3-preview（通过微信云开发 `cloud.ai()` 调用）
- 输入上限：12000 字符（超出截断）
- Temperature：0.3（低创造性、高保真）

### 2.2 笔记列表页（index）— TabBar 第 2 格

- 按分类筛选（顶部分类横滑条）
- 搜索（标题 + 摘要 + 内容全文）
- 分页加载
- 置顶笔记（`POST /api/notes/{id}/pin`）
- 卡片样式：一篇一张卡片，白底 + 细描边 + 左侧分类色块
- 底栏纯图标（无文字），选中态圆底色 = `chromeOf.sel`

### 2.3 笔记详情页（detail）

- 标题、摘要、要点列表、标签
- 原文链接（如有）
- 来源类型标识（URL / 截图 / 手写）
- 编辑、删除、分享入口
- 卡片模板切换（10 种模板实时预览）

### 2.4 我的页（me）— TabBar 第 3 格

- 外观设置（壁纸主题切换：象牙 / 天青 / 藕荷 / 雾蓝）
- 语言切换（中 / 英）
- 私密笔记密码管理（设置 / 修改 / 验证）
- 配额信息
- 关于页入口
- 账号注销

### 2.5 分享系统（share）

**创建分享：**
- 一篇笔记生成一个分享码（token）
- 快照机制：分享创建时冻结笔记内容（title / summary / tags / key_points / key_links / source_url / author_name）
- 后续编辑笔记不影响已创建的分享
- 内容安全：创建分享前调用微信 `msgSecCheck` 审核文本

**分享落地页（/share/view）：**
- 匿名可读，无需登录
- 展示快照内容 + 二维码
- "导入到我的笔记"按钮 → `POST /api/notes/from-share`（需登录）

**撤回分享：**
- `POST /api/shares/revoke` → `is_active = false`
- 落地页显示已失效

### 2.6 私密笔记

- 判据：分类名为"私密"的那一格
- 服务端闸门：未解锁时不返回正文 / 摘要
- 6 位数字 PIN，服务端存 hash（`private_password_hash`）
- 解锁后发 `X-Private-Token` 头，有效期 15 分钟（`PRIVATE_UNLOCK_MINUTES`）
- 私密笔记不能创建分享
- 修改私密状态时会关活码
- 分类格内有笔记时禁止删除该分类

### 2.7 卡片模板系统（10 种）

**Classic 组（4 种）：**
1. `card` / 玉版宣 — 经典卡片
2. `quote` / 摘句 — 金句摘录
3. `block` / 叠翠 — 色块堆叠
4. `letter` / 素宣信笺 — 信纸风格

**Bold 组（6 种）：**
5. `popGrid` / 波普分格
6. `popDots` / 网点漫画
7. `acid` / 荧光渐变
8. `cover` / 杂志封面
9. `lit` / 纸间文艺
10. `spec` / 规格卡

**架构（三层）：**
- **L1 Op 层**：10 种操作原语（fill / grad / rrect / text / circle / line / dots / image / avatar / radial），封闭集
- **L2 原语层**：fitTitle / wrapBody / cjkText 等排版函数，封闭集
- **L3 Recipe 层**：每个模板 = 一份 JSON 配方，声明用哪些 Op + 参数 → 前端 Canvas 渲染

**热更新设计：**
- 模板数据存数据库 `poster_templates` 表，`recipe` 字段为 JSON
- 客户端拉取远端模板列表，校验 `min_app_version` 后渲染
- 新增模板只需服务端写记录 + 前端发版（如果新 Op 不需要）
- P0 阶段：证明 10 种现有模板可完全用 Recipe 等价表达
- P1 阶段：第 11 种模板纯通过服务端记录添加

### 2.8 分类管理（categories）

- 增删改查 + 拖拽排序
- 每个分类有 name + color
- 颜色来自 `palette.js` 的 5 TONES：芥黄 / 宝蓝 / 橘 / 草绿 / 紫 + 未分类=墨黑
- "私密"分类受保护（有笔记时不能删）

### 2.9 壁纸 / 外观（wallpaper）

**四套莫兰迪主题：**
1. 象牙（tint-paper）
2. 天青（tint-celadon）
3. 藕荷（tint-blush）
4. 雾蓝（gradient-blue）

每套主题 5 阶色阶，用于界面元素着色。
配色唯一来源：`utils/palette.js`。

---

## 三、技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│  微信小程序（当前）/ iPhone App（规划）                │
│  11 页面，自定义 tabBar，Canvas 海报引擎，i18n        │
│  API 客户端 → https://api.agentsbin.cn/wtsj          │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + JWT Bearer
┌──────────────────────▼──────────────────────────────┐
│  FastAPI 后端（Python 3.10+）                        │
│  8 路由组，~25 接口                                   │
│  认证：微信 code → openid → JWT                       │
│  限流：slowapi                                        │
│  内容安全：微信 msgSecCheck                            │
├─────────────────────────────────────────────────────┤
│  异步管线（Redis + RQ）                               │
│  ingest → 抓取/OCR → LLM 提炼 → 创建笔记             │
├─────────────────────────────────────────────────────┤
│  PostgreSQL（生产）/ SQLite（开发）                    │
│  8 模型：User, Note, Category, Share, Asset,          │
│  Job, Invitation, PosterTemplate                      │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  微信云函数：extract                                  │
│  混元 LLM → 结构化提炼（title / summary /             │
│  key_points / tags）                                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 前端技术栈（小程序）

| 项 | 选型 |
|---|---|
| 框架 | 微信小程序原生（WXML + WXSS + JS） |
| 渲染 | Canvas 2D（海报 / 卡片模板） |
| 状态管理 | 页面级 data + 全局 app.globalData |
| 网络 | wx.request 封装（utils/api.js），JWT 自动刷新 |
| 国际化 | utils/i18n.js（中 / 英双语） |
| 配色 | utils/palette.js（单一真相源） |
| 海报引擎 | utils/poster.js（~2148 行，10 模板 + Recipe 系统） |

### 3.3 后端技术栈

| 项 | 选型 | 版本 |
|---|---|---|
| Web 框架 | FastAPI | 0.115.0 |
| ORM | SQLAlchemy | 2.0.36 |
| 数据库迁移 | Alembic | 1.14.0 |
| 数据库 | PostgreSQL（生产）/ SQLite（开发） | — |
| 任务队列 | Redis + RQ | redis 8.1.0 / rq 2.12.0 |
| 网页抓取 | httpx + BeautifulSoup4 + trafilatura | — |
| OCR | RapidOCR（自托管，无需 API Key） | 3.9.2 |
| LLM | 腾讯混元 hy3-preview（云函数调用） | — |
| 认证 | PyJWT（HS256，7 天有效期） | — |
| 限流 | slowapi | — |
| 图片处理 | Pillow + qrcode | — |
| 内容安全 | 微信 msgSecCheck | — |
| 数据校验 | Pydantic v2 | 2.9.2 |

### 3.4 云函数

| 函数 | 用途 | 依赖 |
|---|---|---|
| `extract` | LLM 文本提炼 | wx-server-sdk ≥ 4.0.1 |

**云函数调用链路：**
后端 → `POST https://hunyuan.cf.url` → 云函数 → `cloud.ai()` → 混元模型 → 返回结构化 JSON

---

## 四、数据模型

### 4.1 User（用户）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| openid | str | 微信唯一 ID（**绝不暴露给客户端**） |
| session_key | str | 微信会话密钥 |
| nickname | str | 昵称 |
| avatar_url | str | 头像 |
| language | str | 语言偏好（zh / en） |
| wallpaper | str | 壁纸主题 key |
| quota_bonus | int | 配额奖励 |
| invited_by | int | 邀请人 user_id |
| generation | int | 代际（邀请链深度） |
| private_password_hash | str | 私密笔记 PIN hash |

### 4.2 Note（笔记）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| user_id | int | FK → User |
| title | str | 标题 |
| summary | str | 摘要 |
| tags | JSON | 标签数组 |
| key_points | JSON | 要点数组 |
| key_links | JSON | 关键链接数组 |
| content | str | 提炼后内容 |
| original_content | str | 原始输入内容 |
| source_type | str | 来源类型（url / screenshot / text） |
| source_url | str | 原始 URL |
| imported_from | JSON | 分享导入来源追踪 |
| category_id | int | FK → Category |
| cover_asset_id | int | FK → Asset |
| is_pinned | bool | 是否置顶 |
| pinned_at | datetime | 置顶时间 |
| version | int | 乐观锁版本号 |

### 4.3 Category（分类）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| user_id | int | FK → User |
| name | str | 分类名 |
| color | str | 颜色 key |
| sort_order | int | 排序权重 |

### 4.4 Share（分享）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| user_id | int | FK → User |
| note_id | int | FK → Note |
| token | str | 唯一分享令牌（**对外用 token，不用自增 ID**） |
| title / summary / tags / key_points / key_links | — | **快照字段**（创建时冻结） |
| author_name | str | 作者名（快照） |
| cover_asset_id | int | FK → Asset |
| is_active | bool | 是否有效 |
| expires_at | datetime | 过期时间 |

**约束：** 同一笔记只能有一个活跃分享（partial unique index）。

### 4.5 Asset（资源）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| user_id | int | FK → User |
| object_key | str | 存储路径 |
| file_type | str | 文件类型 |
| file_size | int | 文件大小 |
| width / height | int | 图片尺寸 |

### 4.6 Job（异步任务）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| user_id | int | FK → User |
| job_type | str | 任务类型 |
| status | str | queued / processing / completed / failed |
| stage | str | 当前阶段 |
| input_data | JSON | 输入参数 |
| result_data | JSON | 结果数据 |
| error_message | str | 错误信息 |
| note_id | int | FK → Note（完成后关联） |
| idempotency_key | str | 幂等键 |

### 4.7 Invitation（邀请）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| inviter_id | int | FK → User（邀请人） |
| invitee_id | int | FK → User（被邀请人） |
| source_note_id | int | FK → Note（来源笔记） |
| reward | int | 奖励值 |

**约束：**
- 每篇笔记只给第一个导入者奖励（partial unique index）
- 每对邀请人-被邀请人只能有一次导入

### 4.8 PosterTemplate（海报模板）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 主键 |
| template_id | str | 模板标识（如 "card" / "popGrid"） |
| label / label_en | str | 中 / 英文名 |
| group_key | str | 分组（classic / bold） |
| sort_order | int | 排序 |
| recipe | JSON | **配方数据**（L3 层声明式定义） |
| status | str | draft / live / archived |
| min_app_version | str | 最低客户端版本 |
| content_hash | str | 内容哈希（防重复） |

**约束：** 同一 `template_id` 只能有一个 `status=live` 的版本。

---

## 五、API 接口清单

### 5.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/wechat` | 微信登录/注册（code + inviter?） |

**认证机制：**
- 客户端发 `code` → 后端换 `openid` → 查/建用户 → 发 JWT
- JWT 有效期 7 天（`JWT_EXPIRE_MINUTES=10080`）
- 所有后续请求带 `Authorization: Bearer <token>`
- 401 时客户端自动重登一次

### 5.2 笔记

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notes/` | 列表（分页 + 分类筛选 + 搜索） |
| GET | `/api/notes/{id}` | 详情 |
| POST | `/api/notes/` | 手动创建 |
| PUT | `/api/notes/{id}` | 更新 |
| POST | `/api/notes/{id}/pin` | 切换置顶 |
| DELETE | `/api/notes/{id}` | 删除 |
| POST | `/api/notes/from-share` | 从分享导入 |

### 5.3 录入（异步）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ingest/url` | 提交 URL 抓取任务 |
| POST | `/api/ingest/text` | 提交文本提炼任务 |
| POST | `/api/ingest/screenshots/stage` | 上传截图（多张） |
| POST | `/api/ingest/screenshots/process` | 提交截图 OCR 任务 |

### 5.4 任务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tasks/{task_id}` | 轮询任务状态 |

### 5.5 分类

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/categories/` | 列表 |
| POST | `/api/categories/` | 创建 |
| PUT | `/api/categories/{id}` | 更新 |
| POST | `/api/categories/reorder` | 排序 |
| DELETE | `/api/categories/{id}` | 删除（"私密"有笔记时拒绝） |

### 5.6 分享

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/shares/` | 创建分享（含内容安全审核） |
| GET | `/api/shares/status` | 查询笔记的分享状态 |
| POST | `/api/shares/revoke` | 撤回分享 |
| GET | `/api/shares/{token}` | 公开落地页（匿名可读） |
| GET | `/api/shares/{token}/qrcode` | 生成二维码图片 |

### 5.7 用户

| 方法 | 路径 | 说明 |
|---|---|---|
| PUT | `/api/user/wallpaper` | 设置壁纸主题 |
| GET | `/api/user/wallpaper/options` | 可选壁纸列表 |
| PUT | `/api/user/language` | 设置语言 |
| GET | `/api/user/quota` | 配额信息 |
| POST | `/api/user/inviter` | 绑定邀请人 |
| PUT | `/api/user/private-password` | 设置私密 PIN |
| GET | `/api/user/private-password` | 检查是否已设 PIN |
| POST | `/api/user/private-password/verify` | 验证 PIN（成功返回 unlock token） |
| POST | `/api/user/private-password/reset` | 重置 PIN |
| POST | `/api/user/deactivate` | 注销账号 |

### 5.8 海报模板

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/poster/templates/` | 获取在线模板列表（只读） |

---

## 六、设计规范

### 6.1 配色体系

**唯一真相源：** `utils/palette.js`

**5 TONES（分类色）：**
- 芥黄（mustard）
- 宝蓝（royal）
- 橘（orange）
- 草绿（grass）
- 紫（purple）
- 未分类 = 墨黑（ink）

**4 PAPERS（莫兰迪壁纸）：**
- 炭蓝（charcoal blue）
- 雾蓝（mist blue）
- 灰绿（grey green）
- 荷灰（lotus）

**4 THEMES（界面主题）：**
- 象牙（tint-paper）
- 天青（tint-celadon）
- 藕荷（tint-blush）
- 雾蓝（gradient-blue）

每套主题 5 阶色阶，用于按钮、选中态、背景等。

**海报配色（6 族）：**
- pop / neon / riso / mono / spec / lime

**WCAG 对比度：** `enforce()` 函数自动校验前景/背景对比度，不达标则调整。

### 6.2 界面规范

**导航条：**
- 背景色 `#f4f2ec`（宣纸色）
- 标题"图麦笔记"
- 高度按微信规范

**底栏（自定义 tabBar）：**
- 3 格：新建 / 笔记 / 我的
- 纯图标（无文字）
- 选中态：圆底 + 图标，圆底色 = `chromeOf.sel`
- 未选中：灰色图标

**卡片样式：**
- 白底 + 细描边
- 左侧分类色块（2~3rpx 宽）
- 一篇一张卡片
- 圆角统一

**按钮：**
- 深色实心按钮底色 = 底栏选中态圆底色
- 次要按钮：描边 + 透明底

**字体：**
- 中文：系统默认
- 英文装饰：Poppins Thin（仅 LOGO 区域）

### 6.3 品牌色锚点

- 宣纸色 `#F2EFE9`（`--paper`）
- 墨色 `#14161A`（`--ink`）
- 陶土色 `#D2683F`（`--clay`）
- 现网"墨黑" `#23252C`（偏冷蓝，实际用）

---

## 七、平台能力与限制

### 7.1 已确认的平台事实

| 能力 | 状态 | 说明 |
|---|---|---|
| 微信 OCR | ❌ 不可得 | 个人主体返回 101003 |
| 自托管 OCR | ✅ 在用 | RapidOCR，无需 API Key |
| 混元 LLM | ✅ 在用 | 云函数 `cloud.ai()`，免费 Token 包到期 2027-03-18 |
| DeepSeek | ❌ 已删 | 只用混元 |
| msgSecCheck | ✅ 已接入 | 个人主体可用，未上架 100 次/天，静默 fail-open |
| HEIC 支持 | ❌ 不支持 | 只处理 JPEG/PNG |
| 语音功能 | ❌ 已下线 | — |
| 海外支持 | ❌ 不支持 | — |

### 7.2 微信云开发额度

- 混元 Token：10 亿免费包，到期 **2027-03-18 15:22:52**
- 云函数调用：按资源点计费（1000 点 = 1 元，13.3 点/万次）
- 已实证扣免费 Token 包（76,248/10 亿已用）

### 7.3 内容安全（msgSecCheck）

- 必须送原样 UTF-8 字节体（httpx 的 `json=` 会转义中文导致误判）
- 未上架只有 100 次/天配额
- 打光后静默 fail-open（不阻断）
- 个人主体可用

---

## 八、当前版本状态

| 项 | 值 |
|---|---|
| AppID | `wx4416d1283b5de721` |
| 线上版本 | 1.5.0 |
| 开发版本 | 1.9.26（体验版，未提审） |
| 后端 API | `https://api.agentsbin.cn/wtsj` |
| 数据库 | PostgreSQL（生产） |
| 服务器 | 101.33.202.178（SSH alias: agentsbin） |

---

## 九、iPhone 版开发要点

### 9.1 可复用资产

- **后端 API 完全复用**：所有 25+ 接口无需改动，iPhone 客户端只需替换 base URL
- **数据模型完全复用**：8 张表结构不变
- **设计规范复用**：配色体系（palette.js 逻辑可移植到 Swift）、界面规范、品牌色
- **海报引擎需重写**：小程序 Canvas → iOS Core Graphics / Metal，但 Recipe 数据格式（JSON）可复用

### 9.2 需要重写的部分

| 模块 | 小程序实现 | iPhone 建议方案 |
|---|---|---|
| UI 框架 | WXML + WXSS | SwiftUI |
| 网络层 | wx.request 封装 | URLSession / Alamofire |
| 认证 | wx.login → code → JWT | 需替代登录方案（见下） |
| 海报渲染 | Canvas 2D | Core Graphics / Metal |
| OCR | 后端 RapidOCR | 可继续走后端，或接入 Vision.framework |
| LLM | 云函数 cloud.ai() | 继续走后端 API 中转 |
| 图片上传 | wx.uploadFile | URLSession uploadTask |
| 分享 | 微信原生分享 + 落地页 | UIActivityViewController + 落地页 |

### 9.3 登录方案（待决策）

小程序走微信 code 换 openid，iPhone 需要替代方案：

**选项 A：微信开放平台登录（推荐）**
- 接入微信 OpenSDK，走 OAuth 授权
- 后端复用 openid 体系，用户无感迁移
- 需要申请微信开放平台移动应用

**选项 B：Apple ID 登录**
- Sign in with Apple
- 需要新增 Apple ID → User 映射
- 与小程序用户体系不互通

**选项 C：手机号 + 验证码**
- 接入短信服务商
- 与小程序用户体系不互通

### 9.4 图片云备份（已规划）

方案 A 已拍：
- 微信云开发前端直传（小程序）
- iPhone 版需替代方案：CloudKit / 自建 COS / 阿里云 OSS
- 压缩阈值 ≤ 500KB
- 缩略图 + 大图双尺寸
- 5GB 起步存储

### 9.5 关键注意事项

1. **JWT 认证机制不变**：所有 API 调用带 `Authorization: Bearer <token>`
2. **私密笔记闸门**：未解锁时后端不返回正文/摘要，iPhone 客户端需实现同样的 PIN 验证流程
3. **内容安全**：分享创建前仍需调用后端做内容审核（后端调 msgSecCheck）
4. **配色移植**：`palette.js` 的 5 TONES + 4 THEMES + 海报 6 族配色需移植为 Swift 常量
5. **海报 Recipe JSON 格式不变**：iPhone 端只需实现 L1/L2 渲染层，L3 数据可复用
6. **异步任务轮询机制不变**：2 秒间隔，5 分钟超时
7. **国际化**：保留中/英双语支持

---

## 十、文件结构参考

### 小程序目录

```
miniprogram/
├── app.js / app.json / app.wxss
├── pages/
│   ├── create/        # 新建笔记
│   ├── index/         # 笔记列表
│   ├── me/            # 我的
│   ├── detail/        # 笔记详情
│   ├── write/         # 手动编辑
│   ├── share/         # 分享创建 + 落地页
│   ├── categories/    # 分类管理
│   ├── wallpaper/     # 壁纸选择
│   ├── profile/       # 个人资料
│   └── about/         # 关于
├── utils/
│   ├── api.js         # API 客户端（JWT + 自动重登）
│   ├── palette.js     # 配色体系（唯一真相源）
│   ├── poster.js      # 海报引擎（~2148 行）
│   ├── i18n.js        # 国际化
│   ├── privateGate.js # 私密笔记闸门
│   └── ...
└── components/        # 自定义组件
```

### 后端目录

```
backend/
├── app/
│   ├── main.py        # FastAPI 入口
│   ├── routes/        # 8 路由组
│   ├── models/        # 8 数据模型
│   ├── services/      # 业务逻辑
│   ├── core/          # 配置、认证、限流
│   └── tasks/         # 异步任务
├── alembic/           # 数据库迁移
├── requirements.txt
└── .env.example
```

### 云函数

```
cloudfunctions/
└── extract/
    ├── index.js       # LLM 提炼逻辑
    └── package.json
```

---

## 十一、联系方式与资源

- **官网**：https://agentsbin.cn
- **API 基址**：https://api.agentsbin.cn/wtsj
- **GitHub 仓库**：TuMaiBiJi（私有）
- **微信小程序 AppID**：wx4416d1283b5de721

---

*本文档基于小程序 v1.9.26（开发版）/ v1.5.0（线上版）整理，所有事实均经代码或现网实测验证。*
