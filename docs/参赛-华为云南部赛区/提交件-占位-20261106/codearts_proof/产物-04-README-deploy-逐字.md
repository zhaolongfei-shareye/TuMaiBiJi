# 图麦笔记 — 部署与运行步骤

> 本文件只描述操作步骤，不写任何真实密钥、账号、AppID、服务器地址或内网 IP。
> 凡未从仓库读到的具体值一律标 **「待核对」**。

## 0. 角色与环境

| 项 | 值 | 来源 |
|---|---|---|
| 后端框架 | FastAPI | 仓库实测 |
| 后端代码目录 | `backend/` | 仓库实测 |
| 脚本位置 | `install.sh`、`deploy.sh`、`upload.sh`、`backup.sh` 均在 `backend/` 下 | 仓库实测 |
| 开发机 | macOS（Apple Silicon），Python 3.13 | 实测 |
| 部署服务器 | Ubuntu 22.04，Python 3.10.12 | 实测 |
| 虚拟环境 | `backend/.venv/bin/python` | 实测 |
| 进程托管 | systemd，两个确定单元 `wtsj-api`、`wtsj-worker` | 实测 |
| 第三个单元 `wtsj-backend` | 是否真实存在 | **待核对** |
| 仓库内 unit 文件 | 不含 `.service` 文件；`deploy.sh` 仅对已存在的 `wtsj-api`/`wtsj-worker` 做 `systemctl restart` | 仓库实测 |
| API 入口 | `app.main:app`（`backend/app/main.py` 第 29 行 `app = FastAPI(title=图麦笔记 API, version=0.1.0)`） | 仓库实测 |
| API 端口 | 8000（`backend/deploy.sh` 第 17 行 `API_PORT=8000`） | 仓库实测 |
| 网侧 ExecStart | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1` | 仓库实测 |
| 图片存储 | 微信云开发存储 | 项目背景 |
| AI 提炼 | 微信云函数 | 项目背景 |

## 1. 本地开发（macOS）

### 1.1 一键安装
```bash
chmod +x backend/install.sh
backend/install.sh
```
脚本会：判系统 → 检 python3 ≥ 3.10 → 检 venv → 建虚拟环境 → 按 `backend/requirements.txt` 装依赖 → 生成 `backend/.env`（占位符）→ 跑 `pytest` 并念出通过条数。任一步失败均非零退出并给出原因。

### 1.2 填配置
编辑 `backend/.env`，按文件内注释逐项填入真实值（10 键）。完整 33 键模板见 `backend/.env.example`，含 `HUNYUAN_CF_`、`IMAGE_STORE_CF_`、`SEC_CHECK_`、`EXTRACT_`、`MP_ASSETS_` 前缀键及 `ROAMMARK_APP_GATE`、`SHARE_QR_ENV_VERSION`、`APPLE_CLIENT_ID`、`ADMIN_EXCHANGE_SECRET`、`ADMIN_SESSION_MINUTES`、`PRIVATE_UNLOCK_MINUTES`、`EXTRACT_PROVIDER` 等。`.env.example` 中 23 个多出键的完整键名 **待核对**。

关键键的代码默认值（出处 `backend/app/core/config.py`）：
- `CORS_ORIGINS` 默认 `*`（第 83 行）
- `JWT_EXPIRE_MINUTES` 默认 `10080`（即 60×24×7，7 天，第 86 行）
- `DATABASE_URL` 默认空串，空值直接抛错「DATABASE_URL 未配置」（第 12、183–185 行）；`.env.example` 实测值为 `sqlite:///./tmbj.db`，测试用例钉 `sqlite:////tmp/tumaibiji_pytest.db`。本地与模板这一档是 SQLite；生产是否用 PostgreSQL **待核对**（`requirements` 含 `psycopg2-binary` 仅说明支持，不等于现网在用）。

### 1.3 起服务
```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload
```
入口 `app.main:app` 与端口 8000 均为仓库实测（见第 0 节）。本地 `--reload` 默认监听 `127.0.0.1:8000`。

### 1.4 跑测试
```bash
cd backend
.venv/bin/python -m pytest tests/ -q
```
用例目录 `backend/tests/`（实测）。条数由 pytest 实时输出，不写死。

### 1.5 验证服务活着
```bash
curl -i http://127.0.0.1:8000/docs
```
期望 HTTP 200 返回 Swagger UI 页面。专用健康检查路径（如 `/healthz`）**待核对**。

## 2. 网侧部署（Ubuntu 22.04）

### 2.1 上传代码
仓库自带 `backend/upload.sh`，整树上传（具体 `rsync`/`scp` 命令 **待核对**）。
```bash
backend/upload.sh
```

### 2.2 执行部署脚本
```bash
backend/deploy.sh
```
`deploy.sh` 实测执行顺序（行号为现场读数）：

