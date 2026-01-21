# Gunicorn 配置文件
# 用于多进程部署，支持多用户并发上传

import multiprocessing
import os

# 服务器 socket
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:5001")
backlog = 2048  # 等待连接队列大小

# Worker 进程配置
# 低配置服务器：worker 数量 = 1-2 个（适合低配置服务器）
# 例如：1核CPU = 1个worker，2核及以上 = 2个worker
cpu_count = multiprocessing.cpu_count()
default_workers = min(max(cpu_count, 1), 2)  # 最少1个，最多2个
workers = int(os.getenv("GUNICORN_WORKERS", default_workers))
worker_class = "sync"  # 使用同步 worker（适合 I/O 密集型任务如文件上传）
worker_connections = 500  # 每个 worker 的最大并发连接数（降低以节省资源）
timeout = 300  # Worker 超时时间（秒），文件上传可能需要较长时间
keepalive = 5  # Keep-alive 连接时间（秒）

# 日志配置
# 日志文件路径（相对于项目根目录）
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

accesslog = os.getenv("GUNICORN_ACCESS_LOG", os.path.join(LOG_DIR, "access.log"))  # 访问日志
errorlog = os.getenv("GUNICORN_ERROR_LOG", os.path.join(LOG_DIR, "error.log"))    # 错误日志
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# 进程名称
proc_name = "video_upload_backend"

# 性能优化
preload_app = True  # 预加载应用，减少内存占用（Flask 静态文件服务也会被预加载）
max_requests = 1000  # 每个 worker 处理 1000 个请求后重启（防止内存泄漏）
max_requests_jitter = 50  # 随机抖动，避免所有 worker 同时重启

# 注意：前后端已分离，静态文件由 Nginx 提供
# Gunicorn 只处理 API 请求，不提供静态文件服务

# 安全
limit_request_line = 4094  # 请求行最大长度
limit_request_fields = 100  # 请求头最大数量
limit_request_field_size = 8190  # 单个请求头最大大小

# 进程管理
daemon = False  # 不以守护进程运行（由 systemd/supervisor 管理）
pidfile = os.getenv("GUNICORN_PIDFILE", None)  # PID 文件路径（可选）
umask = 0o007  # 文件权限掩码

# 性能监控（可选，需要安装 gunicorn-statsd）
# statsd_host = "localhost:8125"
# statsd_prefix = "gunicorn"

