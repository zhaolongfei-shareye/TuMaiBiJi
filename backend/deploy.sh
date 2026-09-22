#!/bin/bash
# 图麦笔记后端部署脚本（在服务器上执行）
#
# 本地上传：cd /Users/zlfmac/Documents/TuMaiBiJi/backend && ./upload.sh
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

echo "=== 图麦笔记后端部署 ==="
source "$VENV_DIR/bin/activate"

RC=0

# ---- 1. 语法闸门：坏代码不要推上去，否则 systemd 会反复拉起又崩溃 ----
echo ""
echo ">>> 语法检查..."
if python -m compileall -q app > /tmp/tumaibiji_compile.err 2>&1; then
    echo "✓ 语法通过"
else
    echo "✗ 语法错误，终止部署（未重启服务，线上保持旧版本继续运行）"
    tail -20 /tmp/tumaibiji_compile.err
    exit 1
fi

# ---- 1.5 系统库预检 + 数据库快照 ----
# libGL / libglib 是当时手工 apt 装的，不在任何脚本里：换机器或重装系统后 opencv 会
# 以 "ImportError: libGL.so.1" 复发（R13）。先查这两样，缺了就停下给命令，
# 别让下面那个 OCR 预检抛一句看不懂的 import 错。
echo ""
echo ">>> 系统库预检（opencv 运行期依赖）..."
MISS=""
ldconfig -p 2>/dev/null | grep -q 'libGL\.so\.1' || MISS="$MISS libgl1"
ldconfig -p 2>/dev/null | grep -q 'libglib-2\.0\.so\.0' || MISS="$MISS libglib2.0-0"
if [[ -n "$MISS" ]]; then
    echo "✗ 缺系统库：${MISS# }"
    echo "  先装再部署：sudo apt-get install -y${MISS}"
    exit 1
fi
echo "✓ libGL / libglib 在位"

# 重启前给数据库留一份可恢复的快照。deploy.sh 本身不跑迁移，但一旦这次带上去的代码
# 有意外（比如误删数据的路径），这份就是唯一能回头的东西；备不出来就别重启。
echo ""
echo ">>> 重启前数据库快照..."
if [[ -x "$PROJECT_DIR/backup.sh" ]]; then
    if "$PROJECT_DIR/backup.sh" | sed 's/^/  /'; then
        echo "✓ 快照与恢复演练通过"
    else
        echo "✗ 备份/恢复演练失败，终止部署（服务未重启，线上仍是旧版本）"
        exit 1
    fi
else
    echo "✗ 找不到 $PROJECT_DIR/backup.sh，终止部署（不允许在没有回退点的情况下重启）"
    exit 1
fi

# ---- 1.6 schema 迁移：表和列只有这一条路会长出来 ----
# main.py 里没有 create_all，测试用例建表走 create_all、线上建表走 alembic，两条路对不上
# 时测试全绿而线上在第一条写入时报 no such column —— 所以这一步既跑迁移，也按模型点一次名。
# 放在备份之后：万一迁移出问题，1.5 那份快照就是唯一的回退点。
echo ""
echo ">>> 数据库迁移（alembic upgrade head）..."
echo "  迁移前: $(python -m alembic current 2>&1 | tail -1)"
if python -m alembic upgrade head 2>&1 | sed 's/^/  /'; then
    echo "  迁移后: $(python -m alembic current 2>&1 | tail -1)"
else
    echo "✗ 迁移失败，终止部署（服务未重启，线上仍是旧版本；库可用 1.5 的快照还原）"
    exit 1
fi

python <<'PY'
from sqlalchemy import create_engine, inspect

from app.core.config import settings

insp = inspect(create_engine(settings.DATABASE_URL))
cols = {c["name"] for c in insp.get_columns("users")}
tables = set(insp.get_table_names())
missing = sorted({"quota_bonus", "invited_by"} - cols)
if "invitations" not in tables:
    missing.append("invitations 表")
if missing:
    print(f"  ✗ 迁移后仍缺：{'、'.join(missing)} —— 模型和库对不上，第一条写入就会炸")
    raise SystemExit(1)
# 邀请台账的幂等是数据库挡的，不是应用层记得住的：唯一约束必须在。
uniq = [
    u for u in insp.get_unique_constraints("invitations")
    if u["column_names"] == ["invitee_id"]
]
if not uniq:
    print("  ✗ invitations.invitee_id 上没有唯一约束，同一个被邀请人可能被结好几次")
    raise SystemExit(1)
