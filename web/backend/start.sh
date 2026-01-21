#!/bin/bash
# 快速启动脚本 - 使用 Gunicorn 多进程部署

# 设置工作目录
cd "$(dirname "$0")"

# 激活 conda 环境
# 默认环境名：translateAI（可通过环境变量 CONDA_ENV_NAME 覆盖）
CONDA_ENV_NAME=${CONDA_ENV_NAME:-"flask_env"}

# 尝试多种方式激活 conda 环境
if [ -f "/home/the3/miniconda3/etc/profile.d/conda.sh" ]; then
    # 方法1：使用 /home/the3/miniconda3（用户指定路径）
    source /home/the3/miniconda3/etc/profile.d/conda.sh
    conda activate $CONDA_ENV_NAME
    echo "已激活 conda 环境: $CONDA_ENV_NAME (from /home/the3/miniconda3)"
elif [ -f "/opt/anaconda3/etc/profile.d/conda.sh" ]; then
    # 方法2：使用 /opt/anaconda3（系统级安装）
    source /opt/anaconda3/etc/profile.d/conda.sh
    conda activate $CONDA_ENV_NAME
    echo "已激活 conda 环境: $CONDA_ENV_NAME (from /opt/anaconda3)"
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    # 方法3：使用用户目录下的 anaconda3
    source "$HOME/anaconda3/etc/profile.d/conda.sh"
    conda activate $CONDA_ENV_NAME
    echo "已激活 conda 环境: $CONDA_ENV_NAME (from $HOME/anaconda3)"
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    # 方法4：使用用户目录下的 miniconda3
    source "$HOME/miniconda3/etc/profile.d/conda.sh"
    conda activate $CONDA_ENV_NAME
    echo "已激活 conda 环境: $CONDA_ENV_NAME (from $HOME/miniconda3)"
elif command -v conda &> /dev/null; then
    # 方法5：如果 conda 已在 PATH 中
    CONDA_BASE=$(conda info --base)
    if [ -f "$CONDA_BASE/etc/profile.d/conda.sh" ]; then
        source "$CONDA_BASE/etc/profile.d/conda.sh"
        conda activate $CONDA_ENV_NAME
        echo "已激活 conda 环境: $CONDA_ENV_NAME (from $CONDA_BASE)"
    fi
else
    echo "警告: 未找到 conda，将使用系统 Python"
fi

# 检查依赖
if ! python -c "import gunicorn" 2>/dev/null; then
    echo "安装依赖..."
    pip install -r requirements.txt
fi

# 读取环境变量（如果存在 .env 文件）
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# 创建日志目录
LOG_DIR="$(dirname "$0")/logs"
mkdir -p "$LOG_DIR"

# 启动 Gunicorn（后台运行）
echo "启动 Gunicorn 多进程服务（后台运行）..."
echo "Worker 数量: ${GUNICORN_WORKERS:-auto}"
echo "绑定地址: ${GUNICORN_BIND:-0.0.0.0:5001}"
echo "日志目录: $LOG_DIR"
echo "访问日志: $LOG_DIR/access.log"
echo "错误日志: $LOG_DIR/error.log"
echo ""
echo "使用以下命令查看日志:"
echo "  tail -f $LOG_DIR/access.log  # 查看访问日志"
echo "  tail -f $LOG_DIR/error.log   # 查看错误日志"
echo "  tail -f $LOG_DIR/*.log       # 查看所有日志"
echo ""

# 后台运行 gunicorn，并将输出重定向到日志文件
nohup gunicorn -c gunicorn_config.py app:app > "$LOG_DIR/gunicorn.log" 2>&1 &

# 获取进程 ID
GUNICORN_PID=$!
echo "Gunicorn 已在后台启动，PID: $GUNICORN_PID"
echo "PID 已保存到: $LOG_DIR/gunicorn.pid"
echo $GUNICORN_PID > "$LOG_DIR/gunicorn.pid"

# 等待一下，检查进程是否成功启动
sleep 2
if ps -p $GUNICORN_PID > /dev/null; then
    echo "✅ Gunicorn 启动成功！"
    echo ""
    echo "常用命令:"
    echo "  查看访问日志: tail -f $LOG_DIR/access.log"
    echo "  查看错误日志: tail -f $LOG_DIR/error.log"
    echo "  查看所有日志: tail -f $LOG_DIR/*.log"
    echo "  停止服务: ./stop.sh 或 kill $GUNICORN_PID"
else
    echo "❌ Gunicorn 启动失败，请查看日志: $LOG_DIR/gunicorn.log"
    exit 1
fi


