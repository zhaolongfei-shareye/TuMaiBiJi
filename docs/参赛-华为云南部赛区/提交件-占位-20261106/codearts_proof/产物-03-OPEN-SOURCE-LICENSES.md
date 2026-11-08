图麦笔记 — 开源组件说明

本文件逐条列出 backend/requirements.txt 中的依赖。 许可证列：对公开且稳定声明的值写出，并标注"以包元数据为准"；拿不准的一律写 「需核对」，不凭印象编。 用途列：依据包名与项目背景（FastAPI 后端 + 微信小程序 + AI 提炼云函数 + 图片云存储）推断，未逐 import 核对，如与实际不符以代码为准。 许可证最终值请以安装后 pip show <包名> 的 License 字段及上游仓库 LICENSE 文件为准。

1. 依赖清单（逐字照抄自 backend/requirements.txt）
包名	版本约束	许可证	在本项目里的用途（推断）
fastapi	0.115.0	MIT（以包元数据为准）	Web 框架，提供 API 路由与请求/响应模型
uvicorn[standard]	0.32.0	BSD-3-Clause（以包元数据为准）	ASGI 服务器，运行 FastAPI 应用
sqlalchemy	2.0.36	MIT（以包元数据为准）	ORM，数据库模型与查询
alembic	1.14.0	MIT（以包元数据为准）	数据库迁移工具，alembic upgrade head
pydantic	2.9.2	MIT（以包元数据为准）	数据校验与序列化
pydantic-settings	2.6.1	MIT（以包元数据为准）	从 .env 加载配置
python-multipart	0.0.12	Apache-2.0（以包元数据为准）	表单/文件上传解析
httpx	0.27.2	BSD-3-Clause（以包元数据为准）	HTTP 客户端，调用外部接口（如 DeepSeek）
beautifulsoup4	4.12.3	MIT（以包元数据为准）	HTML 解析
trafilatura	1.12.2	需核对	网页正文提取（推断，配合 AI 提炼）
lxml_html_clean	0.4.2	需核对	HTML 清洗（推断，去危险标签/脚本）
redis	8.1.0	MIT（以包元数据为准）	Redis 客户端，缓存与队列后端
rq	2.12.0	BSD-3-Clause（以包元数据为准）	任务队列，配合 wtsj-worker 异步处理
Pillow	10.4.0	MIT-CMU HP（以包元数据为准）	图像处理（缩放/格式转换等）
qrcode[pil]	7.4.2	BSD-3-Clause（以包元数据为准）	二维码生成（推断，分享/登录场景）
PyJWT	2.9.0	MIT（以包元数据为准）	JWT 签发与验签（登录态）
cryptography	50.0.2	Apache-2.0 OR BSD-3-Clause（以包元数据为准）	加密原语（推断，配合 JWT/敏感字段）
slowapi	0.1.9	MIT（以包元数据为准）	API 限流
rapidocr	3.9.2	需核对	自建 OCR 引擎（deploy.sh 第 432 行预检对象）
onnxruntime	>=1.23.2,<2	MIT（以包元数据为准）	OCR 模型推理运行时
opencv-python	5.0.0.93	Apache-2.0（以包元数据为准）	图像/OCR 预处理（带 GUI，依赖 libGL）
psycopg2-binary	2.9.10	LGPL-3.0-or-later（以包元数据为准）	PostgreSQL 驱动

共 21 条。numpy 未在 requirements.txt 中钉版本（实测，非遗漏），脚本与本文档不替它补版本。

2. 已实测的依赖坑

rapidocr → opencv 缺 libGL rapidocr 依赖带 GUI 的 opencv，在无桌面 Ubuntu 22.04 上 import 时报缺 libGL.so.1。deploy.sh 第 77 行做系统库预检（libGL 与 libglib），install.sh 的 Ubuntu 分支同样预检。替代方案是换 opencv-python-headless==5.0.0.93，本项目未采用，保持 opencv-python==5.0.0.93 现值（实测）。

onnxruntime 跨版本 onnxruntime>=1.23.2,<2 在服务器 Python 3.10 上最高解出 1.23.2，本机 Python 3.13 上解出 1.30.0。同一份 requirements.txt 两端解出版本不同，属已知现象，非故障。

cryptography 50.0.2 wheel cryptography 50.0.2 有 cp39-abi3 的 manylinux2014_x86_64 wheel，服务器侧无需 Rust 编译（实测）。

3. 核对建议

安装完成后，逐包核对许可证：

cd backend
.venv/bin/python -m pip show <包名> | grep -i license


或直接查看上游仓库 LICENSE 文件。本文档标 「需核对」 的三项（trafilatura、lxml_html_clean、rapidocr）请优先核对。