print("  ✓ users.quota_bonus / users.invited_by / invitations（含 invitee 唯一约束）到位")
PY
if [[ $? -ne 0 ]]; then
    echo "✗ schema 校验未通过，终止部署"
    exit 1
fi

# ---- 2. OCR 运行期预检：依赖装没装对，只有真跑一张才知道 ----
# 放在 restart 之前：这份自检会在独立进程里加载模型（本机两次读数 789.8MB / 816~826MB，
# 这块常驻开销本身有几十 MB 抖动），失败说明依赖有问题、新代码推上去只会让线上多一个
# 坏掉的功能，因此直接终止、不重启。
echo ""
echo ">>> 自建 OCR 预检..."
python <<'PY'
import asyncio
import io
import resource
import sys
import time

try:
    import cv2  # noqa: F401  GUI 版 opencv 在无桌面 Ubuntu 上会在此抛 OSError: libGL.so.1
except Exception as exc:
    print(f"  !! import cv2 失败：{exc}")
    print("     修复：sudo apt install -y libgl1（或把 requirements 里的 opencv-python 换成 opencv-python-headless）")
    sys.exit(1)

from PIL import Image, ImageDraw

from app.services.ocr import ocr_image

img = Image.new("RGB", (760, 140), "white")
ImageDraw.Draw(img).text((16, 50), "TUMAIJI SELFTEST OCR 123", fill="black")
buf = io.BytesIO()
img.save(buf, format="PNG")

t = time.perf_counter()
text = asyncio.run(ocr_image(buf.getvalue()))
dt = time.perf_counter() - t
peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 if sys.platform != "darwin" else 1048576)
print(f"  识别耗时 {dt:.2f}s  峰值 RSS {peak:.1f} MB  文本={text!r}")
assert "OCR" in text and "123" in text, "自检图像未识别出预期文字"
PY
if [[ $? -ne 0 ]]; then
    echo "✗ OCR 预检失败，终止部署（未重启服务，线上保持旧版本继续运行）"
    exit 1
fi
echo "  ✓ OCR 链路可用（含首次模型加载；常驻进程复用同一引擎，后续单张更快）"

# ---- 3. 记录重启前的 MainPID，用于确认「真的换了进程」----
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

# ---- 4. 校验每个 unit：active、MainPID 是本次新起的 ----
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

# ---- 5. 孤儿检测：本项目目录下不允许有游离于 systemd 之外的进程 ----
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

