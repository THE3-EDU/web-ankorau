# 前后端部署方案对比

## 方案一：合并部署（当前方案）

### 配置
- **前端**：Flask 提供静态文件（端口 5001）
- **后端**：Flask API（端口 5001）
- **访问**：`http://your-domain.com:5001`

### 优点
- ✅ 部署简单，只需一个服务
- ✅ 不需要配置 CORS
- ✅ 适合小规模应用

### 缺点
- ❌ 静态文件性能较差（Flask 处理）
- ❌ 静态文件请求占用 Gunicorn worker
- ❌ API 请求可能被静态文件请求影响
- ❌ 无法充分利用 Nginx 的优化特性（gzip、缓存等）

### 性能
- 静态文件：**较慢**（Flask 处理，每个请求占用 worker）
- API 请求：**中等**（可能被静态文件请求影响）

---

## 方案二：分离部署（推荐）

### 配置
- **前端**：Nginx 提供静态文件（端口 80/443）
- **后端**：Gunicorn + Flask API（端口 5001）
- **访问**：`http://your-domain.com`（前端）→ `/api/*` 代理到后端

### 优点
- ✅ **静态文件性能极佳**（Nginx 原生支持）
- ✅ API 请求不受静态文件影响
- ✅ 支持 gzip 压缩、缓存优化
- ✅ 可以分别扩展（前端 CDN，后端负载均衡）
- ✅ 更好的资源隔离

### 缺点
- ❌ 需要配置 Nginx
- ❌ 需要配置 CORS（如果前后端不同域名）

### 性能
- 静态文件：**极快**（Nginx 处理，不占用 Python 进程）
- API 请求：**更快**（不受静态文件影响）

---

## 性能对比数据（参考）

| 指标 | 合并部署 | 分离部署 | 提升 |
|------|---------|---------|------|
| 静态文件响应时间 | ~50-100ms | ~5-10ms | **5-10倍** |
| API 响应时间 | ~100-200ms | ~80-150ms | **20-30%** |
| 并发静态文件请求 | 受 worker 限制 | 几乎无限制 | **10倍+** |
| 内存占用 | 较高（worker 处理静态文件） | 较低（Nginx 处理静态文件） | **30-50%** |

---

## 推荐方案

### 生产环境：**分离部署**
- 使用 Nginx 提供前端静态文件
- Gunicorn 只处理 API 请求
- 性能提升明显，特别是静态文件较多的应用

### 开发环境：**合并部署**
- 使用 Flask 同时提供前后端
- 开发方便，无需配置 Nginx

---

## 迁移步骤

### 1. 安装 Nginx
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 2. 配置 Nginx
```bash
# 复制配置文件
sudo cp backend/nginx_frontend.conf /etc/nginx/sites-available/frontend

# 修改配置中的路径和域名
sudo nano /etc/nginx/sites-available/frontend

# 启用配置
sudo ln -s /etc/nginx/sites-available/frontend /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 3. 更新前端配置
前端 `P5Sketch.js` 中的 `BACKEND_URL` 保持使用当前域名：
```javascript
const BACKEND_URL = window.location.origin;  // 自动使用当前域名
```

### 4. 配置 CORS（如果需要）
如果前后端不同域名，需要在 `backend/app.py` 中配置 CORS：
```python
CORS(app, resources={r"/api/*": {
    "origins": ["http://your-frontend-domain.com"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
    "supports_credentials": True
}})
```

### 5. 测试
- 访问 `http://your-domain.com` 查看前端
- 检查浏览器 Network 面板，确认 API 请求到 `/api/*`
- 测试上传功能是否正常

---

## 总结

**前后端分离会更快**，特别是：
- 静态文件较多的应用（React build 通常有几 MB）
- 需要高并发的场景
- 生产环境部署

**建议**：
- 开发环境：继续使用合并部署（方便）
- 生产环境：切换到分离部署（性能）



