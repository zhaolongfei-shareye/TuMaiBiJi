# 图麦笔记 iPhone 原生版 · 产品需求文档（PRD）

> 版本：1.0
> 日期：2026-10-05
> 状态：待评审
> 参考文档：`产品说明书与技术依赖-iPhone参考.md`

---

## 1. 背景与目标

### 1.1 为什么做 iPhone 版

图麦笔记当前以微信小程序为载体（线上 v1.5.0，开发版 v1.9.26），已验证核心链路：链接/截图/文字 → LLM 提炼 → 结构化笔记 → 卡片模板 → 分享。

iPhone 原生版的动机：
- **性能天花板**：小程序 Canvas 渲染 10 种海报模板已接近 2148 行代码极限，复杂模板（波普分格、网点漫画）在低端机卡顿
- **系统能力释放**：iOS Vision.framework 本地 OCR、Live Text、Share Extension、Spotlight 索引、Widget、Shortcuts
- **用户画像扩展**：小程序用户偏轻量，iPhone 版面向重度知识管理用户，愿意为体验付费
- **商业化空间**：App Store 订阅制，不受小程序虚拟支付限制
- **增长机制**：邀请奖励系统（代际追踪），通过分享裂变获取新用户

### 1.2 产品定位

**一句话**：链接/截图/文字一键变结构化笔记，10 种卡片模板让知识好看又好分享。

**与小程序的关系**：
- 共享同一后端 API（`https://api.agentsbin.cn/wtsj`），数据互通
- 功能集对齐小程序 v1.9.26，不超前不缩减
- iPhone 版独立用户体系（登录方案待决策），但可通过 openid 关联小程序账号
- 数据模型完全复用（8 张表：User / Note / Category / Share / Asset / Job / Invitation / PosterTemplate）
- 设计规范完全复用（配色体系 / 界面规范 / 品牌色）

### 1.3 成功指标

| 指标 | 目标 | 时间窗 |
|---|---|---|
| TestFlight 可用 | 核心链路跑通（录入→列表→详情→分享） | MVP 发布后 2 周 |
| App Store 上架 | 通过审核，无 P0 阻断 | MVP 后 4 周 |
| 7 日留存 | ≥ 30% | 上架后 30 天 |
| 付费转化 | ≥ 3% 用户订阅 | 上架后 60 天 |
| 邀请转化 | ≥ 10% 用户邀请至少 1 人 | v1.1 发布后 60 天 |

---

## 2. 用户与场景

### 2.1 目标用户

| 角色 | 描述 | 核心需求 |
|---|---|---|
| 知识收集者 | 日常浏览大量文章/视频，需要剪藏 | 一键从 URL 提炼，分类管理 |
| 视觉笔记用户 | 喜欢把笔记做成好看的卡片发社交媒体 | 10 种模板，导出高清图片 |
| 重度笔记用户 | 笔记量大，需要私密管理和快速检索 | 私密 PIN 锁、全文搜索、置顶 |

### 2.2 核心场景

**场景 A：文章剪藏**
1. 用户在 Safari 看到一篇好文章
2. 通过 Share Extension 或复制 URL 打开 App
3. App 自动抓取 + LLM 提炼 → 生成标题/摘要/要点/标签
4. 用户选择分类，保存

**场景 B：截图提炼**
1. 用户在别的 App 截了几张图（聊天记录、论文、PPT）
2. 打开 App，选图上传
3. OCR + LLM 提炼 → 结构化笔记
4. 选模板，生成卡片，分享到微信/微博

**场景 C：私密管理**
1. 用户有敏感笔记（密码、财务、私人想法）
2. 移到"私密"分类，设 6 位 PIN
3. 查看时需验证 PIN，15 分钟自动锁定
4. 私密笔记不能分享

**场景 D：邀请裂变**
1. 用户 A 觉得 App 好用，生成邀请链接分享给朋友 B
2. 用户 B 通过链接注册，自动绑定邀请关系
3. 用户 B 创建首篇笔记后，用户 A 获得配额奖励
4. 系统追踪代际（A 邀请 B，B 邀请 C，则 A 是 1 代，C 是 2 代）

