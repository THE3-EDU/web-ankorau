@echo off
echo 正在下载 FFmpeg 文件...

REM 创建 FFmpeg 目录
if not exist "libs\ffmpeg" mkdir libs\ffmpeg

REM 下载 @ffmpeg/ffmpeg
echo 下载 @ffmpeg/ffmpeg...
curl -L "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/ffmpeg.js" -o libs\ffmpeg\ffmpeg.js

REM 下载 @ffmpeg/util
echo 下载 @ffmpeg/util...
curl -L "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/util.js" -o libs\ffmpeg\util.js

REM 下载 @ffmpeg/core
echo 下载 @ffmpeg/core...
curl -L "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js" -o libs\ffmpeg\ffmpeg-core.js
curl -L "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm" -o libs\ffmpeg\ffmpeg-core.wasm

echo 下载完成！文件已保存到 libs\ffmpeg\ 目录
pause

