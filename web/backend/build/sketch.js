/* eslint-disable */
/* eslint-env browser */
/*
----- Coding Tutorial by Patt Vira ----- 
Name: Interactive Fridge Magnets
Video Tutorial: https://youtu.be/72pAzuD8tqE

Connect with Patt: @pattvira
https://www.pattvira.com/
----------------------------------------
*/

/* global p5, ml5, window, self, globalThis, createCanvas, createCapture, VIDEO, 
   loadImage, image, background, fill, text, textSize, textAlign, rect, rectMode, 
   ellipse, push, pop, translate, rotate, imageMode, dist, width, height, CENTER, 
   TWO_PI, random, min, max, constrain, millis, saveCanvas, createButton, 
   createVector, sqrt, mouseX, mouseY, noStroke */

let video; let handPose; let hands = [];
let size = 35;
let magnets = []; let num = 5;
let gifImage; // GIF 图片变量
let canvas; // p5 画布对象

// 拍摄相关
let isRecording = false;
let isProcessing = false;
let recordingStartTime = 0;
let maxRecordingTime = 10000; // 10秒，单位毫秒
let mediaRecorder;
let recordedChunks = [];
let captureButton;
let buttonX, buttonY, buttonSize = 60;
let buttonPressed = false;
let pressStartTime = 0;
let longPressThreshold = 200; // 长按阈值（毫秒）

// 预览相关
let previewContainer = null;
let previewVideo = null;
let previewDownloadButton = null;
let currentVideoBlob = null;

// FFmpeg 相关（用于视频合成）
let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

// 画布尺寸（3:4 比例，宽3高4）
let canvasWidth = 810;  // 宽
let canvasHeight = 1080; // 高 (810 * 4/3 = 1080)

function preload() {
  handPose = ml5.handPose({flipped: true});
  gifImage = loadImage('/GIF/1.gif'); // 加载 GIF 图片（使用绝对路径）
  
  // 延迟加载 FFmpeg，确保脚本已完全加载
  setTimeout(() => {
    console.log('Attempting to load FFmpeg in preload...');
    loadFFmpeg();
  }, 1000);
}

async function loadFFmpeg() {
  if (ffmpegLoading || ffmpegLoaded) {
    console.log('FFmpeg already loading or loaded, skipping...');
    return;
  }
  ffmpegLoading = true;
  console.log('Starting FFmpeg load...');
  console.log('Current window.FFmpegWASM:', typeof window !== 'undefined' ? (window.FFmpegWASM ? 'exists' : 'undefined') : 'window undefined');
  
  try {
    // 直接检查，不等待（脚本应该已经加载）
    let FFmpegWASMObj = null;
    
    // 检查 FFmpegWASM 对象（可能在 window 或 self 中）
    if (typeof window !== 'undefined' && window.FFmpegWASM) {
      FFmpegWASMObj = window.FFmpegWASM;
      console.log('✓ Found FFmpegWASM in window');
    } else if (typeof self !== 'undefined' && self.FFmpegWASM) {
      FFmpegWASMObj = self.FFmpegWASM;
      console.log('✓ Found FFmpegWASM in self');
    } else if (typeof globalThis !== 'undefined' && globalThis.FFmpegWASM) {
      FFmpegWASMObj = globalThis.FFmpegWASM;
      console.log('✓ Found FFmpegWASM in globalThis');
    } else {
      // 如果没找到，等待一下再试
      console.log('FFmpegWASM not found immediately, waiting...');
      let waitCount = 0;
      while (waitCount < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (typeof window !== 'undefined' && window.FFmpegWASM) {
          FFmpegWASMObj = window.FFmpegWASM;
          console.log('✓ Found FFmpegWASM in window after waiting');
          break;
        }
        waitCount++;
      }
    }
    
    if (!FFmpegWASMObj) {
      // 调试：检查全局变量
      const globals = [];
      if (typeof window !== 'undefined') {
        globals.push(...Object.keys(window).filter(k => 
          k.toLowerCase().includes('ffmpeg') || 
          k.toLowerCase().includes('wasm')
        ));
      }
      console.error('✗ FFmpegWASM not found!');
      console.log('Available FFmpeg/WASM-related globals:', globals);
      console.log('window object keys (first 20):', Object.keys(window).slice(0, 20));
      throw new Error('FFmpegWASM not found in global scope. Script may not have loaded.');
    }
    
    if (!FFmpegWASMObj.FFmpeg) {
      console.error('✗ FFmpegWASM.FFmpeg not found!');
      console.log('FFmpegWASM keys:', Object.keys(FFmpegWASMObj));
      throw new Error('FFmpegWASM.FFmpeg not found');
    }
    
    console.log('Creating FFmpeg instance...');
    const { FFmpeg } = FFmpegWASMObj;
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });
    
    // 检查 util 函数
    if (!window.toBlobURL) {
      throw new Error('window.toBlobURL not found. Make sure util.js is loaded.');
    }
    
    console.log('Loading FFmpeg core files...');
    // 使用本地文件路径（相对路径）
    const coreBase = 'libs/ffmpeg';
    const coreURL = await window.toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await window.toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm');
    console.log('Core URLs created');
    
    await ffmpeg.load({
      coreURL: coreURL,
      wasmURL: wasmURL,
    });
    
    ffmpegLoaded = true;
    console.log('✓ FFmpeg loaded successfully from local files');
  } catch (error) {
    console.error('✗ FFmpeg load failed:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    ffmpegLoaded = false;
  } finally {
    ffmpegLoading = false;
  }
}