---

## 3. 功能范围

### 3.1 MVP（v1.0）— 必须交付

| 模块 | 功能 | 验收标准 |
|---|---|---|
| **登录** | 替代微信 code 登录 | 用户能注册/登录，拿到 JWT，后续 API 正常调用 |
| **新建笔记** | 三种录入方式（URL / 截图 / 文字） | 提交后 2 秒轮询，5 分钟内返回结构化结果 |
| **手动编辑页** | 纯文字输入 → LLM 提炼（区别于"新建"的三入口） | 独立页面，支持长文本输入，提炼后跳转详情 |
| **笔记列表** | 分页 + 分类筛选 + 搜索 | 下拉刷新 + 上拉加载更多，搜索命中标题/摘要/内容 |
| **笔记详情** | 展示 title / summary / key_points / tags / 原文链接 / 来源标识 | 字段完整，来源类型标识正确，支持模板切换预览 |
| **编辑笔记** | 修改标题/摘要/要点/标签/分类/封面图 | 保存后列表实时刷新，乐观锁防冲突 |
| **删除笔记** | 带确认弹窗 | 删除后列表移除 |
| **置顶** | 切换置顶状态 | 置顶笔记排在最前 |
| **分类管理** | 增删改查 + 排序 | "私密"分类有笔记时禁止删除 |
| **分享创建** | 完整流程：选封面图 → 编辑作者名 → 生成二维码 → 分享面板 | 支持微信好友/朋友圈/保存相册，快照内容不随笔记编辑变化 |
| **分享撤回** | 撤回已创建的分享 | 落地页显示已失效 |
| **导入分享** | 从 token 导入笔记 | 登录后一键导入，去重 |
| **私密笔记** | PIN 设置/验证/重置，服务端闸门 | 未解锁时后端不返回正文/摘要，15 分钟自动锁定 |
| **个人资料** | 编辑昵称/头像 | 保存后"我的"页实时刷新 |
| **配额显示** | "我的"页显示剩余配额 | 调用 `GET /api/user/quota`，实时刷新 |
| **关于页** | 版本信息/隐私政策/用户协议/联系方式 | 独立页面，链接可点击 |
| **壁纸主题** | 4 套主题切换 | 界面颜色随主题变化 |
| **国际化** | 中/英双语 | 系统语言跟随，可手动切换 |
| **海报模板** | 10 种模板渲染 + 导出图片 | 与小程序视觉效果一致 |
| **图片处理** | HEIC 自动转 JPEG + 压缩 ≤ 500KB | 上传前客户端处理，后端不接 HEIC |
| **账号注销** | 一键注销 | 清除所有数据，JWT 失效 |

### 3.2 v1.1 — 体验增强

| 功能 | 说明 |
|---|---|
| Share Extension | Safari / 相册直接分享到 App，自动触发 URL/截图录入 |
| Spotlight 索引 | 笔记内容可被系统搜索 |
| Widget | 桌面小组件：最近笔记 / 快速新建 |
| 推送通知 | 异步任务完成通知（提炼完成、OCR 完成） |
| 深色模式 | 跟随系统 or 手动切换 |
| 邀请奖励 | 邀请好友注册 + 首篇笔记奖励，代际追踪 |
| 离线浏览 | SwiftData 本地缓存，无网时可浏览已加载笔记 |

### 3.3 v1.2 — 商业化

| 功能 | 说明 |
|---|---|
| 订阅制 | 免费层（10 篇/月）+ Pro（不限量 + 高级模板） |
| StoreKit 2 | 订阅管理、退款处理、权益判定 |
| 图片云备份 | iCloud Drive / 自建 COS，压缩 ≤ 500KB |
| 高级模板 | 5 种 Pro 专属模板（服务端下发，客户端按 `min_app_version` 过滤） |

### 3.4 不做（负面清单）

