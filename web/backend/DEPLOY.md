# Node.js 后端部署指南

## 端口配置

默认运行在 **5001 端口**，可以通过环境变量 `PORT` 修改。

## 部署步骤

### 1. 本地准备

在本地项目目录下，确保代码已提交：

```bash
cd backend
# 检查文件是否完整
ls -la
```

需要上传的文件：
- `app.js`
- `package.json`
- `ecosystem.config.js` (可选，如果使用 PM2)
- `start-node.sh` (可选)
- `.env` (可选，包含敏感信息，建议在服务器上创建)

### 2. 打包文件

#### 方式 A: 使用 tar 打包（推荐）

```bash
# 在项目根目录
cd backend
tar -czf backend-nodejs.tar.gz \
  app.js \
  package.json \
  ecosystem.config.js \
  start-node.sh \
  README.md \
  .gitignore
```

#### 方式 B: 使用 zip 打包

```bash
cd backend
zip -r backend-nodejs.zip \
  app.js \
  package.json \
  ecosystem.config.js \
  start-node.sh \
  README.md \
  .gitignore
```

### 3. 上传到服务器

使用 `scp` 上传：

```bash
# 替换为你的服务器信息
scp backend-nodejs.tar.gz user@your-server-ip:/path/to/destination/
```

或使用 `rsync`：

```bash
rsync -avz backend/ user@your-server-ip:/path/to/backend/
```

### 4. 在服务器上解压和安装

SSH 登录服务器：

```bash
ssh user@your-server-ip
```

解压文件：

```bash
cd /path/to/backend
tar -xzf backend-nodejs.tar.gz
# 或
unzip backend-nodejs.zip
```

### 5. 安装 Node.js（如果未安装）

```bash
# 检查 Node.js 版本
node -v  # 需要 >= 14.0.0

# 如果未安装，使用 nvm 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18  # 或使用其他 LTS 版本
nvm use 18
```

### 6. 安装依赖

```bash
cd /path/to/backend
npm install --production
```

### 7. 配置环境变量

创建 `.env` 文件：

```bash
cd /path/to/backend
nano .env
```

添加以下内容：

```env
# OSS 配置
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET_NAME=your_bucket_name
OSS_BUCKET_DOMAIN=https://your-custom-domain.com  # 可选

# 服务器配置
PORT=5001
HOST=0.0.0.0
NODE_ENV=production
```

保存并退出（`Ctrl+X`, `Y`, `Enter`）。

### 8. 创建日志目录

```bash
mkdir -p logs
```

### 9. 启动服务

#### 方式 A: 使用 PM2（推荐生产环境）

```bash
# 安装 PM2（全局）
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs video-upload-backend

# 设置开机自启
pm2 startup
pm2 save
```

#### 方式 B: 使用 systemd（系统服务）

创建 systemd 服务文件：

```bash
sudo nano /etc/systemd/system/video-upload-backend.service
```

添加以下内容：

```ini
[Unit]
Description=Video Upload Backend Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /path/to/backend/app.js
Restart=always
RestartSec=10
StandardOutput=append:/path/to/backend/logs/app.log
StandardError=append:/path/to/backend/logs/error.log

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable video-upload-backend
sudo systemctl start video-upload-backend
sudo systemctl status video-upload-backend
```

#### 方式 C: 直接运行（测试用）

```bash
node app.js
```

### 10. 配置 Nginx 反向代理

更新 Nginx 配置，将 API 请求代理到 Node.js 后端：

```bash
sudo nano /etc/nginx/sites-available/your-site
```

在 `location ~ ^/(upload-to-oss|test-oss|health)` 部分，确保代理到 5001 端口：

```nginx
location ~ ^/(upload-to-oss|test-oss|health) {
    proxy_pass http://127.0.0.1:5001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 文件上传超时设置
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # 支持大文件上传
    client_max_body_size 500M;
}
```

重新加载 Nginx：

```bash
sudo nginx -t  # 测试配置
sudo systemctl reload nginx
```

### 11. 测试服务

```bash
# 健康检查
curl http://localhost:5001/health

# 测试 OSS 连接
curl http://localhost:5001/test-oss
```

## 防火墙配置

确保 5001 端口已开放（如果直接访问，通常不需要，因为通过 Nginx 代理）：

```bash
# Ubuntu/Debian
sudo ufw allow 5001/tcp

# CentOS/RHEL
sudo firewall-cmd --add-port=5001/tcp --permanent
sudo firewall-cmd --reload
```

## 常用命令

### PM2 管理

```bash
pm2 status                    # 查看状态
pm2 logs video-upload-backend # 查看日志
pm2 restart video-upload-backend  # 重启
pm2 stop video-upload-backend     # 停止
pm2 delete video-upload-backend   # 删除
```

### systemd 管理

```bash
sudo systemctl status video-upload-backend  # 查看状态
sudo systemctl restart video-upload-backend  # 重启
sudo systemctl stop video-upload-backend     # 停止
sudo systemctl enable video-upload-backend   # 开机自启
```

## 端口说明

- **默认端口**: 5001
- **可通过环境变量修改**: `PORT=5001`
- **监听地址**: `0.0.0.0`（所有网络接口）
- **通过 Nginx 代理**: 外部访问通过 80/443 端口，内部转发到 5001

## 故障排查

### 查看日志

```bash
# PM2 日志
pm2 logs video-upload-backend

# systemd 日志
sudo journalctl -u video-upload-backend -f

# 应用日志
tail -f logs/app.log
```

### 检查端口占用

```bash
sudo netstat -tlnp | grep 5001
# 或
sudo lsof -i :5001
```

### 检查进程

```bash
ps aux | grep node
```

## 更新部署

当需要更新代码时：

```bash
# 1. 上传新文件
# 2. 停止服务
pm2 stop video-upload-backend
# 或
sudo systemctl stop video-upload-backend

# 3. 备份旧文件（可选）
cp app.js app.js.backup

# 4. 替换文件
# 5. 安装新依赖（如果有）
npm install --production

# 6. 重启服务
pm2 restart video-upload-backend
# 或
sudo systemctl restart video-upload-backend
```

