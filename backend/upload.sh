#!/bin/bash
# 图麦笔记后端上传脚本（在本地 Mac 执行）
# 打包后端代码并上传到 agentsbin 服务器
#
# 用法: ./upload.sh
# 上传后 SSH 到服务器执行 deploy.sh

set -e

echo "=== 图麦笔记后端上传 ==="

# 进入项目根目录
cd "$(dirname "$0")/.."

# 打包（排除虚拟环境、数据库、日志等）
# COPYFILE_DISABLE=1 阻止 macOS bsdtar 为扩展属性生成 AppleDouble（._xxx.py）垃圾文件；
# 这些文件会以二进制形式落进生产代码树，并被 python -m compileall 判为语法错误。
# ⚠ `*.db` 罩不住 WAL 那两个伴生文件（`wtsj.db-wal`／`-shm` 结尾不是 `.db`）。开 WAL 之后
#    漏掉这两条排除，本机残留会被解到服务器上**正活着的那份 -wal 上**——那是整库损坏级别的事。
#
# 版本指纹（10-25 第八轮审计 M25③）：这一支打的一直是**工作树**（`-C backend .`），
# 而工作树里同时躺着另一条线没提交的那几十只文件 ⇒ "传上去的那批字节等于某一次提交"
# 这句话以前没有任何证据。现在打包时把 `git rev-parse HEAD` 与脏条数写进包里那只
# DEPLOY_STAMP.txt，`deploy.sh` 部署时原样念一遍（只念不判红：现网与仓库不等是常态，
# 另一条路那 8 只文件此刻就是故意没上）。它证明的是"这一刻的 HEAD 与工作树有多脏"，
# 不是"现网等于 HEAD"——那个判据在 `docs/工具/对账-现网那四目录.py --compare`。
echo ">>> 写版本指纹..."
{
    echo "git_head=$(git rev-parse HEAD)"
    echo "git_branch=$(git rev-parse --abbrev-ref HEAD)"
    echo "worktree_dirty_all=$(git status --porcelain | wc -l | tr -d ' ')"
    echo "worktree_dirty_backend=$(git status --porcelain -- backend | wc -l | tr -d ' ')"
    echo "untracked_backend=$(git status --porcelain -- backend | grep -c '^??' || true)"
    echo "packed_at=$(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "packed_by=$(whoami)@$(hostname -s)"
} > backend/DEPLOY_STAMP.txt
echo "  $(grep git_head backend/DEPLOY_STAMP.txt)  脏 $(grep worktree_dirty_all backend/DEPLOY_STAMP.txt | cut -d= -f2) 条"

echo ">>> 打包后端代码..."
COPYFILE_DISABLE=1 tar czf /tmp/tumaibiji-backend.tar.gz \
    --exclude='.venv' \
    --exclude='venv' \
    --exclude='*.db' \
    --exclude='*.db-wal' \
    --exclude='*.db-shm' \
    --exclude='logs' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.DS_Store' \
    --exclude='._*' \
    --exclude='keys' \
    --exclude='.env' \
    --exclude='.env.bak*' \
    -C backend .

echo "✓ 打包完成: /tmp/tumaibiji-backend.tar.gz ($(du -h /tmp/tumaibiji-backend.tar.gz | cut -f1))"