function setup() {
  // 创建 3:4 画布（宽3高4）
  // 设置 willReadFrequently 以优化频繁读取 canvas 数据的性能
  let p5Canvas = createCanvas(canvasWidth, canvasHeight);
  canvas = p5Canvas;
  
  // 查找 canvas-container 元素
  const container = document.getElementById('canvas-container');
  if (container) {
    canvas.parent(container);
  } else {
    // 如果找不到，使用默认方式
    canvas.parent('canvas-container');
  }
  
  // 设置 canvas 上下文属性以优化性能
  if (canvas.elt && canvas.elt.getContext) {
    let ctx = canvas.elt.getContext('2d', { willReadFrequently: true });
  }
  
  // 隐藏 loading
  setTimeout(() => {
    let loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(() => loading.style.display = 'none', 300);
    }
  }, 1000);
  
  // 请求摄像头权限（iOS 需要）
  // p5.js v1.6.0 的 createCapture API 使用回调函数
  video = createCapture(VIDEO, function(stream) {
    // 摄像头成功启动后的回调
    console.log('Camera access granted');
  });
  // 不强制设置视频尺寸，保持摄像头原始比例
  video.hide();
  
  // 等待视频准备就绪后再启动手部检测
  video.elt.addEventListener('loadedmetadata', function() {
  handPose.detectStart(video, gotHands);
  });
  
  // 创建磁铁对象
  rectMode(CENTER);
  for (let i=0; i<num; i++) {
    magnets[i] = new Magnet();
    magnets[i].init();
  }
  
  // 设置按钮位置（画布底部中央）
  buttonX = width / 2;
  buttonY = height - 80;
  
  // 创建拍摄按钮（使用原生 HTML 按钮，更易处理触摸事件）
  captureButton = createButton('');
  captureButton.position(buttonX - buttonSize/2, buttonY - buttonSize/2);
  captureButton.size(buttonSize, buttonSize);
  captureButton.style('border-radius', '50%');
  captureButton.style('border', 'none');
  captureButton.style('background', 'transparent');
  captureButton.style('cursor', 'pointer');
  captureButton.style('z-index', '1000');
  captureButton.style('opacity', '0.01'); // 几乎透明但保持可点击
  captureButton.style('pointer-events', 'auto'); // 确保可以接收点击事件
  
  // 使用原生事件处理
  let btnElement = captureButton.elt;
  btnElement.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Mouse down on button');
    startCapture();
  });
  btnElement.addEventListener('mouseup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Mouse up on button');
    endCapture();
  });
  btnElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Touch start on button');
    startCapture();
  });
  btnElement.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Touch end on button');
    endCapture();
  });
  btnElement.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Touch cancel on button');
    endCapture();
  });
  
  // 添加点击事件作为备用
  btnElement.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Click on button');
    // 如果快速点击，直接拍照
    if (!isRecording && !isProcessing) {
      takePhoto();
    }
  });

  // 创建视频预览层（初始隐藏）
  initPreviewOverlay();
  
  // 延迟初始化 MediaRecorder，确保 canvas 完全准备好
  setTimeout(() => {
    setupMediaRecorder();
  }, 500);
}