| 项 | 原因 |
|---|---|
| 语音录入 | 小程序已下线，iPhone 版不恢复 |
| HEIC 处理 | 客户端转 JPEG 后上传，后端不接 HEIC |
| 海外支持 | 暂不考虑，LLM 服务在国内 |
| 社交功能 | 不做关注/Feed/评论，只做一对一分享 |
| iPad 适配 | v1.x 只做 iPhone，iPad 等 v2.0 |
| Apple Watch | 不在路线图 |

---

## 4. 技术架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│  iPhone App（SwiftUI + Core Graphics）               │
│  11 页面，自定义 TabView，海报引擎，i18n              │
│  API 客户端 → https://api.agentsbin.cn/wtsj          │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + JWT Bearer
                       │（与小程序共享后端，零改动）
┌──────────────────────▼──────────────────────────────┐
│  FastAPI 后端（已有，不动）                            │
│  8 路由组，~25 接口                                   │
│  认证：JWT（新增 iPhone 登录路由 or 复用微信路由）      │
│  限流 / 内容安全 / 异步管线                            │
├─────────────────────────────────────────────────────┤
│  PostgreSQL + Redis + 云函数（已有，不动）              │
└─────────────────────────────────────────────────────┘
```

### 4.2 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| UI 框架 | SwiftUI（iOS 16+） | 声明式，适配多尺寸，生态主流 |
| 架构模式 | MVVM + Observable | SwiftUI 原生支持，状态管理清晰 |
| 网络层 | URLSession + async/await | 系统原生，无第三方依赖 |
| 本地存储 | SwiftData | 笔记缓存 + 离线浏览 |
| 海报渲染 | Core Graphics + Metal | 性能优于 Canvas，支持复杂渐变/混合 |
| OCR | Vision.framework（本地） | 免费、快速、隐私友好；后端 RapidOCR 作为降级 |
| 图片处理 | Core Image | 系统原生，压缩/缩放/格式转换 |
| 登录 | 微信 OpenSDK（推荐） | 复用 openid 体系，用户无感迁移 |
| 推送 | APNs | 系统原生 |
| 分析 | 自建（后端埋点） | 不接第三方 SDK |

### 4.3 后端改动（最小化）

| 改动 | 说明 | 优先级 |
|---|---|---|
| 新增 `/api/auth/apple` 路由 | Apple ID 登录（如果选方案 B） | P0 |
| 或新增 `/api/auth/wechat-mobile` | 微信 OpenSDK 登录（如果选方案 A） | P0 |
| 图片上传接口适配 | 当前走微信云开发直传，iPhone 需走后端 COS 签名 | P1 |
| 推送 token 注册 | `POST /api/user/push-token` | P1 |
| 邀请链接生成 | `POST /api/user/invite-link`（生成带 inviter 参数的注册链接） | P1 |
| 订阅状态接口 | `GET /api/user/subscription` | P2 |

**原则：后端改动 ≤ 5 个新路由，不动现有 25 个接口的契约。**

### 4.4 数据模型（客户端本地）

```swift
// SwiftData 模型，用于离线缓存
@Model
class LocalNote {
    let id: Int
    var title: String
    var summary: String
    var tags: [String]
    var keyPoints: [String]
    var categoryID: Int?
    var isPinned: Bool
    var version: Int  // 乐观锁，编辑时带版本号
    var updatedAt: Date
    // ... 与后端 Note 模型字段对齐
}
```

### 4.5 关键技术细节

**乐观锁（编辑冲突）：**
- 后端 Note 模型有 `version` 字段
- 客户端编辑时携带当前 version，PUT 请求体含 `version: Int`
- 服务端校验 version 一致才更新，否则返回 409 Conflict
- 客户端提示"已被他人修改，请刷新"

**幂等键（防重复提交）：**
- 后端 Job 模型有 `idempotency_key` 字段
- 客户端提交 ingest 任务时生成 UUID 作为 key
- 服务端相同 key 的任务只创建一次，防止网络重试导致重复

**HEIC 转换：**
- iOS 拍照/截图默认 HEIC 格式
- 客户端上传前用 `UIImage.jpegData(compressionQuality: 0.8)` 转 JPEG
- 压缩阈值 ≤ 500KB，超出则降低 quality 或缩放尺寸
- 后端不接 HEIC，只处理 JPEG/PNG

---

## 5. 设计规范

### 5.1 配色移植

小程序 `palette.js` → Swift `Palette.swift`，保持完全一致：

```swift
enum Tone: String, CaseIterable {
    case mustard, royal, orange, grass, purple, ink
    
