#!/bin/bash
# 停止 Gunicorn 服务脚本

echo "正在查找 Gunicorn 进程..."

# 方法1：通过进程名查找并终止
GUNICORN_PIDS=$(ps aux | grep '[g]unicorn.*app:app' | awk '{print $2}')

if [ -z "$GUNICORN_PIDS" ]; then
    echo "未找到运行中的 Gunicorn 进程"
    exit 0
fi

echo "找到以下 Gunicorn 进程:"
ps aux | grep '[g]unicorn.*app:app'

# 终止所有找到的进程
for PID in $GUNICORN_PIDS; do
    echo "正在终止进程 $PID..."
    kill $PID
done

# 等待进程结束
sleep 2

# 检查是否还有进程在运行
REMAINING=$(ps aux | grep '[g]unicorn.*app:app' | awk '{print $2}')
if [ ! -z "$REMAINING" ]; then
    echo "部分进程仍在运行，强制终止..."
    for PID in $REMAINING; do
        kill -9 $PID
    done
fi

echo "Gunicorn 服务已停止"

