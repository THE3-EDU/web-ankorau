// PM2 配置文件，用于生产环境进程管理
module.exports = {
  apps: [{
    name: 'video-upload-backend',
    script: './app.js',
    instances: 1, // 低配置服务器使用单实例
    exec_mode: 'fork', // 使用 fork 模式（单进程）
    watch: false,
    max_memory_restart: '400M', // 内存超过 400MB 自动重启（适合2核4GB服务器）
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};