    var color: Color {
        switch self {
        case .mustard: return Color(hex: "#C8A96E")
        case .royal: return Color(hex: "#4A6FA5")
        case .orange: return Color(hex: "#D2683F")
        case .grass: return Color(hex: "#6B8E6F")
        case .purple: return Color(hex: "#8B6BAE")
        case .ink: return Color(hex: "#23252C")
        }
    }
}

enum Theme: String, CaseIterable {
    case paper = "tint-paper"      // 象牙
    case celadon = "tint-celadon"  // 天青
    case blush = "tint-blush"      // 藕荷
    case blue = "gradient-blue"    // 雾蓝
}
```

### 5.2 界面规范

**导航栏：**
- 背景：`#F2EFE9`（宣纸色）
- 标题：系统字体 17pt semibold
- 大标题：34pt bold（iOS 标准）

**底栏（TabView）：**
- 3 格：新建 / 笔记 / 我的
- 自定义图标（SF Symbols 不够用）
- 选中态：填充色 = `chromeOf.sel`
- 未选中：灰色 `#8E8E93`

**卡片：**
- 背景：白色
- 描边：0.5pt `#E5E5E5`
- 圆角：12pt
- 左侧分类色块：3pt 宽，颜色 = `toneFor(category.color)`

**按钮：**
- 主要按钮：背景 = `chromeOf.sel`，文字白色，圆角 8pt
- 次要按钮：背景透明，描边 1pt `chromeOf.sel`，文字 `chromeOf.sel`

**字体：**
- 中文：PingFang SC（系统默认）
- 英文：SF Pro（系统默认）
- LOGO 装饰：Poppins Thin（内嵌字体文件）

### 5.3 动效

| 场景 | 动效 | 时长 |
|---|---|---|
| 页面转场 | 系统默认 push/pop | — |
| 卡片点击 | 缩放 0.98 + 透明度 0.9 | 150ms |
| 下拉刷新 | 系统 RefreshControl | — |
| 模板切换 | 交叉淡入 | 300ms |
| 置顶切换 | 弹簧动画 | 400ms |

---

## 6. 登录方案决策

### 6.1 三个选项

| 方案 | 优点 | 缺点 | 成本 |
|---|---|---|---|
| **A. 微信 OpenSDK** | 复用 openid，用户无感迁移；小程序/iPhone 数据互通 | 需申请微信开放平台移动应用（审核 1-2 周）；用户必须装微信 | 后端 +1 路由 |
| **B. Apple ID** | 系统原生，体验流畅；App Store 审核友好 | 与小程序用户体系不互通；需新增 apple_id → user 映射 | 后端 +1 路由 + 新表 |
| **C. 手机号** | 用户覆盖面广，不依赖第三方 | 需接短信服务商（成本）；与小程序不互通 | 后端 +2 路由 + 短信服务 |

### 6.2 建议

**推荐方案 A（微信 OpenSDK）**，理由：
- 现有用户可无缝迁移到 iPhone 版
- 后端改动最小（只加一个路由，复用 `login_or_register` 逻辑）
- 微信开放平台移动应用审核虽慢但一次性

**备选方案 A+B 并行**：
- 微信登录为主，Apple ID 为辅
- 后端新增 `/api/auth/apple`，首次登录创建新用户 or 绑定已有 openid
- App Store 审核要求：如果提供了第三方登录，必须同时提供 Apple ID 登录

---

