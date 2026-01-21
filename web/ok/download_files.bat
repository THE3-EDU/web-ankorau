@echo off
REM 创建 libs 目录
if not exist libs mkdir libs

echo 正在下载 p5.js...
curl -L -o libs\p5.js "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.6.0/p5.js"
curl -L -o libs\p5.min.js "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.6.0/p5.min.js"

echo 正在下载 ml5.js...
curl -L -o libs\ml5.min.js "https://unpkg.com/ml5@latest/dist/ml5.min.js"

echo 下载完成！文件已保存到 libs\ 目录
echo.
echo 文件列表：
dir libs

pause

