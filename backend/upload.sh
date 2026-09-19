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
echo ">>> 打包后端代码..."
COPYFILE_DISABLE=1 tar czf /tmp/wtsj-backend.tar.gz \
    --exclude='.venv' \
    --exclude='venv' \
    --exclude='*.db' \
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

echo "✓ 打包完成: /tmp/wtsj-backend.tar.gz ($(du -h /tmp/wtsj-backend.tar.gz | cut -f1))"

# 上传到服务器
echo ""
echo ">>> 上传到 agentsbin..."
scp /tmp/wtsj-backend.tar.gz agentsbin:/tmp/

# 服务器解压（解压后清掉历史遗留的 AppleDouble 垃圾，覆盖式部署不会自动删除旧文件）
echo ""
echo ">>> 服务器解压..."
ssh agentsbin "cd /home/ubuntu/wtsj-backend && tar xzf /tmp/wtsj-backend.tar.gz && rm /tmp/wtsj-backend.tar.gz && find . -name '._*' -delete && find . -name '.DS_Store' -delete"

# 清理本地临时文件
rm /tmp/wtsj-backend.tar.gz

echo ""
echo "=== 上传完成 ==="
echo ""
echo "下一步：SSH 到服务器执行部署"
echo "  ssh agentsbin"
echo "  cd /home/ubuntu/wtsj-backend"
echo "  ./deploy.sh"
