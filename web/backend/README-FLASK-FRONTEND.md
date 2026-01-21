# Flask 集成前端静态文件部署指南

## 概述

现在 Flask 后端已经集成了前端 build 后的静态文件，可以通过同一个服务器访问前端和后端。

## 目录结构

```
项目根目录/
├── backend/
│   ├── app.py          # Flask 应用（已集成静态文件服务）
│   └── ...
└── frontend/
    └── build/          # React build 后的静态文件
        ├── index.html
        ├── static/
        ├── GIF/
        ├── Images/
        └── ...
```

## 部署步骤

### 1. 构建前端

```bash
cd frontend
npm run build
```

确保 `frontend/build` 目录存在且包含所有静态文件。

### 2. 启动 Flask 服务

```bash
cd backend

# 开发模式
python app.py

# 或使用 Gunicorn（生产环境）
gunicorn -c gunicorn_config.py app:app
```

### 3. 访问应用

- **前端页面**: `http://localhost:5001/` 或 `http://localhost:5001/game/2026/blackhorse`
- **API 端点**: 
  - `http://localhost:5001/upload-to-oss` (POST)
  - `http://localhost:5001/health` (GET)
  - `http://localhost:5001/test-oss` (GET)

## 路由说明

### API 路由（优先匹配）

- `/upload-to-oss` - 上传文件到 OSS
- `/health` - 健康检查
- `/test-oss` - 测试 OSS 连接

### 静态文件路由

- `/static/*` - React 构建的 JS/CSS 文件
- `/GIF/*` - GIF 动画文件
- `/Images/*` - 图片资源
- `/libs/*` - 第三方库（p5.js, MediaPipe 等）
- `/mediapipe/*` - MediaPipe 相关文件

### 前端路由（React Router）

所有其他路由（如 `/game/2026/blackhorse`）都会返回 `index.html`，由前端 React Router 处理。

## 配置说明

### 前端配置

前端代码中的 `BACKEND_URL` 已配置为：
- **开发环境**: `http://localhost:5001`
- **生产环境**: 空字符串（使用当前域名）

这意味着在生产环境中，API 请求会自动使用当前域名，无需额外配置。

### Flask 配置

Flask 应用会自动：
1. 优先匹配 API 路由
2. 提供静态文件服务
3. 其他路由返回 `index.html`（支持 React Router）

## 注意事项

1. **确保前端已构建**: 运行 `npm run build` 生成 `frontend/build` 目录
2. **路径正确**: Flask 会自动查找 `../frontend/build` 目录
3. **CORS 配置**: 由于前后端在同一服务器，CORS 配置仍然保留（以防需要）
4. **静态文件缓存**: 生产环境建议配置适当的缓存策略

## 生产环境优化

### 使用 Gunicorn

```bash
gunicorn -c gunicorn_config.py app:app
```

### 使用 Nginx 反向代理（可选）

如果需要使用 Nginx，可以配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 代理到 Flask
    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 静态文件缓存

可以在 Flask 中添加缓存头：

```python
@app.after_request
def add_cache_headers(response):
    if request.path.startswith('/static/'):
        response.cache_control.max_age = 31536000  # 1年
    return response
```

## 故障排查

### 前端页面无法加载

1. 检查 `frontend/build` 目录是否存在
2. 检查路径是否正确：`../frontend/build`
3. 查看 Flask 日志是否有错误

### API 请求失败

1. 检查 API 路由是否正确定义
2. 查看浏览器控制台的错误信息
3. 确认 `BACKEND_URL` 配置正确

### React Router 路由不工作

确保所有非 API 路由都返回 `index.html`，检查 `serve_frontend` 函数是否正确。

## 测试

```bash
# 测试健康检查
curl http://localhost:5001/health

# 测试前端页面
curl http://localhost:5001/

# 测试 React Router 路由
curl http://localhost:5001/game/2026/blackhorse
```