// 创建录制完成后的视频预览浮层
function initPreviewOverlay() {
  // 容器
  previewContainer = document.createElement('div');
  previewContainer.id = 'preview-container';
  Object.assign(previewContainer.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.75)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2000',
  });

  // 内部包裹框
  const inner = document.createElement('div');
  Object.assign(inner.style, {
    position: 'relative',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  });

  // 视频元素
  previewVideo = document.createElement('video');
  previewVideo.controls = true;
  previewVideo.style.maxWidth = '100%';
  previewVideo.style.maxHeight = '80vh';
  previewVideo.style.borderRadius = '12px';
  previewVideo.style.backgroundColor = 'black';

  // 下载按钮
  previewDownloadButton = document.createElement('button');
  previewDownloadButton.textContent = '下载视频';
  Object.assign(previewDownloadButton.style, {
    position: 'absolute',
    right: '16px',
    bottom: '16px',
    padding: '10px 18px',
    borderRadius: '999px',
    border: 'none',
    background: '#ff7a18',
    color: '#111',
    fontSize: '14px',
    cursor: 'pointer',
  });
  previewDownloadButton.onclick = async () => {
    if (!currentVideoBlob) return;
    
    // 显示处理中提示
    previewDownloadButton.textContent = '处理中...';
    previewDownloadButton.disabled = true;
    
    try {
      // 如果 FFmpeg 还没加载，尝试重新加载
      if (!ffmpegLoaded && !ffmpegLoading) {
        console.log('FFmpeg not loaded, attempting to load...');
        await loadFFmpeg();
      }
      
      // 等待 FFmpeg 加载完成
      if (!ffmpegLoaded) {
        let waitCount = 0;
        while (!ffmpegLoaded && waitCount < 100 && ffmpegLoading) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
      }
      
      // 检查 FFmpeg 状态
      console.log('FFmpeg status check:');
      console.log('  ffmpegLoaded:', ffmpegLoaded);
      console.log('  ffmpeg:', ffmpeg);
      console.log('  ffmpeg.loaded:', ffmpeg ? ffmpeg.loaded : 'N/A');
      console.log('  window.fetchFile:', typeof window.fetchFile);
      console.log('  window.toBlobURL:', typeof window.toBlobURL);
      
      // 如果 ffmpeg 对象存在但标志未设置，检查它是否已加载
      if (ffmpeg && !ffmpegLoaded) {
        if (ffmpeg.loaded) {
          console.log('FFmpeg object exists and is loaded, updating flag...');
          ffmpegLoaded = true;
        } else {
          console.log('FFmpeg object exists but not loaded, attempting to load...');
          try {
            const coreBase = 'libs/ffmpeg';
            const coreURL = await window.toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript');
            const wasmURL = await window.toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm');
            await ffmpeg.load({
              coreURL: coreURL,
              wasmURL: wasmURL,
            });
            ffmpegLoaded = true;
            console.log('FFmpeg loaded successfully');
          } catch (loadError) {
            console.error('Failed to load FFmpeg:', loadError);
          }
        }
      }
      
      // 尝试合成视频（添加片头片尾）
      if (ffmpeg && ffmpeg.loaded && window.fetchFile) {
        console.log('Starting video processing...');
        const finalBlob = await processVideoWithIntroOutro(currentVideoBlob);
        const filename = 'video_' + Date.now() + '.mp4';
        downloadBlob(finalBlob, filename);
        previewDownloadButton.textContent = '下载完成';
        setTimeout(() => {
          previewDownloadButton.textContent = '下载视频';
        }, 2000);
      } else {
        const missing = [];
        if (!ffmpeg) missing.push('ffmpeg=null');
        else if (!ffmpeg.loaded) missing.push('ffmpeg.loaded=false');
        if (!window.fetchFile) missing.push('fetchFile=undefined');
        throw new Error('FFmpeg not available: ' + missing.join(', '));
      }
    } catch (error) {
      console.error('Video processing failed, downloading original:', error);
      // 如果处理失败，直接下载原始视频
      const filename = 'video_' + Date.now() + '.webm';
      downloadBlob(currentVideoBlob, filename);
      previewDownloadButton.textContent = '已下载（无片头片尾）';
      setTimeout(() => {
        previewDownloadButton.textContent = '下载视频';
      }, 2000);
    } finally {
      previewDownloadButton.disabled = false;
    }
  };

  // 关闭区域：点击背景关闭预览（不影响按钮）
  previewContainer.addEventListener('click', (e) => {
    if (e.target === previewContainer) {
      hidePreview();
    }
  });

  inner.appendChild(previewVideo);
  inner.appendChild(previewDownloadButton);
  previewContainer.appendChild(inner);
  document.body.appendChild(previewContainer);
}

