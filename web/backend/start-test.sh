#!/bin/bash
# 测试启动脚本 - 用于2核4GB服务器

cd "$(dirname "$0")"

echo "========================================="
echo "启动测试模式（2核4GB服务器）"
echo "========================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install --production
fi

# 创建日志目录
mkdir -p logs

# 设置环境变量（低配置优化）
export NODE_ENV=production
export PORT=5001
export NODE_OPTIONS="--max-old-space-size=400"  # 限制内存使用为400MB

echo "配置信息："
echo "  端口: ${PORT}"
echo "  内存限制: 400MB"
echo "  环境: ${NODE_ENV}"
echo ""

# 检查端口是否被占用
if lsof -Pi :${PORT} -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  警告: 端口 ${PORT} 已被占用"
    echo "   正在尝试停止现有进程..."
    lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# 启动服务
echo "正在启动服务..."
echo ""

# 如果安装了 PM2，使用 PM2
if command -v pm2 &> /dev/null; then
    echo "使用 PM2 启动..."
    pm2 start ecosystem.config.js --update-env
    echo ""
    echo "查看状态: pm2 status"
    echo "查看日志: pm2 logs video-upload-backend"
    echo "停止服务: pm2 stop video-upload-backend"
else
    echo "直接启动 Node.js..."
    echo "按 Ctrl+C 停止服务"
    echo ""
    node app.js
fi


