#!/bin/bash
# 本地打包脚本，用于准备部署文件

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "Node.js 后端打包脚本"
echo "========================================="

# 检查必要文件
REQUIRED_FILES=("app.js" "package.json")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "错误: 缺少必要文件: $file"
        exit 1
    fi
done

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo "临时目录: $TEMP_DIR"

# 复制文件
echo "正在复制文件..."
cp app.js "$TEMP_DIR/"
cp package.json "$TEMP_DIR/"
cp ecosystem.config.js "$TEMP_DIR/" 2>/dev/null || echo "警告: ecosystem.config.js 不存在，跳过"
cp start-node.sh "$TEMP_DIR/" 2>/dev/null || echo "警告: start-node.sh 不存在，跳过"
cp README.md "$TEMP_DIR/" 2>/dev/null || echo "警告: README.md 不存在，跳过"
cp DEPLOY.md "$TEMP_DIR/" 2>/dev/null || echo "警告: DEPLOY.md 不存在，跳过"

# 创建 .gitignore（如果不存在）
if [ ! -f "$TEMP_DIR/.gitignore" ]; then
    cat > "$TEMP_DIR/.gitignore" << EOF
node_modules/
logs/
*.log
.env
.DS_Store
EOF
fi

# 打包
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="backend-nodejs-${TIMESTAMP}.tar.gz"

cd "$TEMP_DIR"
tar -czf "$SCRIPT_DIR/$PACKAGE_NAME" .

# 清理临时目录
rm -rf "$TEMP_DIR"

echo ""
echo "========================================="
echo "打包完成！"
echo "========================================="
echo "文件: $PACKAGE_NAME"
echo "大小: $(du -h "$SCRIPT_DIR/$PACKAGE_NAME" | cut -f1)"
echo ""
echo "上传到服务器:"
echo "  scp $PACKAGE_NAME user@server:/path/to/destination/"
echo ""
echo "在服务器上解压:"
echo "  tar -xzf $PACKAGE_NAME"
echo "  npm install --production"
echo "  pm2 start ecosystem.config.js"
echo "========================================="