function showPreview(blob) {
  currentVideoBlob = blob;
  const url = URL.createObjectURL(blob);
  previewVideo.src = url;
  previewVideo.currentTime = 0;
  previewVideo.play().catch(() => {});
  previewContainer.style.display = 'flex';
}

function hidePreview() {
  if (previewContainer) {
    previewContainer.style.display = 'none';
  }
  if (previewVideo) {
    previewVideo.pause();
    previewVideo.removeAttribute('src');
    previewVideo.load();
  }
  if (currentVideoBlob) {
    // 预览的 URL 在 downloadBlob 里会重新创建，这里只负责预览 URL 的释放
    // 注意：我们没有保存预览时的 objectURL，所以不在这里 revoke
  }
  currentVideoBlob = null;
}

function setupMediaRecorder() {
  // 确保 canvas 已准备好
  if (!canvas || !canvas.elt || !canvas.elt.captureStream) {
    console.warn('Canvas not ready, retrying...');
    setTimeout(() => setupMediaRecorder(), 500);
    return;
  }
  
  try {
    // 获取画布的媒体流
    let stream = canvas.elt.captureStream(30); // 30fps
    
    const options = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 // 5Mbps for 1080p
    };
    
    // 检查浏览器是否支持指定的 mimeType
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      // 如果不支持 vp9，尝试 vp8
      options.mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        // 如果 vp8 也不支持，使用默认
        delete options.mimeType;
      }
    }
    
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    mediaRecorder.onstop = handleRecordingStop;
    console.log('MediaRecorder initialized with:', options.mimeType || 'default');
  } catch (e) {
    console.error('MediaRecorder setup error:', e);
    // 尝试使用默认选项
    try {
      let stream = canvas.elt.captureStream(30);
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      mediaRecorder.onstop = handleRecordingStop;
      console.log('MediaRecorder initialized with default options');
    } catch (e2) {
      console.error('MediaRecorder initialization completely failed:', e2);
    }
  }
}

function startCapture() {
  console.log('Button pressed');
  buttonPressed = true;
  pressStartTime = millis();
  
  // 延迟判断是长按还是点击
  setTimeout(() => {
    if (buttonPressed && millis() - pressStartTime >= longPressThreshold) {
      // 长按：开始录制视频
      console.log('Long press detected, starting recording');
      startRecording();
    }
  }, longPressThreshold);
}

function endCapture() {
  if (!buttonPressed) {
    console.log('Button not pressed, ignoring');
    return;
  }
  
  let pressDuration = millis() - pressStartTime;
  buttonPressed = false;
  
  console.log('Button released, duration:', pressDuration, 'ms');
  
  if (pressDuration < longPressThreshold) {
    // 短按：拍照
    console.log('Short press detected, taking photo');
    if (!isRecording && !isProcessing) {
      takePhoto();
    } else {
      console.log('Cannot take photo: isRecording =', isRecording, 'isProcessing =', isProcessing);
    }
  } else {
    // 长按结束：停止录制
    console.log('Long press ended, stopping recording');
    if (isRecording) {
      stopRecording();
    }
  }
}

