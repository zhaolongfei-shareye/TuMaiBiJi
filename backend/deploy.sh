#!/bin/bash
# 微图闪记后端部署脚本（在服务器上执行）
#
# 本地上传：cd /Users/zlfmac/Documents/WeTuShanJi/backend && ./upload.sh
# 服务器部署：ssh agentsbin && cd /home/ubuntu/wtsj-backend && ./deploy.sh
#
# 进程由 systemd 托管：wtsj-api.service / wtsj-worker.service（Restart=always, enabled）。
# 本脚本只重启 unit 并校验，绝不自己 nohup 拉进程 —— 旧版用 pkill+nohup 与 systemd
# 抢 8000 端口，导致 wtsj-api 累计 crash-loop 5966 次；同时 pkill 的文本模式匹配不到
# `rq worker default`，使旧 worker 长期不死，与新 worker 并存随机消费陈旧代码。
#
# 不用 set -e：脚本大量依赖命令返回非零来判断状态，交由函数显式返回。
set -uo pipefail

PROJECT_DIR="/home/ubuntu/wtsj-backend"
VENV_DIR="$PROJECT_DIR/.venv"
API_PORT=8000
UNITS=(wtsj-api wtsj-worker)
PUBLIC_URL="https://api.agentsbin.cn/wtsj/health"

cd "$PROJECT_DIR"
START_TS=$(date +%s)

echo "=== 微图闪记后端部署 ==="
source "$VENV_DIR/bin/activate"

RC=0

# ---- 1. 语法闸门：坏代码不要推上去，否则 systemd 会反复拉起又崩溃 ----
echo ""
echo ">>> 语法检查..."
if python -m compileall -q app > /tmp/wtsj_compile.err 2>&1; then
    echo "✓ 语法通过"
else
    echo "✗ 语法错误，终止部署（未重启服务，线上保持旧版本继续运行）"
    tail -20 /tmp/wtsj_compile.err
    exit 1
fi

# ---- 2. 记录重启前的 MainPID，用于确认「真的换了进程」----
declare -A OLD_PID
for u in "${UNITS[@]}"; do
    OLD_PID[$u]=$(systemctl show "$u" -p MainPID --value 2>/dev/null)
    [[ -z "${OLD_PID[$u]}" ]] && OLD_PID[$u]=0
done

echo ""
echo ">>> 通过 systemd 重启服务..."
for u in "${UNITS[@]}"; do
    echo "  systemctl restart $u  (旧 MainPID=${OLD_PID[$u]})"
done
if ! sudo systemctl restart "${UNITS[@]}"; then
    echo "✗ systemctl restart 失败"
    sudo journalctl -u "${UNITS[0]}" -u "${UNITS[1]}" -n 20 --no-pager | tail -20
    exit 1
fi
sleep 5

# ---- 3. 校验每个 unit：active、MainPID 是本次新起的 ----
echo ""
echo ">>> 验证服务..."
for u in "${UNITS[@]}"; do
    state=$(systemctl is-active "$u" 2>/dev/null)
    pid=$(systemctl show "$u" -p MainPID --value 2>/dev/null)
    nrs=$(systemctl show "$u" -p NRestarts --value 2>/dev/null)

    if [[ "$state" != "active" ]]; then
        echo "✗ $u 状态为 $state"
        RC=1
        continue
    fi
    if [[ -z "$pid" || "$pid" == "0" ]]; then
        echo "✗ $u 无 MainPID"
        RC=1
        continue
    fi
    st=$(stat -c %Y "/proc/$pid" 2>/dev/null)   # /proc/<pid> 的 mtime 即进程启动时刻
    if [[ -z "$st" || "$st" -lt "$START_TS" ]]; then
        echo "✗ $u MainPID=$pid 早于本次部署（代码未更新）"
        RC=1
        continue
    fi
    if [[ "$pid" == "${OLD_PID[$u]}" ]]; then
        echo "✗ $u MainPID 未变化（$pid）—— 服务实际未被重启"
        RC=1
        continue
    fi
    echo "✓ $u  active  PID $pid  NRestarts=$nrs  启动于 $(ps -o lstart= -p "$pid" 2>/dev/null | xargs)"
