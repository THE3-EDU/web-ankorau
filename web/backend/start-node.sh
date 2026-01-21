#!/bin/bash
# Node.js 后端启动脚本

cd "$(dirname "$0")"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js。请先安装 Node.js (>=14.0.0)"
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "错误: 依赖安装失败"
        exit 1
    fi
fi

# 创建日志目录
mkdir -p logs

# 启动服务
echo "正在启动 Node.js 后端服务..."
echo "端口: ${PORT:-5001}"
echo "按 Ctrl+C 停止服务"
echo ""

if command -v pm2 &> /dev/null; then
    echo "使用 PM2 启动..."
    npm run pm2:start
    pm2 logs video-upload-backend
else
    echo "直接启动 Node.js..."
    npm start
fi