function takePhoto() {
  console.log('Taking photo...');
  
  // 检查 canvas 是否准备好
  if (!canvas || !canvas.elt) {
    console.error('Canvas not ready');
    return;
  }
  
  try {
    // 使用 p5.js 的 saveCanvas 方法（更可靠）
    saveCanvas(canvas, 'photo_' + Date.now(), 'png');
    console.log('Photo saved');
  } catch (error) {
    console.error('Error taking photo:', error);
    // 备用方案：使用 toBlob
    try {
      canvas.elt.toBlob((blob) => {
        if (blob) {
          let url = URL.createObjectURL(blob);
          let a = document.createElement('a');
          a.href = url;
          a.download = 'photo_' + Date.now() + '.png';
          a.click();
          URL.revokeObjectURL(url);
          console.log('Photo downloaded via toBlob');
        } else {
          console.error('Failed to create blob');
        }
      }, 'image/png');
    } catch (e) {
      console.error('Both photo methods failed:', e);
    }
  }
}

function startRecording() {
  if (isRecording || isProcessing) return;
  
  isRecording = true;
  recordingStartTime = millis();
  recordedChunks = [];
  
  if (mediaRecorder && mediaRecorder.state === 'inactive') {
    mediaRecorder.start();
    console.log('Recording started');
  }
  
  // 更新按钮样式
  captureButton.style('background', 'rgba(255, 0, 0, 0.7)');
  
  // 10秒后自动停止
  setTimeout(() => {
    if (isRecording) {
      stopRecording();
    }
  }, maxRecordingTime);
}

function stopRecording() {
  if (!isRecording) return;
  
  isRecording = false;
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    console.log('Recording stopped');
  }
  
  // 恢复按钮样式
  captureButton.style('background', 'rgba(255, 255, 255, 0.3)');
}

function handleRecordingStop() {
  isProcessing = true;
  console.log('Preparing video preview...');
  
  // 创建 blob，用于预览和下载
  let blob = new Blob(recordedChunks, { type: 'video/webm' });
  showPreview(blob);
  
  isProcessing = false;
}