# ---- 6. 端口归属必须是 wtsj-api 的 MainPID ----
api_pid=$(systemctl show wtsj-api -p MainPID --value 2>/dev/null)
port_pid=$(sudo ss -ltnp "sport = :$API_PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [[ -n "$port_pid" && "$port_pid" == "$api_pid" ]]; then
    echo "✓ 端口 $API_PORT 由 wtsj-api (PID $api_pid) 持有"
else
    echo "✗ 端口 $API_PORT 归属异常：监听者 PID=${port_pid:-无}，wtsj-api PID=${api_pid:-无}"
    RC=1
fi

# ---- 7. HTTP 连通 ----
code_local=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$API_PORT/docs" || echo 000)
[[ "$code_local" == "200" ]] && echo "✓ 本机 /docs HTTP $code_local" || { echo "✗ 本机 /docs HTTP $code_local"; RC=1; }
code_pub=$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_URL" || echo 000)
[[ "$code_pub" == "200" ]] && echo "✓ 公网 $PUBLIC_URL HTTP $code_pub" || { echo "✗ 公网健康检查 HTTP $code_pub"; RC=1; }

# ---- 8. 配置自检（只报有无，绝不打印明文密钥）----
echo ""
echo ">>> 配置自检..."
python <<'PY'
from app.core.config import settings as s
from app.services.llm import KNOWN_PROVIDERS, key_usable, provider_implemented

# 缺失即【功能完全不可用】
REQUIRED = {
    "WECHAT_APP_ID": "微信登录（小程序进不去）",
    "WECHAT_APP_SECRET": "微信登录（小程序进不去）",
}
# 缺失即【该条链路不可用】，但不影响其它功能
FEATURE = {}
# 缺失只是【降级】：采集照常入库，少掉自动提炼
DEGRADABLE = {
    "HUNYUAN_CF_URL": "提炼云函数地址（缺失则只存原文，任务不再失败）",
    "HUNYUAN_CF_KEY": "提炼云函数触发凭据（缺失则只存原文，任务不再失败）",
}
# 截图 OCR 已无凭据依赖（自建 RapidOCR），已在第 2 节做过运行期预检。


def unusable(name):
    """空值或仍是 .env.example 里的占位串，都算未配置。"""
    return not key_usable(str(getattr(s, name, "") or ""))


print(f"  数据库类型: {s.DATABASE_URL.split('://')[0]}")
missing = sorted(f"{v}  ← {k}" for k, v in REQUIRED.items() if unusable(k))
deg_missing = sorted(f"{v}  ← {k}" for k, v in DEGRADABLE.items() if unusable(k))

if missing:
    print(f"  !! 缺失 {len(missing)} 项必需配置，对应功能在生产环境【完全不可用】：")
    for m in missing:
        print(f"     - {m}")
    print("  !! 因此本次部署【不能】宣称核心功能已验证 —— 需先在 .env 补齐并重启。")
else:
    print("  ✓ 必需配置齐全（注意：这只是配置层面，接口是否真通仍需端到端验证）")

# provider 单独判：未实现与没配凭据是两件事，混在一起会让人去查一个不存在的问题。
provider = (s.EXTRACT_PROVIDER or "hunyuan_cf").strip()
if provider not in KNOWN_PROVIDERS:
    print(f"  · EXTRACT_PROVIDER={provider!r} 不在已知取值内，该 provider 未实现，走降级")
elif not provider_implemented(provider):
    print(f"  · EXTRACT_PROVIDER={provider!r} 该 provider 未实现，走降级")
elif provider == "none":
    print("  · EXTRACT_PROVIDER=none，按配置跳过提炼，只存原文")
elif deg_missing:
    print("  · 可降级项未配置（服务照常，功能降级）：")
    for d in deg_missing:
        print(f"     - {d}")
PY

# ---- 9. 内容安全端到端自检 ----
# 这条必须是"真打一次"而不是"看配置有没有"：代码里 unavailable 一律放行（不能让微信侧
# 抖动变成用户存不了笔记），所以一旦 openid 传错、凭据失效或接口没开通，机制会**静默失效**，
# 只有这里能发现。断言两头：正常文本要 pass，已知违规文本必须被判下来。
echo ""
echo ">>> 内容安全自检（真打 msgSecCheck）..."
python <<'PY'
import sqlite3

from app.core.config import settings
from app.services.wechat import check_text

if not settings.SEC_CHECK_ENABLED:
    print("  ✗ SEC_CHECK_ENABLED=false —— 生产环境内容安全被关掉，公开出口等于没有过滤")
    raise SystemExit(1)

db = sqlite3.connect(settings.DATABASE_URL.split(":///")[-1] if "sqlite" in settings.DATABASE_URL else "")
# 只要真 openid：微信的是 28 位，deploy-test 那种手写短串会被接口判 40003，
# 拿它自检会得到"机制没生效"的假警报。
row = db.execute("select openid from users where length(openid) >= 20 order by id desc limit 1").fetchone()
db.close()
if not row:
    print("  ✗ 库里没有可用的真 openid，无法自检（msgSecCheck v2 的 openid 必填且必须真实）")
    raise SystemExit(1)
openid = row[0]
print(f"  用最新一个账号的 openid 自检（长度 {len(openid)}，值不打印）")

ok_pass = check_text(openid, "厦门三日路线：鼓浪屿要早去早回，傍晚去沙坡尾拍照。")
ok_risky = check_text(openid, "线上赌场 六合彩 特码 内部资料 稳赚 下注网址")
print(f"  正常文本 → {ok_pass}；已知违规文本 → {ok_risky}")

bad = []
if ok_pass != "pass":
    bad.append(f"正常文本被判成 {ok_pass}（接口或凭据有问题）")
if ok_risky not in ("risky", "review"):
    bad.append(f"违规文本没被判下来（{ok_risky}）——内容安全机制实际没在生效")
if bad:
    for b in bad:
        print(f"  ✗ {b}")
    raise SystemExit(1)
print("  ✓ 内容安全在生效：正常放行、违规拦得下")
PY
[[ $? -eq 0 ]] || RC=1

echo ""
if [[ "$RC" -eq 0 ]]; then
    echo "=== 部署完成：服务已由 systemd 重启并确认为新进程 ==="
    echo "日志：sudo journalctl -u wtsj-api -f    sudo journalctl -u wtsj-worker -f"
else
    echo "=== 部署异常：请按上面的 ✗ 项排查 ==="
fi
exit "$RC"