# 现网代码回滚点（Z54，第十轮审计）：下面那一句 ssh 是**就地覆盖**，而且跑在 deploy.sh
# 所有闸之前——语法闸门、import 预检、备份演练全在覆盖之后才第一次执行。那之前一旦把
# 坏字节铺上去，唯一的退路就是"覆盖前那一版"，而它此前机器上不存在（backup.sh 只备库）。
# 所以这一格是覆盖的前置条件：快照做不出来就当场停，此时服务器一个字节都还没动。
echo ""
echo ">>> 现网代码快照（覆盖前）..."
SNAP=$(ssh agentsbin 'set -e
SRC=/home/ubuntu/wtsj-backend
STORE=/home/ubuntu/wtsj-backups
mkdir -p "$STORE"
TO="$STORE/code-$(date +%Y%m%d-%H%M%S).tar.gz"
# 只快照代码。规则：凡 upload.sh 这一趟不覆盖的、以及任何会变的东西，都不进这一份
# （现网树现读，2026-11-16 顶层各项）：
# · .venv（现量 569 MB，代码本体约 15 MB）upload.sh 从不覆盖它，退依赖会把
#   requirements 那一步修过的东西一起退回去；
# · 库（wtsj.db 1.9 MB＋wal 788 KB＋shm，另有 app.db 一只 0 字节的遗留）：用 tar/cp 拷
#   **正在写的 SQLite** 拿到的是撕裂的半份（WAL 里未合并的事务会丢），库唯一的回退点是
#   backup.sh 那份在线备份，这里不留第二把假回退点；
# · .env / .env.bak* / keys 是凭据，不在"代码"范围内，退代码不该顺手把凭据也退了；
# · uvicorn.log 与 worker.log 是运行期日志（现网没有 `logs` 那级目录，日志是顶层单只
#   `.log`——所以 `--exclude=logs` 罩不住它们，必须两条都在）；
# · deploy-backup/（现量 8.7 MB，全是历史上的手工代码 tar）与 ops_backups/（每把刀的
#   .bak）——把上一份快照再快照一遍只会让"留最近 5 份"这个上限失去意义；var/ 是运营图的
#   本地盘缓存，属数据。
# ⚠ 排除名用的是 GNU tar 的默认非锚定匹配（`wtsj.db*` 罩得住 `./wtsj.db-wal`）；本机 BSD
#    tar 的匹配行为已在这把尺子里演过一遍（验-部署脚本代码回滚点-静态.js）。
tar czf "$TO" -C "$SRC" \
    --exclude=.venv --exclude="*.db" --exclude="*.db-wal" --exclude="*.db-shm" \
    --exclude=logs --exclude="*.log" --exclude=__pycache__ --exclude="*.pyc" \
    --exclude=.env --exclude=".env.bak*" --exclude=keys \
    --exclude=deploy-backup --exclude=ops_backups --exclude=var .
# 只留最近 5 份：这一条跑在每一次部署上，不设上限迟早把盘吃满。
# 用 while read 而不是 `xargs -r`：`-r` 是 GNU 的旗子，本机 BSD xargs 没有，
# 而这一段要在两台机器上都演得起来（文件名是本脚本自己拼的固定形状，不带空格）。
ls -1t "$STORE"/code-*.tar.gz 2>/dev/null | tail -n +6 | while read -r OLD; do rm -f "$OLD"; done
printf "%s\n" "$TO" > "$STORE/code-latest"
printf "%s" "$TO"
')
echo "  ✓ $SNAP"

# 上传到服务器
echo ""
echo ">>> 上传到 agentsbin..."
scp /tmp/tumaibiji-backend.tar.gz agentsbin:/tmp/

# 服务器解压（解压后清掉历史遗留的 AppleDouble 垃圾，覆盖式部署不会自动删除旧文件）
echo ""
echo ">>> 服务器解压..."
ssh agentsbin "cd /home/ubuntu/wtsj-backend && tar xzf /tmp/tumaibiji-backend.tar.gz && rm /tmp/tumaibiji-backend.tar.gz && find . -name '._*' -delete && find . -name '.DS_Store' -delete"

# 清理本地临时文件
rm /tmp/tumaibiji-backend.tar.gz

echo ""
echo "=== 上传完成（现网代码树已被覆盖）==="
echo ""
echo "万一这一批起不来，代码退回去（只退代码，不动库与 .env）："
echo "  ssh agentsbin \"cd /home/ubuntu/wtsj-backend && tar xzf $SNAP && sudo systemctl restart wtsj-api wtsj-worker\""
echo "  ⚠ 这一条退不了数据库：这一趟若跑过 alembic 迁移，代码退回旧版而库里新列还在，"
echo "    deploy.sh 只 upgrade 不 downgrade——真退代码前先想清楚这一趟带没带迁移。"
echo "  ⚠ 这一条也退不掉**新增的文件**：tar 解包只覆盖归档里有的那些，这一趟新落的代码文件"
echo "    解完还在原处（旧版 import 不到它就起不来，import 得到就可能读旧形状）。真要干净，"
echo "    得先按 DEPLOY_STAMP.txt 里那两行数比出这一趟新增了什么，手工挪走再解包。"
echo ""
echo "下一步：SSH 到服务器执行部署"
echo "  ssh agentsbin"
echo "  cd /home/ubuntu/wtsj-backend"
echo "  ./deploy.sh"
