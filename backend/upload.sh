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
echo "=== 上传完成 ==="
echo ""
echo "下一步：SSH 到服务器执行部署"
echo "  ssh agentsbin"
echo "  cd /home/ubuntu/wtsj-backend"
echo "  ./deploy.sh"