| 行号 | 动作 | 性质 |
|---|---|---|
| 17 | `API_PORT=8000` | 配置 |
| 24 | 打印标题 | 日志 |
| 37 | 写 `DEPLOY_STAMP.txt` | 部署印记 |
| 46 | `compileall` 语法检查 | **闸门 1** |
| 57 | `python -c "import app.main"` 入口 import 检查 | **闸门 2** |
| 77 | 系统库预检 `libGL` / `libglib` | **闸门 3** |
| 92 | 重启前先做数据库快照 | 保护动作 |
| 110 | `alembic current` → `alembic upgrade head` | **闸门 4** |
| 325 | 卡片模板配方表与种子（写库需 `POSTER_TEMPLATES=1`，默认只读） | 数据初始化 |
| 432 | 自建 OCR 预检（独立进程，内存 789.8MB，上限 816–826MB，断言含 `OCR` 与 `123`） | **闸门 5** |
| 481 | `systemctl show -p MainPID` 后重启 systemd | 动作 |

**五道自检闸门**归纳为：① compileall 语法 ② 入口 import ③ 系统库 libGL/libglib ④ alembic 迁移 ⑤ OCR 内存预检。若你的"五道"口径与此不同，以你的口径为准，本表 **待核对**。

任一闸门失败，`deploy.sh` 应非零退出且不重启 systemd（具体失败行为 **待核对**）。

### 2.3 重启 systemd 两个单元
**unit 已在服务器上存在**：仓库内不含 `.service` 文件，`deploy.sh` 与 `install.sh` 均不创建 unit、也不修改 unit 文件。`deploy.sh` 第 481 行仅对已存在的 `wtsj-api`、`wtsj-worker` 执行 `systemctl restart`。

`deploy.sh` 第 481 行已内置重启。如需手动重启：
```bash
sudo systemctl restart wtsj-api
sudo systemctl restart wtsj-worker
sudo systemctl status wtsj-api wtsj-worker --no-pager
```
单元 `wtsj-api`（API 服务）与 `wtsj-worker`（任务队列 worker，配合 redis/rq）为实测确定。网侧 ExecStart 实读为 `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1`。`wtsj-backend` 字符串曾在脚本出现，是否为独立单元 **待核对**。

### 2.4 回滚
`deploy.sh` 第 92 行在重启前做了数据库快照；仓库另有 `backend/backup.sh`（具体行为 **待核对**）。回滚建议步骤（**具体回滚脚本未在仓库读到，以下为建议，待核对**）：
1. 用第 92 行快照（或 `backup.sh` 产物）恢复数据库；
2. `cd backend && .venv/bin/alembic downgrade <上一版本号>`（版本号 **待核对**）；
3. 回退代码到上一稳定提交（`git checkout <prev-tag>` 或 `upload.sh` 传旧版整树）；
4. `sudo systemctl restart wtsj-api wtsj-worker`；
5. 跑 2.5 验证。

### 2.5 网侧验证服务活着
```bash
sudo systemctl is-active wtsj-api wtsj-worker
curl -i http://127.0.0.1:8000/docs
```
期望两个单元均为 `active`，curl 返回 200。专用健康检查路径 **待核对**。

## 3. 必须由项目所有者本人操作的步骤

以下动作涉及平台账号与人工审核，**不可脚本化、不可自动化**，必须由项目所有者本人在微信后台手动完成：

| 动作 | 在哪做 | 谁能做 |
|---|---|---|
| 小程序提审 | 微信公众平台 mp.weixin.qq.com → 版本管理 → 提交审核 | 所有者本人 |
| 设体验版/正式版 | 微信公众平台 → 版本管理 | 所有者本人 |
| 点发布上线 | 微信公众平台 → 审核通过后点发布 | 所有者本人 |
| 配置 AppID/AppSecret | 微信公众平台 → 开发管理 → 开发设置 | 所有者本人（写入服务器 `.env`，勿提交仓库） |
| 配置合法域名/白名单 | 微信公众平台 → 开发管理 → 服务器域名 | 所有者本人 |
| 云函数部署 | 微信开发者工具 → 云开发 → 云函数 | 所有者本人 |
| 云存储开通 | 微信开发者工具 → 云开发 → 存储 | 所有者本人 |

任何脚本（含 `install.sh`、`deploy.sh`、`upload.sh`、`backup.sh`）均不得、也不能代为执行以上步骤。

## 4. 待核对清单（汇总）

- `wtsj-backend` 是否为第三个 systemd 单元
- `upload.sh`、`backup.sh` 的具体命令与行为
- `deploy.sh` 五道闸门的确切口径与失败行为
- 回滚的具体脚本/步骤
- 专用健康检查路径（如 `/healthz`）
- `.env.example` 中 23 个多出键的完整键名
- 生产环境 `DATABASE_URL` 是否为 PostgreSQL
- 各依赖包许可证最终值（见 `OPEN-SOURCE-LICENSES.md`）
