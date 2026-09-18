#!/bin/bash
# 微图闪记后端部署脚本（在服务器上执行）
# 前置步骤：本地先执行上传命令（见下方）
#
# 本地上传命令：
#   cd /Users/zlfmac/Documents/WeTuShanJi
#   tar czf /tmp/wtsj-backend.tar.gz \
#     --exclude='.venv' --exclude='*.db' --exclude='logs' \
#     --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
#     backend/
#   scp /tmp/wtsj-backend.tar.gz agentsbin:/tmp/
#   ssh agentsbin "cd /home/ubuntu && tar xzf /tmp/wtsj-backend.tar.gz && rm /tmp/wtsj-backend.tar.gz"
#
# 然后在服务器执行本脚本：
#   ssh agentsbin
#   cd /home/ubuntu/wtsj-backend
#   ./deploy.sh

set -e  # 遇错即停

# ====== 配置区 ======
PROJECT_DIR="/home/ubuntu/wtsj-backend"
VENV_DIR="$PROJECT_DIR/.venv"

# 服务进程名（用于 pkill）
UVICORN_VENV="uvicorn app.main:app"
UVICORN_SYSTEM="python3.11 /usr/local/bin/uvicorn"
WORKER_NAME="python3 worker.py"

# ====== 准备 ======
echo "=== 微图闪记后端部署 ==="
echo "项目目录: $PROJECT_DIR"

# 进入项目目录
cd "$PROJECT_DIR"

# ====== 激活虚拟环境 ======
echo ""
echo ">>> 激活虚拟环境..."
source "$VENV_DIR/bin/activate"

# ====== 停止旧服务 ======
echo ""
echo ">>> 停止旧服务..."

# 停止 venv uvicorn（端口 8000）
if pgrep -f "$UVICORN_VENV" > /dev/null; then
    echo "  停止 venv uvicorn (端口 8000)..."
    pkill -f "$UVICORN_VENV" || true
fi

# 停止系统 uvicorn（端口 8080，残留进程）
if pgrep -f "$UVICORN_SYSTEM" > /dev/null; then
    echo "  停止系统 uvicorn (端口 8080，残留)..."
    pkill -f "$UVICORN_SYSTEM" || true
fi

# 停止 worker
if pgrep -f "$WORKER_NAME" > /dev/null; then
    echo "  停止 rq worker..."
    pkill -f "$WORKER_NAME" || true
fi

sleep 2

# ====== 启动 uvicorn ======
echo ""
echo ">>> 启动 uvicorn (端口 8000)..."
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1 > uvicorn.log 2>&1 &
sleep 3

# ====== 启动 rq worker ======
echo ""
echo ">>> 启动 rq worker..."
nohup python3 worker.py > worker.log 2>&1 &
sleep 2

# ====== 验证服务 ======
echo ""
echo ">>> 验证服务..."

# 检查 uvicorn 进程
if pgrep -f "$UVICORN_VENV" > /dev/null; then
    echo "✓ uvicorn 已启动 (PID: $(pgrep -f "$UVICORN_VENV"))"
else
    echo "✗ uvicorn 启动失败，请检查 uvicorn.log"
    exit 1
fi

# 检查 worker 进程
if pgrep -f "$WORKER_NAME" > /dev/null; then
    echo "✓ rq worker 已启动 (PID: $(pgrep -f "$WORKER_NAME"))"
else
    echo "✗ rq worker 启动失败，请检查 worker.log"
    exit 1
fi

# 检查 HTTP 响应
echo ""
echo ">>> 测试 HTTP 接口..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ HTTP 服务正常 (状态码: $HTTP_CODE)"
else
    echo "✗ HTTP 服务异常 (状态码: $HTTP_CODE)"
    echo "请检查 uvicorn.log"
    exit 1
fi

# ====== 完成 ======
echo ""
echo "=== 部署完成 ==="
echo "uvicorn 日志: $PROJECT_DIR/uvicorn.log"
echo "worker 日志:  $PROJECT_DIR/worker.log"
echo ""
echo "常用命令:"
echo "  查看 uvicorn 日志: tail -f $PROJECT_DIR/uvicorn.log"
echo "  查看 worker 日志:  tail -f $PROJECT_DIR/worker.log"
echo "  重启服务:          ./deploy.sh"