done

# ---- 4. 孤儿检测：本项目目录下不允许有游离于 systemd 之外的进程 ----
orphans=""
for d in /proc/[0-9]*; do
    p=${d#/proc/}
    cwd=$(readlink "$d/cwd" 2>/dev/null)
    [[ "$cwd" == "$PROJECT_DIR" ]] || continue
    cmd=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
    [[ -n "$cmd" ]] || continue
    # 命令行含 deploy.sh 的是本脚本自身的子 shell，跳过自匹配
    [[ "$cmd" == *deploy.sh* || "$cmd" == *"systemctl "* ]] && continue
    svc=$(awk -F/ '/0::/{gsub(/\.service$/,"",$NF); print $NF}' "$d/cgroup" 2>/dev/null)
    if [[ "$svc" != "wtsj-api" && "$svc" != "wtsj-worker" ]]; then
        orphans+="${p}(${svc:-非systemd}) "
    fi
done
if [[ -n "$orphans" ]]; then
    echo "✗ 发现游离进程，会与 systemd 抢端口/抢队列：$orphans"
    echo "  处理：kill -TERM ${orphans%% *}"
    RC=1
else
    echo "✓ 无游离进程（进程数与 unit 数一致）"
fi

# ---- 5. 端口归属必须是 wtsj-api 的 MainPID ----
api_pid=$(systemctl show wtsj-api -p MainPID --value 2>/dev/null)
port_pid=$(sudo ss -ltnp "sport = :$API_PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [[ -n "$port_pid" && "$port_pid" == "$api_pid" ]]; then
    echo "✓ 端口 $API_PORT 由 wtsj-api (PID $api_pid) 持有"
else
    echo "✗ 端口 $API_PORT 归属异常：监听者 PID=${port_pid:-无}，wtsj-api PID=${api_pid:-无}"
    RC=1
fi

# ---- 6. HTTP 连通 ----
code_local=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$API_PORT/docs" || echo 000)
[[ "$code_local" == "200" ]] && echo "✓ 本机 /docs HTTP $code_local" || { echo "✗ 本机 /docs HTTP $code_local"; RC=1; }
code_pub=$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_URL" || echo 000)
[[ "$code_pub" == "200" ]] && echo "✓ 公网 $PUBLIC_URL HTTP $code_pub" || { echo "✗ 公网健康检查 HTTP $code_pub"; RC=1; }

# ---- 7. 配置自检（只报有无，绝不打印明文密钥）----
echo ""
echo ">>> 配置自检..."
python <<'PY'
from app.core.config import settings as s

REQUIRED = {
    "WECHAT_APP_ID": "微信登录（小程序无法进入）",
    "WECHAT_APP_SECRET": "微信登录（小程序无法进入）",
    "DEEPSEEK_API_KEY": "LLM 知识提取（URL/截图/语音三条主链路都要）",
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

print(f"  数据库类型: {s.DATABASE_URL.split('://')[0]}")
missing = sorted(f"{v}  ← {k}" for k, v in REQUIRED.items() if not getattr(s, k, ""))
opt_missing = sorted(k for k in OPTIONAL if not getattr(s, k, ""))
if missing:
    print(f"  !! 缺失 {len(missing)} 项必需配置，对应功能在生产环境【完全不可用】：")
    for m in missing:
        print(f"     - {m}")
    print("  !! 因此本次部署【不能】宣称核心功能已验证 —— 需先在 .env 补齐并重启。")
else:
    print("  ✓ 必需配置齐全")
if opt_missing:
    print(f"  · 未配置的可选能力: {', '.join(opt_missing)}（小程序码/素材上传会失败）")
PY

echo ""
if [[ "$RC" -eq 0 ]]; then
    echo "=== 部署完成：服务已由 systemd 重启并确认为新进程 ==="
    echo "日志：sudo journalctl -u wtsj-api -f    sudo journalctl -u wtsj-worker -f"
else
    echo "=== 部署异常：请按上面的 ✗ 项排查 ==="
fi
exit "$RC"