async function processVideoWithIntroOutro(recordedBlob) {
  // 等待 FFmpeg 加载
  if (!ffmpegLoaded) {
    // 如果还没加载，等待一下
    let waitCount = 0;
    while (!ffmpegLoaded && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    if (!ffmpegLoaded || !ffmpeg || !window.fetchFile) {
      throw new Error('FFmpeg not available');
    }
  }
  
  try {
    // 读取录制的视频
    await ffmpeg.writeFile('recorded.webm', await window.fetchFile(recordedBlob));
    
    // 读取片头和片尾视频（使用绝对路径）
    const startVideo = await window.fetchFile('/VIDEO/start.mp4');
    const endVideo = await window.fetchFile('/VIDEO/end.mp4');
    
    await ffmpeg.writeFile('start.mp4', startVideo);
    await ffmpeg.writeFile('end.mp4', endVideo);
    
    // 方法1: 尝试使用 concat demuxer
    try {
      await ffmpeg.writeFile('filelist.txt', 'file start.mp4\nfile recorded.webm\nfile end.mp4\n');
      
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'filelist.txt',
        '-c', 'copy',
        '-y',
        'output.mp4'
      ]);
      
      const data = await ffmpeg.readFile('output.mp4');
      return new Blob([data.buffer], { type: 'video/mp4' });
    } catch (e) {
      console.log('Concat demuxer failed, trying filter_complex:', e);
    }
    
    // 方法2: 使用 filter_complex 重新编码（兼容性更好）
    // 调整到 3:4 比例 (810x1080)
    await ffmpeg.exec([
      '-i', 'start.mp4',
      '-i', 'recorded.webm',
      '-i', 'end.mp4',
      '-filter_complex', '[0:v:0]scale=810:1080[v0];[1:v:0]scale=810:1080[v1];[2:v:0]scale=810:1080[v2];[v0][0:a:0?][v1][1:a:0?][v2][2:a:0?]concat=n=3:v=1:a=1[outv][outa]',
      '-map', '[outv]',
      '-map', '[outa]?',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-s', '810x1080',
      '-pix_fmt', 'yuv420p',
      '-y',
      'output.mp4'
    ]);
    
    const data = await ffmpeg.readFile('output.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  } catch (error) {
    console.error('Video processing error:', error);
    throw error;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  console.log('Video downloaded:', filename);
}

function draw() {
  background(220);
  
  // 显示视频（保持原始宽高比，在画布上居中显示）
  if (video && video.width > 0 && video.height > 0) {
    let videoAspect = video.width / video.height;
    let canvasAspect = width / height;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (videoAspect > canvasAspect) {
      // 视频更宽，以宽度为准
      displayWidth = width;
      displayHeight = width / videoAspect;
      offsetX = 0;
      offsetY = (height - displayHeight) / 2;
    } else {
      // 视频更高，以高度为准
      displayHeight = height;
      displayWidth = height * videoAspect;
      offsetX = (width - displayWidth) / 2;
      offsetY = 0;
    }
    
    // 居中显示视频，保持原始比例
    image(video, offsetX, offsetY, displayWidth, displayHeight);
  }
  
  // 检测手部并控制磁铁
  if (hands.length > 0) {
    let index = hands[0].keypoints[8];
    let thumb = hands[0].keypoints[4];
    
    // 控制磁铁（无论是否在拍摄都可以移动）
    for (let i=0; i<num; i++) {
      magnets[i].touch(thumb.x, thumb.y, index.x, index.y);
    }
  }
  
  // 显示所有磁铁
  for (let i=0; i<num; i++) {
    magnets[i].display();
  }
  
  // 绘制拍摄按钮（使用 p5 绘制，覆盖 HTML 按钮）
  drawCaptureButton();
  
  // 显示录制时间
  if (isRecording) {
    let elapsed = millis() - recordingStartTime;
    let remaining = max(0, maxRecordingTime - elapsed);
    let seconds = (remaining / 1000).toFixed(1);
    
    fill(255, 0, 0);
    textSize(24);
    textAlign(CENTER);
    text(seconds + 's', width/2, 50);
  }
  
  // 显示处理中提示（下载视频）
  if (isProcessing) {
    fill(0, 150);
    rect(0, 0, width, height);
    fill(255);
    textSize(32);
    textAlign(CENTER, CENTER);
    text('正在下载视频...', width/2, height/2);
  }
}

// 鼠标点击检测（在画布上直接检测按钮区域）
function mousePressed() {
  // 检查鼠标是否点击在按钮区域
  let distFromButton = dist(mouseX, mouseY, buttonX, buttonY);
  if (distFromButton < buttonSize / 2 + 10) { // 按钮半径 + 一些容差
    console.log('Mouse clicked on button area');
    startCapture();
    return false; // 阻止默认行为
  }
}

function mouseReleased() {
  // 检查鼠标是否在按钮区域释放
  let distFromButton = dist(mouseX, mouseY, buttonX, buttonY);
  if (distFromButton < buttonSize / 2 + 10) {
    console.log('Mouse released on button area');
    endCapture();
    return false; // 阻止默认行为
  }
}

function drawCaptureButton() {
  push();
  translate(buttonX, buttonY);
  
  // 外圈（白色半透明）
  fill(255, 100);
  noStroke();
  ellipse(0, 0, buttonSize + 10, buttonSize + 10);
  
  // 内圈
  if (isRecording) {
    fill(255, 0, 0, 200);
  } else {
    fill(255, 150);
  }
  ellipse(0, 0, buttonSize, buttonSize);
  
  // 录制指示（红色方块）
  if (isRecording) {
    fill(255);
    rectMode(CENTER);
    rect(0, 0, 15, 15, 3);
  } else {
    // 未录制时显示白色圆圈
    fill(255);
    ellipse(0, 0, buttonSize - 20, buttonSize - 20);
  }
  
  pop();
}

function gotHands(results) {
  hands = results;
}
