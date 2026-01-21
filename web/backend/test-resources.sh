#!/bin/bash
# 资源使用测试脚本
# 用于测试在2核4GB服务器上的运行情况

echo "========================================="
echo "服务器资源测试"
echo "========================================="
echo ""

# 检查系统信息
echo "1. 系统信息："
echo "   CPU核心数: $(nproc)"
echo "   总内存: $(free -h | awk '/^Mem:/ {print $2}')"
echo "   可用内存: $(free -h | awk '/^Mem:/ {print $7}')"
echo "   系统负载: $(uptime | awk -F'load average:' '{print $2}')"
echo ""

# 检查 Node.js
echo "2. Node.js 信息："
if command -v node &> /dev/null; then
    echo "   Node.js 版本: $(node -v)"
    echo "   NPM 版本: $(npm -v)"
else
    echo "   ❌ Node.js 未安装"
fi
echo ""

# 检查当前进程
echo "3. 当前进程资源使用："
echo "   Node.js 进程："
ps aux | grep -E "node|pm2" | grep -v grep | awk '{printf "   PID: %s, CPU: %s%%, MEM: %s%%\n", $2, $3, $4}'
echo ""

# 检查端口占用
echo "4. 端口占用情况："
if command -v netstat &> /dev/null; then
    netstat -tlnp 2>/dev/null | grep -E ":5001|:80|:443" | awk '{printf "   端口 %s: %s\n", $4, $7}'
elif command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep -E ":5001|:80|:443" | awk '{printf "   端口 %s: %s\n", $4, $7}'
fi
echo ""

# 检查磁盘空间
echo "5. 磁盘空间："
df -h / | tail -1 | awk '{printf "   使用率: %s, 可用: %s\n", $5, $4}'
echo ""

# 测试内存使用（启动一个简单的 Node.js 进程）
echo "6. 测试 Node.js 内存使用："
if command -v node &> /dev/null; then
    node -e "
        const os = require('os');
        const totalMem = os.totalmem() / 1024 / 1024 / 1024;
        const freeMem = os.freemem() / 1024 / 1024 / 1024;
        const usedMem = totalMem - freeMem;
        console.log('   总内存: ' + totalMem.toFixed(2) + ' GB');
        console.log('   已用内存: ' + usedMem.toFixed(2) + ' GB');
        console.log('   可用内存: ' + freeMem.toFixed(2) + ' GB');
        console.log('   内存使用率: ' + ((usedMem / totalMem) * 100).toFixed(1) + '%');
    "
else
    echo "   ❌ Node.js 未安装，无法测试"
fi
echo ""

# 检查 PM2（如果安装）
if command -v pm2 &> /dev/null; then
    echo "7. PM2 进程状态："
    pm2 list 2>/dev/null || echo "   无 PM2 进程运行"
    echo ""
fi

# 性能建议
echo "========================================="
echo "性能建议："
echo "========================================="
CPU_COUNT=$(nproc)
TOTAL_MEM=$(free -m | awk '/^Mem:/ {print $2}')

if [ "$CPU_COUNT" -le 2 ]; then
    echo "✅ CPU核心数: $CPU_COUNT (适合低配置服务器)"
    echo "   建议: 使用 1-2 个 worker 进程"
else
    echo "ℹ️  CPU核心数: $CPU_COUNT"
    echo "   建议: 可以使用更多 worker 进程"
fi

if [ "$TOTAL_MEM" -lt 4096 ]; then
    echo "⚠️  总内存: ${TOTAL_MEM}MB (小于4GB)"
    echo "   建议:"
    echo "   - 确保 Node.js 进程内存限制在 500MB 以内"
    echo "   - 使用 PM2 监控内存使用"
    echo "   - 考虑启用 swap 分区"
else
    echo "✅ 总内存: ${TOTAL_MEM}MB (足够)"
fi

echo ""
echo "========================================="


