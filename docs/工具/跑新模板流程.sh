#!/bin/zsh
# 加一套卡片模板的流水线（规范在 docs/产品需求.md §11，路线图在 docs/流程-加一套卡片模板.md）。
#
# 用法：
#   docs/工具/跑新模板流程.sh backend/seed/poster_extra/foo.json [更多文件…]     ← 两道关 + 出图
#   docs/工具/跑新模板流程.sh --种子 同上                                          ← 看完图之后才跑这一段
#
# 它做什么：第 0 关（node 静态）→ 三道护栏（十套一张像素不许变 / 解释器与名单 / 下发合并回退）
#           → 第 1 关（模拟器真下发真点格，出成品 PNG）→（--种子）重生成种子并复验。
# 它不做什么：**不部署、不推代码、不碰现网、不改 miniprogram 一行**。
#           §11.4 那三步（闸门 / 开闸部署 / 现网探针）跑完只把命令打出来，每一步要站长单独点头。
#
# 为什么中间要停下来让人看图：11.2 第 4/5/6 条那三处毛病（隐形分隔线、底色盖住内容、光晕切边）
# 判据一条都查不出来——它们量的是算出来的数，不看画面上到底有没有那块墨。全绿不等于图对。
cd /Users/zlfmac/Documents/TuMaiBiJi || exit 1
export NODE_PATH="$HOME/.mpauto/node_modules"
PORT=${MP_PORT:-9431}

[ -d "$HOME/.mpauto/node_modules/miniprogram-automator" ] || {
  echo "!! 缺 miniprogram-automator（第 1 关要用），先装一次：mkdir -p ~/.mpauto && cd ~/.mpauto && npm i miniprogram-automator"
  exit 1
}

STAGE=all
if [ "$1" = "--种子" ]; then STAGE=seed; shift; fi
FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  echo "用法：docs/工具/跑新模板流程.sh [--种子] backend/seed/poster_extra/<你的模板id>.json …"
  echo "　没写过就先照抄 backend/seed/poster_extra/模板-写法示例.example.json（那份生成器不读）"
  exit 1
fi

