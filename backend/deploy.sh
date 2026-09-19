#!/bin/bash
# 微图闪记后端部署脚本（在服务器上执行）
#
# 本地上传：cd /Users/zlfmac/Documents/WeTuShanJi/backend && ./upload.sh
# 服务器部署：ssh agentsbin && cd /home/ubuntu/wtsj-backend && ./deploy.sh
#
# 不用 set -e：本脚本大量依赖「命令返回非零」来判断状态，交由函数显式返回。
set -uo pipefail

PROJECT_DIR="/home/ubuntu/wtsj-backend"
VENV_DIR="$PROJECT_DIR/.venv"
API_PORT=8000
START_TS=$(date +%s)

cd "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/run"

echo "=== 微图闪记后端部署 ==="
echo "项目目录: $PROJECT_DIR"

source "$VENV_DIR/bin/activate"

# 只认「工作目录属于本项目」的进程。
# 旧版按命令行文本 pkill（"python3 worker.py" / "uvicorn app.main:app"），有两个后果：
#   1) 匹配不到以 .venv/bin/rq worker default 启动的 worker —— 旧 worker 长期不死，
#      与新 worker 同时消费 default 队列，任务随机跑到修改前的陈旧代码上；
#   2) 串扰到同机水印项目的 uvicorn --port 8080，pkill 报 Operation not permitted，
#      且 pgrep 返回多个 PID 使「✓ 已启动」成为假阳性。
OUR_PATTERN='uvicorn app.main:app|rq worker|worker\.py'

our_pids() {
    local pattern="${1:-$OUR_PATTERN}" pid cwd
    for pid in $(pgrep -f "$pattern" 2>/dev/null); do
        cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)
        [[ "$cwd" == "$PROJECT_DIR" ]] && printf '%s\n' "$pid"
    done
}

proc_is_new() {
    # /proc/<pid> 目录的 mtime 即进程启动时刻
    local st
    st=$(stat -c %Y "/proc/$1" 2>/dev/null) || return 1
    [[ "$st" -ge "$START_TS" ]]
}

stop_services() {
    echo ""
    echo ">>> 停止旧服务..."
    local pids
    pids=$(our_pids)
    if [[ -z "$pids" ]]; then
        echo "  无运行中的本项目进程"
        return 0
    fi
    echo "  TERM → $(tr '\n' ' ' <<<"$pids")"
    kill -TERM $pids 2>/dev/null
    for _ in $(seq 1 20); do
        sleep 1
        pids=$(our_pids)
        [[ -z "$pids" ]] && { echo "  已全部优雅退出"; return 0; }
    done
    echo "  超时未退出，KILL → $(tr '\n' ' ' <<<"$pids")"
    kill -KILL $pids 2>/dev/null
    sleep 1
    [[ -z "$(our_pids)" ]]
}

check_one() {
    # 断言：该服务恰好 1 个进程，且是本次新起的
    local label="$1" pattern="$2" pids count pid
    pids=$(our_pids "$pattern")
    if [[ -z "$pids" ]]; then
        echo "✗ $label 未运行"
        return 1
    fi
    count=$(grep -c . <<<"$pids")
    if (( count > 1 )); then
        echo "✗ $label 存在 $count 个重复进程：$(tr '\n' ' ' <<<"$pids")（会有任务被旧代码消费）"
        return 1
    fi
    pid="$pids"
    if ! proc_is_new "$pid"; then
        echo "✗ $label PID $pid 早于本次部署启动 —— 代码没有真正更新，进程未被重启"
        return 1
    fi
    echo "✓ $label  PID $pid  启动于 $(ps -o lstart= -p "$pid" 2>/dev/null | xargs)"
    return 0
}

echo ""
echo ">>> 启动前状态检查"
if [[ -n "$(our_pids)" ]]; then
    echo "  发现旧进程：$(tr '\n' ' ' <<<"$(our_pids)")"
fi

stop_services || { echo "✗ 旧进程未能全部停止，终止部署（否则新旧代码会并存）"; exit 1; }

echo ""
echo ">>> 启动 uvicorn (端口 $API_PORT)..."
nohup uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT" \
    --proxy-headers --forwarded-allow-ips=127.0.0.1 > uvicorn.log 2>&1 &
echo $! > run/uvicorn.pid

echo ">>> 启动 rq worker..."
nohup python3 worker.py > worker.log 2>&1 &
echo $! > run/worker.pid

sleep 4

echo ""
echo ">>> 验证服务（按 cwd + 启动时刻确认，不只看进程名）..."
DEPLOY_OK=0
check_one "API   " 'uvicorn app.main:app' || DEPLOY_OK=1
check_one "WORKER" 'rq worker|worker\.py' || DEPLOY_OK=1

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$API_PORT/docs" || echo 000)
if [[ "$HTTP_CODE" == "200" ]]; then
    echo "✓ API HTTP $HTTP_CODE (/docs)"
else
    echo "✗ API HTTP $HTTP_CODE —— 请查看 uvicorn.log"
    DEPLOY_OK=1
fi

echo ""
echo ">>> 配置自检（只报有无，不打印任何明文密钥）..."
python <<'PY'
from app.core.config import settings as s

REQUIRED = {
    "WECHAT_APP_ID": "微信登录",
    "WECHAT_APP_SECRET": "微信登录",
    "DEEPSEEK_API_KEY": "LLM 知识提取（三条主链路都要）",
    "TENCENT_OCR_SECRET_ID": "截图 OCR",
    "TENCENT_OCR_SECRET_KEY": "截图 OCR",
    "TENCENT_ASR_SECRET_ID": "语音转写",
    "TENCENT_ASR_SECRET_KEY": "语音转写",
}
OPTIONAL = {
    "COS_SECRET_ID": "COS 素材存储",
    "COS_SECRET_KEY": "COS 素材存储",
    "COS_REGION": "COS 素材存储",
    "COS_BUCKET": "COS 素材存储",
}

missing = sorted(f"{k} → {v}" for k, v in REQUIRED.items() if not getattr(s, k, ""))
opt_missing = sorted(k for k in OPTIONAL if not getattr(s, k, ""))

print(f"  数据库类型: {s.DATABASE_URL.split('://')[0]}")
if missing:
    print(f"  !! 缺失 {len(missing)} 项必需配置，对应功能在生产环境【完全不可用】：")
    for m in missing:
        print(f"     - {m}")
else:
    print("  ✓ 必需配置齐全")
if opt_missing:
    print(f"  · 未配置的可选能力: {', '.join(opt_missing)}（小程序码/素材上传/分享图会失败）")
PY

echo ""
if [[ "$DEPLOY_OK" -eq 0 ]]; then
    echo "=== 部署完成：进程已确认重启，新代码已生效 ==="
else
    echo "=== 部署异常：请查看 uvicorn.log / worker.log ==="
fi
echo "日志: $PROJECT_DIR/uvicorn.log | $PROJECT_DIR/worker.log"
exit "$DEPLOY_OK"