## 7. 海报引擎移植

### 7.1 现状

小程序海报引擎 `utils/poster.js`（~2148 行）：
- 10 种模板，分 Classic / Bold 两组
- 三层架构：L1 Op（10 种原语）→ L2 排版函数 → L3 Recipe JSON
- Canvas 2D 渲染，支持渐变、圆角矩形、文字换行、二维码贴纸

### 7.2 iPhone 移植方案

**L1 Op 层 → Core Graphics / Metal：**

| Op | 小程序实现 | iPhone 实现 |
|---|---|---|
| fill | `ctx.setFillStyle` + `fillRect` | `CGContext.fill` |
| grad | `createLinearGradient` | `CGGradient` |
| radial | `createRadialGradient` | `CGGradient`（径向） |
| rrect | `fillRect` + 圆角 | `CGPath.addRoundedRect` |
| text | `fillText` | `CTLineDraw` / `TextRenderer`（iOS 18+） |
| circle | `arc` + `fill` | `CGPath.addEllipse` |
| line | `moveTo` + `lineTo` + `stroke` | `CGContext.stroke` |
| dots | 循环画圆点 | 循环 `CGPath.addEllipse` |
| image | `drawImage` | `CGContext.draw(image)` |
| avatar | 圆形裁剪 + 图片 | `CGContext.clipToCircle` + 图片 |

**L2 排版函数 → Core Text：**
- `fitTitle`：`CTFramesetter` 自适应字号
- `wrapBody`：`CTFramesetter` + 行距控制
- `cjkText`：标点挤压 + 避头尾

**L3 Recipe JSON → 完全复用：**
- 后端 `poster_templates.recipe` 字段不变
- iPhone 客户端拉取 JSON，解析为 `Recipe` 结构体，驱动 L1/L2 渲染

### 7.3 导出图片

```swift
func exportPoster(template: PosterTemplate, note: Note) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1080, height: 1350))
    return renderer.image { ctx in
        renderRecipe(template.recipe, in: ctx.cgContext, note: note)
    }
}
```

输出 1080×1350（4:5 竖图，适合社交媒体）。

---

## 8. 非功能需求

### 8.1 性能

| 指标 | 目标 |
|---|---|
| 冷启动 | ≤ 1.5 秒（iPhone 12 及以上） |
| 笔记列表滚动 | 60fps，无掉帧 |
| 海报渲染 | ≤ 500ms（单张） |
| API 响应 | ≤ 300ms（P95） |
| 内存占用 | ≤ 150MB（后台） |

### 8.2 兼容性

| 项 | 要求 |
|---|---|
| 最低 iOS | 16.0 |
| 设备 | iPhone（不含 iPad） |
| 屏幕尺寸 | iPhone SE ~ iPhone 16 Pro Max |
| 语言 | 中文（简体）/ 英文 |
| 网络 | Wi-Fi / 蜂窝，支持弱网（3G 降级） |

### 8.3 安全

| 项 | 要求 |
|---|---|
| JWT 存储 | Keychain，不存 UserDefaults |
| PIN hash | 服务端 bcrypt，客户端不存明文 |
| 私密笔记 | 未解锁时不缓存正文/摘要到本地 |
| 网络 | 全 HTTPS，ATS 强制 |
| 隐私 | 不采集设备信息，不接第三方 SDK |

### 8.4 可访问性

| 项 | 要求 |
|---|---|
| VoiceOver | 所有按钮/卡片有 accessibilityLabel |
| 动态字体 | 支持 XXL，不截断 |
| 对比度 | WCAG AA（4.5:1），`enforce()` 函数保证 |
| 动效 | 支持"减弱动态"系统设置 |

### 8.5 错误处理与降级

