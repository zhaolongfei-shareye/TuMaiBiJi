#!/bin/bash
# 微图闪记后端部署脚本
# 用法: ./deploy.sh
# 在 agentsbin 服务器上执行

set -e  # 遇错即停

# ====== 配置区 ======
PROJECT_DIR="/home/ubuntu/WeTuShanJi/backend"  # 替换为实际路径
VENV_DIR="$PROJECT_DIR/.venv"
LOG_DIR="$PROJECT_DIR/logs"

# 服务进程名（用于 pkill）
UVICORN_NAME="uvicorn app.main:app"
WORKER_NAME="python3 worker.py"

# ====== 准备 ======
echo "=== 微图闪记后端部署 ==="
echo "项目目录: $PROJECT_DIR"

# 创建日志目录（如不存在）
mkdir -p "$LOG_DIR"

# 进入项目目录
cd "$PROJECT_DIR"

# ====== 拉取代码 ======
echo ""
echo ">>> 拉取最新代码..."
git pull origin master

# ====== 激活虚拟环境 ======
echo ""
echo ">>> 激活虚拟环境..."
source "$VENV_DIR/bin/activate"

# ====== 停止旧服务 ======
echo ""
echo ">>> 停止旧服务..."
pkill -f "$UVICORN_NAME" || true
pkill -f "$WORKER_NAME" || true
sleep 2

# ====== 启动 uvicorn ======
echo ""
echo ">>> 启动 uvicorn..."
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/uvicorn.log" 2>&1 &
sleep 3

# ====== 启动 rq worker ======
echo ""
echo ">>> 启动 rq worker..."
nohup python3 worker.py > "$LOG_DIR/rq_worker.log" 2>&1 &
sleep 2

# ====== 验证服务 ======
echo ""
echo ">>> 验证服务..."

# 检查 uvicorn 进程
if pgrep -f "$UVICORN_NAME" > /dev/null; then
    echo "✓ uvicorn 已启动 (PID: $(pgrep -f "$UVICORN_NAME"))"
else
    echo "✗ uvicorn 启动失败，请检查 $LOG_DIR/uvicorn.log"
    exit 1
fi

# 检查 worker 进程
if pgrep -f "$WORKER_NAME" > /dev/null; then
    echo "✓ rq worker 已启动 (PID: $(pgrep -f "$WORKER_NAME"))"
else
    echo "✗ rq worker 启动失败，请检查 $LOG_DIR/rq_worker.log"
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
    echo "请检查 $LOG_DIR/uvicorn.log"
    exit 1
fi

# ====== 完成 ======
echo ""
echo "=== 部署完成 ==="
echo "uvicorn 日志: $LOG_DIR/uvicorn.log"
echo "worker 日志:  $LOG_DIR/rq_worker.log"
echo ""
echo "常用命令:"
echo "  查看 uvicorn 日志: tail -f $LOG_DIR/uvicorn.log"
echo "  查看 worker 日志:  tail -f $LOG_DIR/rq_worker.log"
echo "  重启服务:          ./deploy.sh"
