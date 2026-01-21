# 2核4GB服务器测试指南

## 快速测试步骤

### 1. 检查服务器资源

```bash
cd backend
./test-resources.sh
```

这会显示：
- CPU核心数
- 内存使用情况
- Node.js 版本
- 端口占用情况
- 性能建议

### 2. 测试启动后端

```bash
./start-test.sh
```

这个脚本会：
- 自动检查依赖
- 设置内存限制为 400MB
- 使用 PM2 或直接启动
- 监控资源使用

### 3. 监控资源使用

**使用 PM2 监控：**
```bash
pm2 monit
```

**查看进程资源：**
```bash
ps aux | grep node
```

**查看内存使用：**
```bash
free -h
```

### 4. 压力测试

**简单测试：**
```bash
# 健康检查
curl http://localhost:5001/health

# 测试 OSS 连接
curl http://localhost:5001/test-oss
```

**并发测试（可选）：**
```bash
# 安装 Apache Bench (ab)
# Ubuntu/Debian: sudo apt-get install apache2-utils
# CentOS/RHEL: sudo yum install httpd-tools

# 100个请求，并发10
ab -n 100 -c 10 http://localhost:5001/health
```

## 优化配置

### 后端优化（已配置）

1. **Worker 数量**: 1-2 个（自动根据 CPU 核心数）
2. **内存限制**: 400MB（PM2 自动重启）
3. **单进程模式**: 使用 fork 模式，不创建多个实例

### 前端优化建议

1. **GIF 预加载**: 已在 LoadingScreen 中实现
2. **MediaPipe 检测频率**: 已优化为每 4-5 帧检测一次
3. **录制帧率**: 30fps（已优化）

### 系统优化建议

**如果内存不足，可以：**

1. **启用 Swap 分区**（如果还没有）：
```bash
# 创建 2GB swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 永久启用
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

2. **限制其他服务**：
   - 关闭不必要的服务
   - 减少 Nginx worker 数量（如果使用）

3. **监控内存使用**：
```bash
# 实时监控
watch -n 1 free -h

# 或使用 htop
htop
```

## 预期资源使用

### 正常情况（空闲）
- **CPU**: 0-5%
- **内存**: 100-200MB（Node.js 后端）
- **前端**: 50-100MB（浏览器）

### 上传文件时
- **CPU**: 10-30%
- **内存**: 200-400MB（临时文件处理）
- **网络**: 取决于上传速度

### 处理视频时（如果使用 FC）
- **CPU**: 5-15%（主要是网络 I/O）
- **内存**: 200-350MB
- **注意**: 视频处理在 FC 云端，本地只负责上传

## 故障排查

### 内存不足

**症状**: 进程被杀死，日志显示 "Killed"

**解决方案**:
1. 检查内存使用: `free -h`
2. 启用 swap
3. 降低 `max_memory_restart` 到 300MB

### CPU 过高

**症状**: 服务器响应慢

**解决方案**:
1. 检查进程: `top` 或 `htop`
2. 减少并发请求
3. 优化前端检测频率

### 端口被占用

**症状**: 启动失败，提示端口被占用

**解决方案**:
```bash
# 查找占用进程
lsof -i :5001
# 或
netstat -tlnp | grep 5001

# 停止进程
kill -9 <PID>
```

## 性能基准

在 2核4GB 服务器上，预期性能：

- ✅ **健康检查**: < 10ms
- ✅ **OSS 测试**: < 100ms
- ✅ **小文件上传 (<10MB)**: < 5秒
- ✅ **大文件上传 (50MB)**: < 30秒
- ⚠️ **超大文件 (>100MB)**: 可能需要更长时间

## 监控建议

**使用 PM2 监控**:
```bash
pm2 install pm2-logrotate  # 日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**设置告警**（可选）:
```bash
# 如果内存超过 3.5GB，发送告警
# 可以使用监控工具如 Prometheus + Grafana
```

## 总结

✅ **2核4GB 服务器可以运行**，但建议：
1. 使用单进程模式（已配置）
2. 限制内存使用（已配置为 400MB）
3. 启用 swap 分区（如果内存紧张）
4. 监控资源使用情况
5. 避免同时运行其他重负载服务

如果遇到性能问题，可以：
- 升级到 4核8GB
- 使用 CDN 加速静态资源
- 将视频处理完全移到云端（FC）