| 场景 | 策略 |
|---|---|
| LLM 提炼失败 | 重试 1 次（`retryable: true`），仍失败则提示用户稍后重试 |
| OCR 失败 | 降级到后端 RapidOCR，仍失败则提示图片不清晰 |
| 网络超时 | 30 秒超时，提示检查网络，支持手动重试 |
| 任务 5 分钟未完成 | 自动取消，提示"处理时间过长，请稍后查看" |
| 图片上传失败 | 压缩后重试 1 次，仍失败则提示网络问题 |
| 编辑冲突 | 乐观锁（`version` 字段），冲突时提示"已被他人修改，请刷新" |
| 重复提交 | 幂等键（`idempotency_key`），防止重复创建任务 |
| JWT 过期 | 401 时自动刷新 token，刷新失败则跳转登录页 |

---

## 9. 里程碑与排期

### 9.1 MVP（v1.0）— 8 周

| 周 | 任务 | 交付物 |
|---|---|---|
| W1 | 工程搭建 + 登录方案落地 + 网络层封装 | Xcode 工程 + 登录流程 + JWT 管理 + 幂等键生成 |
| W2 | 笔记列表 + 详情 + 手动编辑页 | 分页/搜索/筛选/置顶 + 详情完整字段 + 纯文字录入 |
| W3 | 新建笔记（三种录入）+ 图片处理 | URL/截图/文字 → 异步任务 + HEIC 转 JPEG + 压缩 |
| W4 | 分类管理 + 编辑/删除 + 封面图 | CRUD + 排序 + 私密保护 + 封面选择 + 乐观锁 |
| W5 | 分享系统完整流程 + 私密 PIN | 选封面/编辑作者名/生成二维码/分享面板 + PIN 验证 |
| W6 | 个人资料 + 配额显示 + 关于页 | 昵称头像编辑 + 配额实时刷新 + 版本/协议/隐私 |
| W7 | 海报引擎（Core Graphics） | 10 模板渲染 + 导出图片 + 错误处理（LLM/OCR/网络） |
| W8 | 壁纸主题 + i18n + 联调 + 测试 | 4 主题 + 中英双语 + 全链路测试 + 性能优化 |

### 9.2 v1.1 — 4 周（MVP 后）

| 周 | 任务 |
|---|---|
| W9 | Share Extension + Spotlight + 邀请奖励系统 |
| W10 | Widget + 推送通知 + 离线浏览 |
| W11 | 深色模式 + 动效打磨 |
| W12 | TestFlight 公测 + 修 bug |

### 9.3 v1.2 — 4 周（商业化）

| 周 | 任务 |
|---|---|
| W13 | StoreKit 2 订阅 + 权益判定 |
| W14 | 图片云备份（iCloud / COS） |
| W15 | 高级模板（5 种 Pro 专属） |
| W16 | App Store 提审 + 上架 |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 微信开放平台审核慢 | 登录方案 A 延期 | 备选方案 B（Apple ID）先上 |
| 海报引擎移植工作量大 | MVP 延期 | 先实现 4 种 Classic 模板，Bold 组 v1.1 补 |
| App Store 审核被拒 | 上架延期 | 提前研究审核指南，私密笔记不做成"加密应用"口径 |
| 后端 API 不满足 iPhone 需求 | 需改后端 | 原则：后端改动 ≤ 3 个新路由，不动现有契约 |
| Core Graphics 性能不如预期 | 海报渲染慢 | 降级方案：Metal 渲染，或预渲染位图缓存 |
| HEIC 转换质量问题 | 图片失真 | 测试不同 compressionQuality，保留 EXIF 方向信息 |
| 乐观锁冲突频繁 | 用户体验差 | 冲突时自动拉取最新版本，合并用户修改 |
| 邀请奖励系统复杂 | 开发周期长 | v1.1 再做，MVP 不接邀请功能 |
| 离线浏览数据一致性 | 本地缓存与服务器不同步 | v1.1 再做，MVP 只做在线模式 |

---

## 11. 验收标准

### 11.1 MVP 验收（v1.0）

