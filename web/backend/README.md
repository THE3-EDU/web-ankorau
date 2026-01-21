# Node.js 后端服务

用于视频上传到阿里云 OSS 的 Express.js 后端服务。

## 功能特性

- ✅ 文件上传到阿里云 OSS
- ✅ 支持大文件分片上传（>100MB）
- ✅ CORS 支持
- ✅ 健康检查端点
- ✅ OSS 连接测试

## 安装依赖

```bash
npm install
```

## 环境变量配置

创建 `.env` 文件（可选，也可以直接使用环境变量）：

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

如果不设置环境变量，将使用代码中的默认值（仅用于开发测试）。

## 运行方式

### 开发模式

```bash
npm run dev
```

使用 `nodemon` 自动重启（需要安装 `nodemon`）。

### 生产模式

#### 方式 1: 直接运行

```bash
npm start
```

#### 方式 2: 使用 PM2（推荐）

```bash
# 安装 PM2（全局）
npm install -g pm2

# 启动服务
npm run pm2:start

# 停止服务
npm run pm2:stop

# 重启服务
npm run pm2:restart

# 查看状态
pm2 status

# 查看日志
pm2 logs video-upload-backend
```

## API 端点

### POST /upload-to-oss

上传视频文件到 OSS。

**请求:**
- Content-Type: `multipart/form-data`
- 字段:
  - `video`: 视频文件（必需）
  - `fileName`: 文件名（可选，如不提供会自动生成）

**响应:**
```json
{
  "success": true,
  "url": "https://bucket.oss-cn-hangzhou.aliyuncs.com/videos/xxx.webm",
  "key": "videos/xxx.webm"
}
```

### GET /health

健康检查端点。

**响应:**
```json
{
  "status": "ok"
}
```

### GET /test-oss

测试 OSS 配置和连接。

**响应:**
```json
{
  "success": true,
  "message": "OSS connection successful",
  "bucket": "your_bucket_name",
  "endpoint": "oss-cn-hangzhou.aliyuncs.com",
  "objects_count": 0
}
```

## 注意事项

1. **前后端分离**: 静态文件由 Nginx 提供，后端只处理 API 请求
2. **文件大小限制**: 默认最大 1GB
3. **临时文件**: 上传的文件会先保存到系统临时目录，上传完成后自动清理
4. **大文件上传**: 超过 100MB 的文件会自动使用分片上传

## 与 Flask 版本的对比

- ✅ 更稳定：Node.js 单线程事件循环模型，更适合 I/O 密集型任务
- ✅ 更轻量：不需要 Gunicorn 等进程管理器（可选 PM2）
- ✅ 更好的并发处理：原生支持异步 I/O
- ✅ 更简单的部署：单一进程，资源占用更少