echo "══ 落盘的配方（${#FILES[@]} 份）"
badfile=0
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then echo "  ✗ 读不到 $f"; badfile=1; continue; fi
  stem=$(basename "$f" .json)
  if [[ "$f" != backend/seed/poster_extra/*.json ]]; then
    echo "  ✗ $f 不在 backend/seed/poster_extra/ 下面 —— 放在别处它一辈子进不了种子"; badfile=1; continue
  fi
  if [[ "$stem" == *.example ]]; then
    echo "  ✗ $stem.json 是示例件，生成器按后缀跳过它；复制成 <template_id>.json 再来"; badfile=1; continue
  fi
  if ! grep -q "\"template_id\"[[:space:]]*:[[:space:]]*\"$stem\"" "$f"; then
    echo "  ✗ $f 里的 template_id 与文件名不是「$stem」——两边对不上号，种子里会留一份说不清是谁的配方"; badfile=1; continue
  fi
done
[ $badfile -eq 0 ] || exit 1
printf '  ✓ %s\n' "${FILES[@]}"
export NEW_TPL_FILES="${FILES[*]}"

# 每条判据都先落日志、当场拿 $?、再打尾部。别写成 `node x.js | tail -2 || exit`：
# 那样 $? 是 tail 的，红成一片也照样往下跑（10-06 第一趟就是这么滑过去的）。
step() {
  name=$1; log=$2; shift 2
  "$@" >"$log" 2>&1
  code=$?
  tail -3 "$log" | sed 's/^/  /'
  if [ $code -ne 0 ]; then echo "  ✗ $name 红（退出码 $code），全量在 $log"; exit 1; fi
  echo "  ✓ $name"
}

if [ "$STAGE" = all ]; then
  # 这一段还没跑 --种子，所以"盘上有文件、种子里没有"是对的状态，不是漏灌。
  # TPL_PENDING 就是把这个状态告诉那把对账尺子（它反过来要求这几条在种子里**没有**）。
  export TPL_PENDING="${FILES[*]}"
  echo ""
  echo "══ 第 0 关　node 静态名单 + strict 规划（几秒钟，不启动模拟器）"
  export MP_STAGE=node
  step "第 0 关" /tmp/newtpl-stage0.log node docs/工具/出-新模板候选.js
  unset MP_STAGE

  echo ""
  echo "══ 护栏　新配方不许动到包内那十套（§11.5 最后一条）"
  step "等价基线 480 组" /tmp/newtpl-equiv.log node docs/工具/验-模板配方等价.js
  step "名单·解释器·种子对账" /tmp/newtpl-exec.log node docs/工具/验-模板配方可执行.js
  step "下发合并与回退" /tmp/newtpl-merge.log node docs/工具/验-模板配方下发.js

  echo ""
  echo "══ 第 1 关　模拟器真下发 + 真点那一格出成品图（固定开销约 100 秒：跑尺子.sh 自己 quit + 重开 + auto；此后每套约 30 秒）"
  bash docs/工具/跑尺子.sh $PORT 出-新模板候选 >/tmp/newtpl-live.log 2>&1
  cat /tmp/newtpl-live.log
  # 跑尺子.sh 的退出码是它循环里最后那条 sed 的，永远 0——真红要读它自己打的那行"退出码 N"
  if grep -qE "退出码 [1-9]" /tmp/newtpl-live.log; then
    echo "  ✗ 第 1 关红。全量：/tmp/ruler-出-新模板候选.log（先分清判据红还是环境红：连不上 9431 / MODULE_NOT_FOUND 是环境红）"
    exit 1
  fi
  echo "  ✓ 第 1 关"

  echo ""
  echo "══ 收尾两条读数（§11.3：末尾那句「已清」不算证据，得读回来）"
  grep -E "收尾读数：注入过的那批本机缓存" /tmp/ruler-出-新模板候选.log | sed 's/^/  ① /'
  if [ -z "$(lsof -iTCP:$PORT -sTCP:LISTEN -n -P -t 2>/dev/null)" ]; then
    echo "  ② 端口 $PORT 没人监听：自动化交还干净，你的真机调试不会被占死"
  else
    echo "  ② 端口 $PORT 还挂着（内存里那批下发值还在）。要还掉：/Applications/wechatwebdevtools.app/Contents/MacOS/cli quit"
    echo "     这一步脚本不替你 quit——你可能正开着它在别的地方看东西。"
  fi

  echo ""
  echo "══ 现在这一步归人：把成品 PNG 打开看"
  for f in "${FILES[@]}"; do
    id=$(basename "$f" .json)
    echo "  open docs/design/新模板候选/新模板-$id.png"
  done
  echo "  逐块问三句：这块该有字的地方有没有字／这条边是不是硬切出来的／这块颜色落在什么底上"
  echo "  看完没问题再跑：docs/工具/跑新模板流程.sh --种子 ${FILES[*]}"
  exit 0
fi

echo "══ 种子　把这几份并进 backend/seed/poster_templates.json（这一步只改本机那个生成物，现网没动）"
unset TPL_PENDING
node docs/工具/出-模板配方种子.js >/tmp/newtpl-seed.log 2>&1
code=$?
grep -E '^种子：|^→' /tmp/newtpl-seed.log | sed 's/^/  /'
if [ $code -ne 0 ]; then echo "  ✗ 生成器挡下了（上面那几行就是原因）：它一条不合格就整份种子一个字都不写"; exit 1; fi
git diff --stat backend/seed/poster_templates.json | tail -1 | sed 's/^/  ／ 生成物这次动了：/'
step "种子与盘上文件对账" /tmp/newtpl-exec2.log node docs/工具/验-模板配方可执行.js
( cd backend && .venv/bin/python -m pytest tests/test_poster_templates.py -q ) >/tmp/newtpl-pytest.log 2>&1
code=$?
tail -2 /tmp/newtpl-pytest.log | sed 's/^/  /'
[ $code -eq 0 ] || { echo "  ✗ 后端用例红，全量在 /tmp/newtpl-pytest.log"; exit 1; }

cat <<'NEXT'

══ 后面三步都不在这条脚本里，每一步要站长单独点头（§11.4）
1) 闸门（默认只读，一行都不写）——服务器上跑：
     bash deploy.sh
   看那一段 ⏸ 报的 live 条数；库里那一行还没变，这一步只是体检。
2) 开闸灌种子（这一步才写库）：
     POSTER_TEMPLATES=1 bash deploy.sh
3) 部署后必跑现网探针（只读）：
     .venv/bin/python probes/poster_templates_live_probe.py
   它专抓那三种静默：404（客户端会咽掉、照画包内十套）、响应行数与库里 live 对不上、字段或 hash 缺。
回滚：库里把那行 status 改成 archived，秒级生效、不发版，界面当场少那一格。
      那一句 python 在 docs/流程-加一套卡片模板.md §6（服务器上没有 sqlite3 CLI，只能走 .venv/bin/python）。
NEXT