- [ ] 用户能注册/登录，JWT 正常刷新
- [ ] 三种录入方式（URL/截图/文字）均能生成结构化笔记
- [ ] 手动编辑页可用（纯文字输入 → 提炼）
- [ ] 笔记列表支持分页/搜索/筛选/置顶
- [ ] 笔记详情展示完整字段（含原文链接/来源标识/模板切换）
- [ ] 编辑/删除/分类管理功能完整
- [ ] 编辑笔记支持封面图选择
- [ ] 乐观锁防冲突生效
- [ ] 分享创建完整流程（选封面/编辑作者名/生成二维码/分享面板）
- [ ] 分享撤回/导入流程跑通
- [ ] 私密笔记 PIN 验证 + 服务端闸门生效（15 分钟自动锁定）
- [ ] 个人资料编辑（昵称/头像）可用
- [ ] 配额显示正确
- [ ] 关于页内容完整（版本/隐私政策/用户协议/联系方式）
- [ ] 4 套壁纸主题切换正常
- [ ] 10 种海报模板渲染 + 导出图片
- [ ] 中英双语切换正常
- [ ] 图片处理：HEIC 自动转 JPEG + 压缩 ≤ 500KB
- [ ] 幂等键防重复提交生效
- [ ] 账号注销功能可用
- [ ] 错误处理策略生效（LLM 失败/OCR 失败/网络超时/任务超时）
- [ ] 性能指标达标（冷启动 ≤ 1.5s，列表 60fps）
- [ ] 无 P0/P1 bug

### 11.2 App Store 上架验收

- [ ] 通过 Apple 审核（无 2.1 / 4.0 / 5.0 拒绝）
- [ ] 隐私政策页面上线（独立 URL，中英双语）
- [ ] 用户协议页面上线（独立 URL，中英双语）
- [ ] App 审核信息提供（测试账号 + 密码 + 演示视频）
- [ ] 年龄分级：4+（无成人内容）or 12+（私密笔记功能需声明）
- [ ] 出口合规声明（加密功能：PIN 锁需声明"使用标准加密"）
- [ ] 截图准备：6.7"（iPhone 15 Pro Max）+ 5.5"（iPhone 8 Plus）两套，各 3-5 张
- [ ] App 描述（4000 字符内）+ 关键词（100 字符内）+ 支持 URL
- [ ] 版权信息：© 2026 [公司名]
- [ ] 分类选择：效率（Productivity）or 工具（Utilities）

---

## 12. 附录

### 12.1 术语表

| 术语 | 含义 |
|---|---|
| 提炼 | LLM 从原始文本提取 title/summary/key_points/tags |
| 卡片模板 | 10 种视觉风格，用于将笔记渲染成图片 |
| Recipe | L3 层 JSON 配方，声明模板的渲染指令 |
| 快照 | 分享创建时冻结的笔记内容，后续编辑不影响分享 |
| 闸门 | 服务端对私密笔记的访问控制（未解锁不返回敏感字段） |
| 莫兰迪 | 低饱和度配色风格，4 套主题 |
| 乐观锁 | 通过 `version` 字段防止并发编辑冲突的机制 |
| 幂等键 | `idempotency_key`，防止网络重试导致重复提交任务 |
| HEIC | 苹果高效图片格式，需转 JPEG 后上传 |
| 代际 | 邀请链深度（generation 字段），追踪谁邀请了谁 |

### 12.2 参考文档

- `产品说明书与技术依赖-iPhone参考.md` — 完整功能清单 + 技术架构 + 数据模型
- `方案-卡片模板不走发版.md` — 海报引擎三层架构详解
- `配色与界面统一方案-四套莫兰迪.md` — 配色体系详解
- 小程序源码 `miniprogram/utils/poster.js` — 海报引擎参考实现
- 小程序源码 `miniprogram/utils/palette.js` — 配色体系参考实现

### 12.3 联系方式

- 产品/技术负责人：[待填]
- 设计师：[待填]
- iOS 开发：[待填]
- 后端支持：[待填]

---

*本 PRD 基于小程序 v1.9.26 功能集整理，所有功能点均已在小程序端验证可行。iPhone 版目标是原生复刻 + 体验增强，不重新发明产品。*
