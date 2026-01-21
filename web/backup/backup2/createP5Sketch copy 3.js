// p5.js sketch 创建函数
import p5 from 'p5';
import { Hands } from '@mediapipe/hands';

// 全局错误处理：忽略 WebGPU 和 MediaPipe WASM 相关错误
if (typeof window !== 'undefined') {
  const originalErrorHandler = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    const messageStr = String(message || '');
    // 忽略 WebGPU 相关错误
    if (messageStr.includes('webgpu') || 
        messageStr.includes('requestAdapterInfo') ||
        messageStr.includes('Initialization of backend webgpu failed')) {
      return true; // 阻止默认错误处理
    }
    // 忽略 MediaPipe WASM 相关错误
    if (messageStr.includes('Module.arguments') || 
        messageStr.includes('Aborted') ||
        messageStr.includes('mediapipe') ||
        messageStr.includes('hands_solution_simd_wasm_bin') ||
        messageStr.includes('hands.js') ||
        messageStr.includes('t is not a function')) {
      return true; // 阻止默认错误处理
    }
    // 其他错误使用原始处理器
    if (originalErrorHandler) {
      return originalErrorHandler(message, source, lineno, colno, error);
    }
    return false;
  };
  
  // 处理未捕获的 Promise 拒绝
  window.addEventListener('unhandledrejection', function(event) {
    const reason = String(event.reason || '');
    // 忽略 WebGPU 和 MediaPipe 相关错误
    if (reason.includes('webgpu') || 
        reason.includes('requestAdapterInfo') ||
        reason.includes('Module.arguments') ||
        reason.includes('Aborted') ||
        reason.includes('mediapipe') ||
        reason.includes('hands_solution_simd_wasm_bin') ||
        reason.includes('hands.js') ||
        reason.includes('t is not a function')) {
      event.preventDefault(); // 阻止默认错误处理
    }
  });
  
}
// 每次页面加载时重置 MediaPipe 状态（确保刷新后重新初始化）
// 注意：页面刷新时，window 对象会保留，但 MediaPipe 对象会被销毁
// 所以需要在每次创建 sketch 时检查并重置状态
if (typeof window !== 'undefined') {
  // 检查 MediaPipe 对象是否真的存在且可用
  if (!window.handsSolution || 
      typeof window.handsSolution.send !== 'function' ||
      typeof window.handsSolution.initialize !== 'function') {
    // MediaPipe 对象不存在或已失效，重置所有状态
    window.handsInitialized = false;
    window.handsSolution = null;
    window.isHandPoseReady = false;
    window.hands = [];
  }
  // 如果变量未定义，初始化它们
  if (window.handsInitialized === undefined) window.handsInitialized = false;
  if (window.handsSolution === undefined) window.handsSolution = null;
  if (window.isHandPoseReady === undefined) window.isHandPoseReady = false;
  if (window.hands === undefined) window.hands = [];
}

// P5SketchConfig 配置对象类型说明（JSDoc 注释已移除，避免 p5.js 解析错误）

export function createP5Sketch(config) {
  const {
    containerRef,
    onLoadingChange,
    onMediaPipeLoadingChange, // 新增：MediaPipe 加载状态回调
    setPreviewUrl,
    setPreviewIsMp4,
    setElapsedTime,
    setCanvasStopped,
    setVideoStopped,
    canvasChunksRef,
    videoChunksRef,
    elapsedTimerRef,
    uploadToOSSRef,
    processVideoWithFCRef,
    startRecordingRef,
    stopRecordingRef,
    takePhotoRef,
    switchCameraRef,
    FC_FUNCTION_URL,
    resolution = 'high', // 新增：分辨率选项 'high' (1080x1440) 或 'low' (720x960)
    enableMediaPipe = true, // 新增：是否启用 MediaPipe 手势识别
  } = config;

  let mounted = true;
  let loadingTimeout = null;

  if (!containerRef.current) return;
  
  const sketch = new p5((p) => {
    let video;
    // 调试：用于在界面上显示摄像头状态的小文字元素
    let videoStatusEl = null;
    let lastVideoStatusText = '';
    // 当前使用的摄像头：'user' (前置) 或 'environment' (后置)
    let currentFacingMode = 'user';
    // 当前视频流
    let currentStream = null;
    // let window.handsSolution = null;
    // let hands = [];
    // let window.isHandPoseReady = false;
    // let window.handsInitialized = false; // 确保只初始化一次
    // 根据分辨率选项设置画布尺寸
    const canvasW = resolution === 'low' ? 720 : 1080;
    const canvasH = resolution === 'low' ? 960 : 1440;
    const recordCanvasW = canvasW;
    const recordCanvasH = canvasH;

    let canvasRecorder = null;
    let videoRecorder = null;
    let canvasChunks = [];
    let videoChunks = [];
    let isRecording = false;

    let recordCanvas = null;
    let recordCtx = null;
    let isReady = false;
    
    // 用于每3秒打印一次hands信息
    let lastHandsLogTime = 0;
    
    // 低分辨率检测画布（用于 MediaPipe 检测，降低计算量）
    let detectCanvas = null;
    let detectCtx = null;
    // 降低检测分辨率（4:3 比例，与视频比例一致），进一步减轻手机端负担
    // 640x480 只承担检测，不影响主画面显示清晰度
    const detectCanvasW = 180;
    const detectCanvasH = detectCanvasW * (4/3);

    // 吸铁石 GIF 相关（小马），支持多个实例
    class Magnet {
      constructor(pInstance, img) {
        this.p = pInstance;
        this.img = img || null;
        this.x = 0;
        this.y = 0;
        this.angle = this.p.random(this.p.TWO_PI);
        this.c = this.p.color(255);

        // 图片尺寸
        this.w = 100;
        this.h = 100;
        this.baseW = 100; // 初始基础宽度
        this.baseH = 100; // 初始基础高度

        this.pos = this.p.createVector(0, 0);
        this.fingerx = 0;
        this.fingery = 0;
        this.initialized = false;

        // 缩放 / 选中相关
        this.isSelected = false;
        this.isBeingScaled = false;
        this.initialSize = this.p.createVector(0, 0);
        this.initialDepth = 0; // 用于深度缩放的基准
      }

      setImage(img) {
        this.img = img;
        this.initialized = false;
      }

      init(canvasWLocal, canvasHLocal) {
        if (!this.initialized && this.img) {
          // 随机落点时，离边框保留一定安全边距，避免贴边
          const marginX = canvasWLocal * 0.08; // 左右各预留 8%
          const marginY = canvasHLocal * 0.08; // 上下各预留 8%
          this.x = this.p.random(marginX, canvasWLocal - marginX);
          this.y = this.p.random(marginY, canvasHLocal - marginY);
          this.pos = this.p.createVector(this.x, this.y);

          // 使用图片的实际尺寸，或按比例缩放（初始约为 2 倍大小）
          if (this.img.width > 0 && this.img.height > 0) {
            const maxSize = 300; // 初始目标尺寸调大到原来的约 2 倍
            const scale = Math.min(maxSize / this.img.width, maxSize / this.img.height);
            this.w = this.img.width * scale;
            this.h = this.img.height * scale;
            this.baseW = this.w; // 记录初始基础尺寸
            this.baseH = this.h;
          } else {
            this.w = 100;
            this.h = 100;
            this.baseW = 100;
            this.baseH = 100;
          }

          this.initialized = true;
        }
      }

      display(canvasWLocal, canvasHLocal) {
        if (!this.img) return;
        if (!this.initialized) {
          this.init(canvasWLocal, canvasHLocal);
        }

        this.p.push();
        this.p.translate(this.pos.x, this.pos.y);
        this.p.rotate(this.angle);

        this.p.imageMode(this.p.CENTER);
        this.p.image(this.img, 0, 0, this.w, this.h);

        this.p.pop();
      }

      // thumb: 大拇指尖，index: 食指尖，middle: 中指尖，wrist: 手腕
      // middlez: 中指尖的 z 坐标，wristz: 手腕的 z 坐标
      touch(thumbx, thumby, indexx, indexy, middlex, middley, middlez, wristx, wristy, wristz) {
        const distBetweenFingers = this.p.dist(thumbx, thumby, indexx, indexy);
        this.fingerx = (thumbx + indexx) / 2;
        this.fingery = (thumby + indexy) / 2;

        const distFromFingers = this.p.dist(this.pos.x, this.pos.y, this.fingerx, this.fingery);

        const detectionRadius = Math.sqrt(this.w * this.w + this.h * this.h) / 2;

        // 选中范围略大于自身（1 倍半径），需要比较靠近才能选中
        const isNear = distFromFingers < detectionRadius * 1;
        // 手指捏合阈值更严格
        const isPinching = distBetweenFingers < 90;

        // 一次只能选中一个小马：按下捏合并靠近即可选中当前小马
        if (!this.isSelected && !selectedMagnet && isPinching && isNear) {
          this.isSelected = true;
          this.isBeingScaled = true;

          // 使用中指尖的 z 坐标作为深度基准（z 值越大，手离摄像头越近）
          // MediaPipe 的 z 坐标通常是归一化的，范围可能不同
          // 直接使用 z 值，通过相对变化来判断远近
          if (middlez !== undefined && !isNaN(middlez)) {
            this.initialDepth = middlez;
          } else {
            this.initialDepth = 0; // 默认值
          }

          this.initialSize = this.p.createVector(this.w, this.h);
          this.pos.x = this.fingerx;
          this.pos.y = this.fingery;
          selectedMagnet = this;
        }

        if (this.isSelected) {
          if (isPinching) {
            // 使用中指尖的 z 坐标判断深度：z 值越大，手离摄像头越近，小马应该越大
            let currentDepth = this.initialDepth; // 默认使用初始深度
            if (middlez !== undefined && !isNaN(middlez)) {
              currentDepth = middlez;
            }

            // 缩放功能已禁用
            // 初始化基准：第一次检测到有效深度时记录
            // if (this.initialDepth === 0 && currentDepth !== 0) {
            //   this.initialDepth = currentDepth;
            //   this.initialSize = this.p.createVector(this.w, this.h);
            // }

            // 计算深度变化：使用 z 坐标的相对变化
            // MediaPipe 的 z 坐标：z 值越大，手离摄像头越近
            // 为了计算比例，将 z 转换为正值范围（假设 z 范围是 -0.5 到 0.5）
            // 使用偏移量将 z 映射到 0-1 范围：normalized_z = z + 0.5
            // 缩放功能已禁用，保持初始大小不变
            // if (this.initialDepth !== 0 && currentDepth !== 0) {
            //   // 将 z 坐标归一化到正值范围（假设 z 范围是 -0.5 到 0.5）
            //   const offset = 0.5; // 偏移量，将 z 从 [-0.5, 0.5] 映射到 [0, 1]
            //   const normalizedInitial = this.initialDepth + offset;
            //   const normalizedCurrent = currentDepth + offset;
            //   
            //   // 避免除零：如果 normalizedInitial 太小，使用默认值
            //   if (normalizedInitial < 0.01) {
            //     this.initialDepth = currentDepth;
            //     return;
            //   }
            //   
            //   // 计算深度比例：当手靠近（z 增大）时，normalizedCurrent 增大，比例 > 1，小马放大
            //   // 当手远离（z 减小）时，normalizedCurrent 减小，比例 < 1，小马缩小
            //   let depthRatio = normalizedCurrent / normalizedInitial;
            //   
            //   // 基于基础尺寸计算目标尺寸（始终基于 baseW/baseH）
            //   let targetW = this.baseW * depthRatio;
            //   let targetH = this.baseH * depthRatio;
            //   
            //   // 限制始终基于基础尺寸：最小 0.7 倍，最大 5 倍（初始大小的5倍）
            //   const minW = this.baseW * 0.7;
            //   const maxW = this.baseW * 5.0;
            //   targetW = this.p.constrain(targetW, minW, maxW);
            //   // 保持宽高比（基于基础尺寸的比例）
            //   const ratio = this.baseH / this.baseW;
            //   targetH = targetW * ratio;

            //   this.w = targetW;
            //   this.h = targetH;
            // }
            
            // 保持初始大小不变（缩放功能已禁用）
            this.w = this.baseW;
            this.h = this.baseH;

            // 选中状态下，只要保持捏合就一直跟随手指
            // 使用插值让跟随更平滑，减少卡顿
            // 录制时使用更小的插值系数（更平滑但响应稍慢），非录制时更响应
            const lerpFactor = isRecording ? 0.2 : 0.3;
            let targetX = this.fingerx;
            let targetY = this.fingery;
            
            // 简化碰撞检测：只在距离很近时才检测，减少计算量
            // 录制时跳过碰撞检测，直接跟随，进一步提升性能
            if (!isRecording && Array.isArray(magnets)) {
              const selfRadius = Math.sqrt(this.w * this.w + this.h * this.h) / 2;
              let canMove = true;
              
              // 只检查距离较近的其他小马，减少遍历次数
              for (let i = 0; i < magnets.length; i++) {
                const other = magnets[i];
                if (!other || other === this || !other.pos) continue;
                
                const d = this.p.dist(targetX, targetY, other.pos.x, other.pos.y);
                // 只检查距离小于 200 像素的其他小马
                if (d < 200) {
                  const otherRadius = Math.sqrt(other.w * other.w + other.h * other.h) / 2;
                  const minDist = selfRadius + otherRadius * 0.9;
                  if (d < minDist) {
                    canMove = false;
                    break; // 找到一个碰撞就退出
                  }
                }
              }
              
              if (canMove) {
                // 使用插值平滑跟随
                this.pos.x = this.p.lerp(this.pos.x, targetX, lerpFactor);
                this.pos.y = this.p.lerp(this.pos.y, targetY, lerpFactor);
              }
            } else {
              // 使用插值平滑跟随（录制时直接跟随，不检测碰撞）
              this.pos.x = this.p.lerp(this.pos.x, targetX, lerpFactor);
              this.pos.y = this.p.lerp(this.pos.y, targetY, lerpFactor);
            }
          } else {
            // 大拇指和食指放开：立即放下小马
            this.initialDepth = 0;
            this.isSelected = false;
            this.isBeingScaled = false;
            if (selectedMagnet === this) {
              selectedMagnet = null;
            }
          }
        }
      }
    }

    // 小马数量
    const HORSE_COUNT = 5;
    let magnets = [];
    let magnetImg = null;
    // 当前被选中的小马（一次只允许选中一个）
    let selectedMagnet = null;

    p.setup = () => {
      // 抑制设备方向 API 警告（我们不需要使用设备方向功能）
      if (typeof DeviceOrientationEvent !== 'undefined' && 
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ 需要请求权限，但我们不需要这个功能，所以不请求
        // 这样可以避免控制台警告
      }
      
      const canvas = p.createCanvas(canvasW, canvasH);
      console.log('画布大小:', {
        canvasW: canvasW,
        canvasH: canvasH,
        resolution: resolution,
        actualWidth: canvas.width || canvasW,
        actualHeight: canvas.height || canvasH
      });
      if (containerRef.current) {
        canvas.parent(containerRef.current);
        
        // 在容器中创建一个小的调试状态文本，用于显示摄像头画面状态（尤其是 iOS 微信）
        if (!videoStatusEl) {
          videoStatusEl = document.createElement('div');
          videoStatusEl.style.position = 'absolute';
          videoStatusEl.style.left = '8px';
          videoStatusEl.style.bottom = '8px';
          videoStatusEl.style.padding = '4px 6px';
          videoStatusEl.style.background = 'rgba(0, 0, 0, 0.6)';
          videoStatusEl.style.color = '#0f0';
          videoStatusEl.style.fontSize = '10px';
          videoStatusEl.style.lineHeight = '1.4';
          videoStatusEl.style.zIndex = '9999';
          videoStatusEl.style.pointerEvents = 'none';
          videoStatusEl.style.borderRadius = '3px';
          videoStatusEl.style.whiteSpace = 'pre-line';
          videoStatusEl.textContent = '视频状态: 初始化中...';
          containerRef.current.style.position = containerRef.current.style.position || 'relative';
          containerRef.current.appendChild(videoStatusEl);
        }
      }

      recordCanvas = document.createElement('canvas');
      recordCanvas.width = recordCanvasW;
      recordCanvas.height = recordCanvasH;
      recordCanvas.style.display = 'none';
      recordCanvas.style.position = 'absolute';
      recordCanvas.style.visibility = 'hidden';
      recordCanvas.style.pointerEvents = 'none';
      recordCtx = recordCanvas.getContext('2d', {
        alpha: true,
        willReadFrequently: false,
        desynchronized: true
      });

      if (!recordCtx) {
        console.error('Failed to create record canvas context');
        return;
      }

      // 创建低分辨率检测画布（用于 MediaPipe 检测，降低计算量）
      detectCanvas = document.createElement('canvas');
      detectCanvas.width = detectCanvasW;
      detectCanvas.height = detectCanvasH;
      detectCanvas.style.display = 'none';
      detectCanvas.style.position = 'absolute';
      detectCanvas.style.visibility = 'hidden';
      detectCanvas.style.pointerEvents = 'none';
      detectCtx = detectCanvas.getContext('2d', {
        alpha: false,
        willReadFrequently: true, // MediaPipe 会频繁读取画布数据，设置为 true 优化性能
        desynchronized: true
      });

      if (!detectCtx) {
        console.error('Failed to create detect canvas context');
        return;
      }

      // 加载吸铁石 GIF 图片（路径可根据需要调整）
      const magnetUrl = (process.env.PUBLIC_URL || '') + '/GIF/1.gif';
      magnetImg = p.loadImage(
        magnetUrl,
        (img) => {
          console.log('[Magnet] GIF 加载成功:', magnetUrl, img.width, img.height);
          // 加载完成后创建多个小马，随机放置在画布中
          magnets = [];
          for (let i = 0; i < HORSE_COUNT; i++) {
            const m = new Magnet(p, img);
            // init 时会使用随机位置，这里只需要传入画布尺寸
            m.init(canvasW, canvasH);
            magnets.push(m);
          }
        },
        (err) => {
          console.error('[Magnet] GIF 加载失败:', magnetUrl, err);
        }
      );

      p.background(0, 0, 0, 0);

      // 手机端使用4:3比例
      const getConstraints = (facingMode) => ({
        video: {
          aspectRatio: { exact: 4/3 },
          facingMode: facingMode,
        },
        audio: false
      });

      const getFallbackConstraints = (facingMode) => ({
        video: {
          aspectRatio: { ideal: 4/3 },
          facingMode: facingMode,
        },
        audio: false
      });

      const constraints = getConstraints(currentFacingMode);
      const fallbackConstraints = getFallbackConstraints(currentFacingMode);

      // iOS 微信特殊处理：检测是否在 iOS 微信环境中
      const isIOSWeChat = /iPhone|iPad|iPod/.test(navigator.userAgent) && /MicroMessenger/.test(navigator.userAgent);
      console.log('环境检测:', { 
        isIOSWeChat, 
        userAgent: navigator.userAgent,
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      });
      
      // iOS 微信需要特殊处理：直接使用 getUserMedia 而不是 p5.js 的封装
      if (isIOSWeChat) {
        console.log('检测到 iOS 微信环境，使用原生 getUserMedia');
        
        // 检查权限和 API 可用性
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.error('iOS 微信：getUserMedia 不可用');
          // 降级到 p5.js 方式
          try {
            video = p.createCapture(fallbackConstraints);
            if (video && video.elt) {
              video.elt.style.display = 'none';
              video.elt.style.position = 'absolute';
              video.elt.style.visibility = 'hidden';
              video.elt.setAttribute('playsinline', '');
              video.elt.setAttribute('webkit-playsinline', '');
              video.elt.muted = true;
              video.elt.autoplay = true;
            }
          } catch (fallbackError) {
            console.error('降级方案也失败:', fallbackError);
          }
        } else {
          // 使用更简单的约束（iOS 微信可能不支持复杂的约束）
          const simpleConstraints = {
            video: {
              facingMode: currentFacingMode
            },
            audio: false
          };
          
          console.log('iOS 微信：请求摄像头权限...');
          navigator.mediaDevices.getUserMedia(simpleConstraints).then((stream) => {
            console.log('iOS 微信：getUserMedia 成功，stream:', stream);
            currentStream = stream;
            
            // 创建一个 video 元素（参考 test copy.html 的实现）
            const videoElement = document.createElement('video');
            videoElement.srcObject = stream;
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.muted = true; // iOS 需要 muted 才能 autoplay
            // iOS 微信需要：视频元素必须可见才能播放（即使是 1px）
            videoElement.style.position = 'fixed';
            videoElement.style.top = '0';
            videoElement.style.left = '0';
            videoElement.style.width = '1px';
            videoElement.style.height = '1px';
            videoElement.style.opacity = '0';
            videoElement.style.pointerEvents = 'none';
            videoElement.style.zIndex = '-1';
            // 不设置 display: none，因为 iOS 可能无法播放隐藏的视频
            document.body.appendChild(videoElement);
            
            console.log('iOS 微信：video 元素已添加到 DOM', {
              hasSrcObject: !!videoElement.srcObject,
              autoplay: videoElement.autoplay,
              muted: videoElement.muted,
              playsInline: videoElement.playsInline
            });
            
            console.log('iOS 微信：video 元素已创建', videoElement);
            
            // 创建一个 p5.Element 包装器，兼容 p5.js 的 video 对象
            video = {
              elt: videoElement,
              loadedmetadata: false,
              width: 0,
              height: 0,
              // 添加 p5.js 兼容方法
              hide: function() {},
              size: function() { return this; }
            };
            
            // 监听视频尺寸变化
            const updateVideoSize = () => {
              if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                video.width = videoElement.videoWidth;
                video.height = videoElement.videoHeight;
                video.loadedmetadata = true;
                console.log('iOS 微信：视频尺寸已更新', {
                  width: videoElement.videoWidth,
                  height: videoElement.videoHeight,
                  readyState: videoElement.readyState
                });
              }
            };
            
            // 定义 onVideoReady 回调（在 iOS 微信中也需要）
            const triggerVideoReady = () => {
              if (videoElement.videoWidth > 0) {
                console.log('iOS 微信：触发 videoReady');
                // 延迟触发，确保视频完全准备好
                setTimeout(() => {
                  if (mounted && onLoadingChange) {
                    onLoadingChange(false);
                    if (loadingTimeout) clearTimeout(loadingTimeout);
                  }
                  // 如果全局的 onVideoReady 存在，调用它
                  if (window._iosWeChatVideoReady && typeof window._iosWeChatVideoReady === 'function') {
                    window._iosWeChatVideoReady();
                  }
                }, 200);
              }
            };
            
            // 监听多个事件确保能获取到视频尺寸
            videoElement.addEventListener('loadedmetadata', () => {
              console.log('iOS 微信：loadedmetadata 事件触发');
              updateVideoSize();
              triggerVideoReady();
            });
            videoElement.addEventListener('loadeddata', () => {
              console.log('iOS 微信：loadeddata 事件触发');
              updateVideoSize();
              triggerVideoReady();
            });
            videoElement.addEventListener('canplay', () => {
              console.log('iOS 微信：canplay 事件触发');
              updateVideoSize();
              triggerVideoReady();
            });
            videoElement.addEventListener('playing', () => {
              console.log('iOS 微信：playing 事件触发');
              updateVideoSize();
              triggerVideoReady();
            });
            videoElement.addEventListener('resize', () => {
              console.log('iOS 微信：resize 事件触发');
              updateVideoSize();
            });
            
            // 强制播放（iOS 需要）- 参考 test copy.html 的实现
            const playVideo = () => {
              // 确保视频元素在 DOM 中
              if (!videoElement.parentNode) {
                document.body.appendChild(videoElement);
              }
              
              // 确保属性设置正确
              if (!videoElement.muted) {
                videoElement.muted = true;
              }
              if (!videoElement.autoplay) {
                videoElement.autoplay = true;
              }
              
              videoElement.play().then(() => {
                console.log('iOS 微信：视频播放成功', {
                  videoWidth: videoElement.videoWidth,
                  videoHeight: videoElement.videoHeight,
                  readyState: videoElement.readyState,
                  paused: videoElement.paused,
                  ended: videoElement.ended,
                  currentTime: videoElement.currentTime
                });
                updateVideoSize();
                triggerVideoReady();
              }).catch(e => {
                console.warn('iOS 微信：视频播放失败', e);
                // 重试播放（iOS 可能需要多次尝试）
                setTimeout(() => {
                  videoElement.play().then(() => {
                    console.log('iOS 微信：重试播放成功');
                    updateVideoSize();
                    triggerVideoReady();
                  }).catch(e2 => {
                    console.warn('重试播放也失败:', e2);
                    // 再次重试
                    setTimeout(() => {
                      videoElement.play().then(() => {
                        console.log('iOS 微信：第二次重试播放成功');
                        updateVideoSize();
                        triggerVideoReady();
                      }).catch(e3 => console.error('最终播放失败:', e3));
                    }, 1000);
                  });
                }, 500);
              });
            };
            
            // 等待 loadedmetadata 后再播放（iOS 微信可能需要）
            videoElement.addEventListener('loadedmetadata', () => {
              console.log('iOS 微信：loadedmetadata，准备播放');
              playVideo();
            }, { once: true });
            
            // 如果已经加载了，立即播放
            if (videoElement.readyState >= 2) {
              console.log('iOS 微信：视频已加载，立即播放');
              playVideo();
            } else {
              // 延迟播放，给视频一些时间加载
              setTimeout(() => {
                if (videoElement.readyState >= 1) {
                  console.log('iOS 微信：延迟播放');
                  playVideo();
                }
              }, 300);
            }
            
            console.log('iOS 微信：视频流已创建，等待播放...', {
              readyState: videoElement.readyState,
              hasSrcObject: !!videoElement.srcObject
            });
          }).catch((error) => {
            console.error('iOS 微信 getUserMedia 失败:', error);
            // 降级到 p5.js 方式
            try {
              console.log('iOS 微信：降级到 p5.js createCapture');
              video = p.createCapture(fallbackConstraints);
              if (video && video.elt) {
                video.elt.style.display = 'none';
                video.elt.style.position = 'absolute';
                video.elt.style.visibility = 'hidden';
                video.elt.setAttribute('playsinline', '');
                video.elt.setAttribute('webkit-playsinline', '');
                video.elt.muted = true;
                video.elt.autoplay = true;
                console.log('iOS 微信：p5.js createCapture 成功');
              }
            } catch (fallbackError) {
              console.error('降级方案也失败:', fallbackError);
            }
          });
        }
      } else {
        // 非 iOS 微信环境，使用正常的 p5.js 方式
        try {
          video = p.createCapture(constraints);
          if (video && video.elt) {
            video.elt.style.display = 'none';
            video.elt.style.position = 'absolute';
            video.elt.style.visibility = 'hidden';
            // 确保 iOS 兼容性
            video.elt.setAttribute('playsinline', '');
            video.elt.setAttribute('webkit-playsinline', '');
            video.elt.muted = true;
            video.elt.autoplay = true;
          }
        } catch (error) {
          console.warn('Failed with exact constraints, trying fallback:', error);
          try {
            video = p.createCapture(fallbackConstraints);
            if (video && video.elt) {
              video.elt.style.display = 'none';
              video.elt.style.position = 'absolute';
              video.elt.style.visibility = 'hidden';
              video.elt.setAttribute('playsinline', '');
              video.elt.setAttribute('webkit-playsinline', '');
              video.elt.muted = true;
              video.elt.autoplay = true;
            }
          } catch (fallbackError) {
            console.error('Failed to create video capture:', fallbackError);
          }
        }
      }

      // 切换摄像头函数
      function switchCamera() {
        // 切换摄像头方向
        const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        console.log('切换摄像头从', currentFacingMode, '到', newFacingMode);

        // 停止当前流和 video
        if (currentStream) {
          currentStream.getTracks().forEach(track => {
            track.stop();
          });
          currentStream = null;
        }

        // 如果 video 存在，停止并移除
        if (video && video.elt) {
          const videoEl = video.elt;
          if (videoEl.srcObject) {
            const oldStream = videoEl.srcObject;
            oldStream.getTracks().forEach(track => {
              track.stop();
            });
          }
          // 如果是 p5.js 创建的 video，需要调用 remove()
          if (video.remove && typeof video.remove === 'function') {
            video.remove();
          } else if (videoEl.parentNode) {
            videoEl.pause();
            videoEl.srcObject = null;
          }
        }

        // 更新当前摄像头方向
        currentFacingMode = newFacingMode;

        // 创建新的约束
        const newConstraints = getConstraints(currentFacingMode);
        const newFallbackConstraints = getFallbackConstraints(currentFacingMode);

        // 检查是否在 iOS 微信环境
        const isIOSWeChat = /iPhone|iPad|iPod/.test(navigator.userAgent) && /MicroMessenger/.test(navigator.userAgent);

        if (isIOSWeChat) {
          // iOS 微信环境，使用 getUserMedia
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('切换摄像头：getUserMedia 不可用');
            return Promise.resolve();
          }

          const simpleConstraints = {
            video: {
              facingMode: currentFacingMode
            },
            audio: false
          };

          return navigator.mediaDevices.getUserMedia(simpleConstraints).then((stream) => {
            console.log('切换摄像头成功，新 stream:', stream);
            currentStream = stream;

            // 创建或更新 video 元素
            const videoElement = video && video.elt ? video.elt : document.createElement('video');
            videoElement.srcObject = stream;
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('webkit-playsinline', '');
            videoElement.muted = true;
            videoElement.style.position = 'fixed';
            videoElement.style.top = '0';
            videoElement.style.left = '0';
            videoElement.style.width = '1px';
            videoElement.style.height = '1px';
            videoElement.style.opacity = '0';
            videoElement.style.pointerEvents = 'none';
            videoElement.style.zIndex = '-1';
            
            if (!videoElement.parentNode) {
              document.body.appendChild(videoElement);
            }

            // 创建或更新 p5.Element 包装器
            if (!video || !video.elt) {
              video = {
                elt: videoElement,
                loadedmetadata: false,
                width: 0,
                height: 0,
                hide: function() {},
                size: function() { return this; }
              };

              // 监听视频尺寸变化
              const updateVideoSize = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                  video.width = videoElement.videoWidth;
                  video.height = videoElement.videoHeight;
                  video.loadedmetadata = true;
                }
              };

              videoElement.addEventListener('loadedmetadata', updateVideoSize);
              videoElement.addEventListener('loadeddata', updateVideoSize);
              videoElement.addEventListener('canplay', updateVideoSize);
              videoElement.addEventListener('playing', updateVideoSize);
              videoElement.addEventListener('resize', updateVideoSize);
            }

            return videoElement.play().then(() => {
              console.log('切换摄像头后播放成功');
              return stream;
            }).catch(e => {
              console.warn('切换摄像头后播放失败:', e);
              return stream;
            });
          }).catch((error) => {
            console.error('切换摄像头失败:', error);
            // 如果切换失败，恢复原来的方向
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            throw error;
          });
        } else {
          // 非 iOS 微信环境，使用 p5.js 的 createCapture
          return new Promise((resolve, reject) => {
            try {
              // 创建新的 video capture
              const newVideo = p.createCapture(newConstraints);
              if (newVideo && newVideo.elt) {
                newVideo.elt.style.display = 'none';
                newVideo.elt.style.position = 'absolute';
                newVideo.elt.style.visibility = 'hidden';
                newVideo.elt.setAttribute('playsinline', '');
                newVideo.elt.setAttribute('webkit-playsinline', '');
                newVideo.elt.muted = true;
                newVideo.elt.autoplay = true;

                // 等待视频准备好
                newVideo.elt.addEventListener('loadedmetadata', () => {
                  video = newVideo;
                  console.log('切换摄像头成功（p5.js 方式）');
                  resolve(newVideo);
                }, { once: true });

                // 如果已经加载了
                if (newVideo.elt.readyState >= 2) {
                  video = newVideo;
                  console.log('切换摄像头成功（p5.js 方式，已加载）');
                  resolve(newVideo);
                }
              } else {
                throw new Error('无法创建新的 video capture');
              }
            } catch (error) {
              console.warn('使用精确约束失败，尝试降级:', error);
              try {
                const fallbackVideo = p.createCapture(newFallbackConstraints);
                if (fallbackVideo && fallbackVideo.elt) {
                  fallbackVideo.elt.style.display = 'none';
                  fallbackVideo.elt.style.position = 'absolute';
                  fallbackVideo.elt.style.visibility = 'hidden';
                  fallbackVideo.elt.setAttribute('playsinline', '');
                  fallbackVideo.elt.setAttribute('webkit-playsinline', '');
                  fallbackVideo.elt.muted = true;
                  fallbackVideo.elt.autoplay = true;

                  fallbackVideo.elt.addEventListener('loadedmetadata', () => {
                    video = fallbackVideo;
                    console.log('切换摄像头成功（p5.js 降级方式）');
                    resolve(fallbackVideo);
                  }, { once: true });

                  if (fallbackVideo.elt.readyState >= 2) {
                    video = fallbackVideo;
                    console.log('切换摄像头成功（p5.js 降级方式，已加载）');
                    resolve(fallbackVideo);
                  }
                } else {
                  throw new Error('降级方案也失败');
                }
              } catch (fallbackError) {
                console.error('切换摄像头失败:', fallbackError);
                // 如果切换失败，恢复原来的方向
                currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
                reject(fallbackError);
              }
            }
          });
        }
      }

      startRecordingRef.current = startRecording;
      stopRecordingRef.current = stopRecording;
      takePhotoRef.current = takePhoto;
      if (switchCameraRef) {
        switchCameraRef.current = switchCamera;
      }
      
      // 声明 onVideoReady 回调，供后面事件监听和 iOS 微信全局回调共用
      let onVideoReady;

      if (video && video.elt) {
        const videoEl = video.elt;
        
        const initHandsOnce = () => {
            // iOS 微信也尝试加载 MediaPipe Hands（可能不稳定，但按需启用）
            // 检查 MediaPipe 对象是否真的存在且可用
            const isHandsSolutionValid = window.handsSolution && 
                                         typeof window.handsSolution.send === 'function' &&
                                         typeof window.handsSolution.initialize === 'function';
            
            // 如果已经初始化且就绪，且 MediaPipe 对象有效，直接返回
            if (window.handsInitialized && window.isHandPoseReady && isHandsSolutionValid) {
              if (onMediaPipeLoadingChange) {
                onMediaPipeLoadingChange(false);
              }
              return;
            }
            
            // 如果 MediaPipe 对象无效，重置状态（页面刷新后的情况）
            if (!isHandsSolutionValid && window.handsSolution !== null) {
              console.log('检测到 MediaPipe 对象已失效，重置状态并重新初始化');
              window.handsInitialized = false;
              window.handsSolution = null;
              window.isHandPoseReady = false;
              window.hands = [];
            }
            
            // 如果已经初始化但未就绪，等待就绪
            if (window.handsInitialized && isHandsSolutionValid) {
              // 检查是否已经就绪
              if (window.isHandPoseReady) {
                if (onMediaPipeLoadingChange) {
                  onMediaPipeLoadingChange(false);
                }
              } else {
                // 还在加载中，保持 loading 状态
                if (onMediaPipeLoadingChange) {
                  onMediaPipeLoadingChange(true);
                }
              }
              return;
            }
            
            // 开始新的初始化
            window.handsInitialized = true;
          
            console.log('初始化 MediaPipe Hands（只执行一次）');
            
            // 通知开始加载 MediaPipe
            if (onMediaPipeLoadingChange) {
              onMediaPipeLoadingChange(true);
            }
          
            window.handsSolution = new Hands({
              locateFile: (file) => '/mediapipe/hands/' + file.replace('simd_', '')
            });
          
            // 优化配置：降低模型复杂度，提升性能
            window.handsSolution.setOptions({
              maxNumHands: 1, // 只检测一只手，减少计算量
              modelComplexity: 0, // 使用最简单的模型（0=最快）
              minDetectionConfidence: 0.6, // 提高检测阈值，减少误检
              minTrackingConfidence: 0.6 // 提高跟踪阈值，减少抖动
            });
          
            // 优化回调：使用节流，避免过于频繁的更新
            let lastUpdateTime = 0;
            const UPDATE_INTERVAL = 50; // 每50ms最多更新一次（约20fps）
            
            window.handsSolution.onResults((results) => {
                // 调试：每 60 次调用打印一次检测结果概要，确认是否有手势数据
                if (!window._onResultsCallCount) window._onResultsCallCount = 0;
                window._onResultsCallCount++;
                if (window._onResultsCallCount % 60 === 0) {
                  console.log('MediaPipe onResults:', {
                    hasResults: !!results,
                    handsCount: results?.multiHandLandmarks?.length || 0,
                    callCount: window._onResultsCallCount
                  });
                }
                const now = Date.now();
                // 节流：限制更新频率
                if (now - lastUpdateTime < UPDATE_INTERVAL) {
                  return;
                }
                lastUpdateTime = now;
                
                try {
                    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                      // 优化：只处理第一只手，减少计算
                      const landmarks = results.multiHandLandmarks[0];
                      window.hands = [{
                        landmarks: landmarks.map(lm => [lm.x, lm.y, lm.z]),
                        keypoints: landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
                      }];
                      
                      // 添加 handedness 信息（如果存在）
                      if (results.multiHandedness && results.multiHandedness[0]) {
                        window.hands[0].handedness = results.multiHandedness[0].categoryName;
                        window.hands[0].score = results.multiHandedness[0].score;
                      }
                    } else {
                      window.hands = [];
                    }
                  } catch (err) {
                    // 静默处理错误，避免控制台噪音
                    console.error('onResults error:', err);
                    window.hands = [];
                  }
                });
          
            // 确保 WASM 载入完成
            window.handsSolution.initialize().then(() => {
              window.isHandPoseReady = true;
              console.log('Hands WASM 已加载完成');
              
              // 通知 MediaPipe 加载完成
              if (onMediaPipeLoadingChange) {
                onMediaPipeLoadingChange(false);
              }
            }).catch((error) => {
              console.error('MediaPipe 初始化失败:', error);
              // 即使失败也通知加载完成，避免一直显示 loading
              if (onMediaPipeLoadingChange) {
                onMediaPipeLoadingChange(false);
              }
            });
          };
          
        onVideoReady = async () => {
          if (!mounted) return;
      
          if (onLoadingChange) onLoadingChange(false);
          if (loadingTimeout) clearTimeout(loadingTimeout);
      
          // 确保只初始化一次（每次页面刷新都会重新创建 sketch，所以会重置）
          if (videoEl.videoWidth > 0) {
            // 打印视频大小
            console.log('视频大小（初始化）:', {
              videoWidth: videoEl.videoWidth,
              videoHeight: videoEl.videoHeight,
              aspectRatio: videoEl.videoWidth / videoEl.videoHeight,
              readyState: videoEl.readyState,
              canvasW: canvasW,
              canvasH: canvasH,
              canvasAspectRatio: canvasW / canvasH,
              enableMediaPipe: enableMediaPipe
            });
            // 只有在启用 MediaPipe 时才初始化
            if (enableMediaPipe) {
              initHandsOnce(); // 即使被多次触发，也只执行一次
            } else {
              console.log('MediaPipe 已禁用，跳过初始化');
              // 如果禁用 MediaPipe，直接标记为就绪，避免显示加载提示
              window.isHandPoseReady = true;
              if (onMediaPipeLoadingChange) {
                onMediaPipeLoadingChange(false);
              }
            }
          }
        };
      
        videoEl.addEventListener('loadedmetadata', onVideoReady);
        videoEl.addEventListener('loadeddata', onVideoReady);
      
        if (videoEl.readyState >= 2) {
          setTimeout(onVideoReady, 100);
        }
        
        // 为 iOS 微信设置全局回调（供 iOS 微信的 triggerVideoReady 使用）
        window._iosWeChatVideoReady = onVideoReady;
      
        videoEl.addEventListener('error', () => {
          if (mounted) {
            if (onLoadingChange) onLoadingChange(false);
            if (loadingTimeout) clearTimeout(loadingTimeout);
          }
        });
      }
    };

    function startRecording() {
      if (typeof MediaRecorder === 'undefined') {
        console.error('MediaRecorder is not supported');
        return;
      }

      console.log('[录制] 开始录制...', {
        recordCanvasW: recordCanvasW,
        recordCanvasH: recordCanvasH,
        hasRecordCanvas: !!recordCanvas,
        hasRecordCtx: !!recordCtx
      });

      if (canvasRecorder) {
        try {
          if (canvasRecorder.state !== 'inactive') {
            canvasRecorder.stop();
          }
        } catch (e) {
          console.warn('Error stopping previous recorder:', e);
        }
        canvasRecorder = null;
      }

      canvasChunks = [];
      videoChunks = [];
      canvasChunksRef.current = [];
      videoChunksRef.current = [];
      setCanvasStopped(false);
      setVideoStopped(false);

      if (recordCanvas) {
        // 在 try 块外声明变量，以便在 catch 块中访问
        let canvasStream = null;
        let supportedMimeType = null;
        const videoBitsPerSecond = 2000000; // 降低到 2Mbps，提高兼容性
        
        try {
          canvasStream = recordCanvas.captureStream(30);
          
          // 按优先级检测支持的 MIME 类型（从高质量到低质量，从新到旧）
          const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',  // 某些设备支持 MP4
            'video/x-matroska;codecs=avc1',  // 某些 Android 设备
            ''  // 最后尝试让浏览器自动选择
          ];
          
          let mimeType = null;
          
          for (const type of mimeTypes) {
            if (type === '') {
              // 空字符串表示让浏览器自动选择
              supportedMimeType = '';
              break;
            }
            if (MediaRecorder.isTypeSupported(type)) {
              supportedMimeType = type;
              mimeType = type;
              break;
            }
          }
          
          // 如果所有类型都不支持，尝试不指定 MIME 类型（让浏览器自动选择）
          if (!supportedMimeType && supportedMimeType !== '') {
            console.warn('[录制] 所有检测的 MIME 类型都不支持，尝试让浏览器自动选择');
            supportedMimeType = '';
          }
          
          console.log('[录制] 选择的 MIME 类型:', supportedMimeType || '自动选择');
          
          const recorderOptions = {
            videoBitsPerSecond: videoBitsPerSecond
          };
          
          // 只有在找到支持的 MIME 类型时才添加
          if (supportedMimeType) {
            recorderOptions.mimeType = supportedMimeType;
          }

          canvasRecorder = new MediaRecorder(canvasStream, recorderOptions);

          canvasRecorder.ondataavailable = function(event) {
            if (event.data && event.data.size > 0) {
              canvasChunks.push(event.data);
              canvasChunksRef.current = canvasChunks.filter(function(chunk) {
                return chunk instanceof Blob;
              });
              console.log('[录制] 收到数据块:', {
                size: event.data.size,
                totalChunks: canvasChunks.length,
                totalSize: canvasChunks.reduce((sum, chunk) => sum + chunk.size, 0)
              });
            } else {
              console.warn('[录制] 收到空数据块:', event.data ? event.data.size : 'null');
            }
          };

          canvasRecorder.onstop = () => {
            console.log('[录制] MediaRecorder 已停止:', {
              chunksCount: canvasChunks.length,
              totalSize: canvasChunks.reduce((sum, chunk) => sum + chunk.size, 0),
              state: canvasRecorder.state
            });
            setCanvasStopped(true);
            setTimeout(() => {
              handleRecordingComplete();
            }, 300);
          };

          canvasRecorder.onerror = () => {
            stopRecording();
          };

          canvasRecorder.start(1000);
          console.log('[录制] MediaRecorder 已启动:', {
            state: canvasRecorder.state,
            mimeType: supportedMimeType || '自动选择',
            videoBitsPerSecond: videoBitsPerSecond,
            timeslice: 1000
          });
        } catch (error) {
          console.error('[录制] 启动失败:', error);
          // 如果是因为 MIME 类型不支持，尝试不指定 MIME 类型
          if (error.name === 'NotSupportedError' && canvasStream) {
            console.log('[录制] MIME 类型不支持，尝试让浏览器自动选择...');
            try {
              const fallbackOptions = {
                videoBitsPerSecond: videoBitsPerSecond
                // 不指定 mimeType，让浏览器自动选择
              };
              canvasRecorder = new MediaRecorder(canvasStream, fallbackOptions);
              canvasRecorder.ondataavailable = function(event) {
                if (event.data && event.data.size > 0) {
                  canvasChunks.push(event.data);
                  canvasChunksRef.current = canvasChunks.filter(function(chunk) {
                    return chunk instanceof Blob;
                  });
                  console.log('[录制] 收到数据块:', {
                    size: event.data.size,
                    totalChunks: canvasChunks.length,
                    totalSize: canvasChunks.reduce((sum, chunk) => sum + chunk.size, 0)
                  });
                } else {
                  console.warn('[录制] 收到空数据块:', event.data ? event.data.size : 'null');
                }
              };
              canvasRecorder.onstop = () => {
                console.log('[录制] MediaRecorder 已停止:', {
                  chunksCount: canvasChunks.length,
                  totalSize: canvasChunks.reduce((sum, chunk) => sum + chunk.size, 0),
                  state: canvasRecorder.state
                });
                setCanvasStopped(true);
                setTimeout(() => {
                  handleRecordingComplete();
                }, 300);
              };
              canvasRecorder.onerror = () => {
                console.error('[录制] MediaRecorder 发生错误');
                stopRecording();
              };
              canvasRecorder.start(1000);
              console.log('[录制] MediaRecorder 已启动（自动选择格式）:', {
                state: canvasRecorder.state,
                videoBitsPerSecond: videoBitsPerSecond
              });
            } catch (fallbackError) {
              console.error('[录制] 降级方案也失败:', fallbackError);
              alert('录制失败：您的设备不支持视频录制功能。错误：' + fallbackError.message);
            }
          } else {
            alert('录制失败：' + error.message);
          }
        }
      } else {
        console.error('[录制] 错误：recordCanvas 不存在！');
        alert('录制失败：录制画布未初始化');
      }

      isRecording = true;
      setElapsedTime(0);

      // 录制时长最多 10 秒：每秒增加计时，达到 10 秒后自动停止并上传
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedTime((prev) => {
          const next = prev + 1;
          if (next >= 10) {
            // 到 10 秒，自动停止录制（会触发 handleRecordingComplete 上传）
            setTimeout(() => {
              stopRecording();
            }, 0);
            return 10;
          }
          return next;
        });
      }, 1000);
    }

    function stopRecording() {
      if (!isRecording) {
        console.warn('[停止录制] 当前未在录制中');
        return;
      }

      console.log('[停止录制] 开始停止录制...', {
        chunksCount: canvasChunks.length,
        recorderState: canvasRecorder ? canvasRecorder.state : 'null'
      });

      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (canvasRecorder) {
        try {
          if (canvasRecorder.state === 'recording') {
            console.log('[停止录制] 正在停止 MediaRecorder...');
            canvasRecorder.stop();
          } else {
            console.warn('[停止录制] MediaRecorder 状态不是 recording:', canvasRecorder.state);
            setCanvasStopped(true);
            setTimeout(() => {
              handleRecordingComplete();
            }, 300);
          }
        } catch (error) {
          console.error('[停止录制] 停止失败:', error);
          setCanvasStopped(true);
          setTimeout(() => {
            handleRecordingComplete();
          }, 300);
        }
      } else {
        console.warn('[停止录制] canvasRecorder 不存在，直接调用完成处理');
        setCanvasStopped(true);
        setTimeout(() => {
          handleRecordingComplete();
        }, 300);
      }

      isRecording = false;
    }

    // 辅助函数：绘制视频和小马到录制画布
    function drawToRecordCanvas() {
      if (!recordCanvas || !recordCtx) {
        return;
      }
      
      // 清空画布
      recordCtx.clearRect(0, 0, recordCanvasW, recordCanvasH);
      
      // 即使视频还没准备好，也要绘制背景，确保录制流持续更新
      // 这样可以避免录制流因为画布没有更新而停止
      if (!video || !video.elt) {
        // 视频不存在时，绘制黑色背景
        recordCtx.fillStyle = '#000';
        recordCtx.fillRect(0, 0, recordCanvasW, recordCanvasH);
        return;
      }
      
      const videoEl = video.elt;
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
        // 视频尺寸未知时，也绘制黑色背景，确保录制流持续更新
        recordCtx.fillStyle = '#000';
        recordCtx.fillRect(0, 0, recordCanvasW, recordCanvasH);
        return;
      }
      
      // 保持视频原始宽高比，居中显示，不拉伸
      const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
      const canvasAspect = recordCanvasW / recordCanvasH;
      
      let drawW;
      let drawH;
      let offsetX;
      let offsetY;
      
      if (videoAspect > canvasAspect) {
        // 视频更宽，以宽度为准
        drawW = recordCanvasW;
        drawH = recordCanvasW / videoAspect;
        offsetX = 0;
        offsetY = (recordCanvasH - drawH) / 2;
      } else {
        // 视频更高，以高度为准
        drawH = recordCanvasH;
        drawW = recordCanvasH * videoAspect;
        offsetX = (recordCanvasW - drawW) / 2;
        offsetY = 0;
      }
      
      // 绘制视频，保持原始比例
      // 录制时的镜像规则（反向）：
      // - 自拍模式（前置摄像头 user）：视频画面不需要镜像，画布画面（GIF）不需要镜像
      // - 后置模式（environment）：视频画面需要镜像，画布画面（GIF）不需要镜像
      const shouldMirror = currentFacingMode === 'environment'; // 只有后置摄像头才镜像视频
      
      // 调试日志：每 60 帧打印一次录制画布的镜像状态
      if (p && p.frameCount && p.frameCount % 60 === 0) {
        console.log('[录制画布] 镜像状态:', {
          currentFacingMode: currentFacingMode,
          shouldMirror: shouldMirror,
          recordCanvasW: recordCanvasW,
          recordCanvasH: recordCanvasH
        });
      }
      
      recordCtx.save();
      if (shouldMirror) {
        // 后置摄像头：左右镜像，平移到右边缘，然后水平翻转
        recordCtx.translate(recordCanvasW, 0);
        recordCtx.scale(-1, 1);
        recordCtx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
      } else {
        // 前置摄像头：直接绘制，不镜像
        recordCtx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
      }
      recordCtx.restore();
      
      // 在录制画布上绘制小马 GIF（画布画面）
      // 录制时的镜像规则（反向）：
      // - 自拍模式（前置摄像头 user）：视频画面不镜像，GIF 也不镜像，直接使用原始坐标
      // - 后置模式（environment）：视频画面镜像，但 GIF 不镜像，所以需要将 GIF 坐标转换
      if (magnets && magnets.length > 0) {
        magnets.forEach((m) => {
          if (!m || !m.img) return;
          const src = m.img.canvas || m.img.elt || m.img;
          if (!src) {
            console.warn('[录制画布] GIF 源不存在:', m);
            return;
          }
          recordCtx.save();
          // 主画布上 m.pos.x 的坐标：
          // - 前置摄像头（user）：已经是镜像后的坐标（因为主画布镜像了）
          // - 后置摄像头（environment）：是原始坐标（因为主画布不镜像）
          // 录制画布上：
          // - 前置摄像头：视频不镜像，GIF 也不镜像，但 m.pos.x 是镜像后的坐标，需要转换回原始坐标
          // - 后置摄像头：视频镜像，但 GIF 不镜像，m.pos.x 是原始坐标，需要镜像 = 镜像后的坐标
          let gifX;
          if (currentFacingMode === 'user') {
            // 前置摄像头：主画布已镜像，m.pos.x 是镜像后的坐标
            // 录制画布上视频不镜像，GIF 也不镜像，所以需要将镜像后的坐标再镜像回来 = 原始坐标
            gifX = recordCanvasW - m.pos.x;
          } else {
            // 后置摄像头：主画布未镜像，m.pos.x 是原始坐标
            // 录制画布上视频镜像但 GIF 不镜像，所以需要将原始坐标镜像 = 镜像后的坐标
            gifX = recordCanvasW - m.pos.x;
          }
          // 移动到位置
          recordCtx.translate(gifX, m.pos.y);
          // GIF 不需要翻转，直接旋转即可（因为只有视频镜像，GIF 不镜像）
          recordCtx.rotate(m.angle);
          // 绘制 GIF
          try {
            recordCtx.drawImage(
              src,
              -m.w / 2,
              -m.h / 2,
              m.w,
              m.h
            );
          } catch (drawError) {
            console.error('[录制画布] 绘制 GIF 失败:', drawError, {
              src: src,
              pos: { x: m.pos.x, y: m.pos.y },
              gifX: gifX,
              size: { w: m.w, h: m.h }
            });
          }
          recordCtx.restore();
        });
      }
    }

    function takePhoto() {
      // 直接从主画布获取图片，因为主画布上已经有所有内容（视频、小马等）
      const mainCanvas = p.canvas;
      if (!mainCanvas) {
        console.error('主画布不存在，无法拍照');
        return;
      }
      
      // p5.js 的 canvas 需要通过 .elt 访问底层的 HTMLCanvasElement
      const htmlCanvas = mainCanvas.elt || mainCanvas;
      if (!htmlCanvas || typeof htmlCanvas.toBlob !== 'function') {
        console.error('无法访问画布的 toBlob 方法');
        return;
      }
      
      // 使用主画布的 toBlob 方法生成图片
      htmlCanvas.toBlob((blob) => {
        if (blob) {
          const photoUrl = URL.createObjectURL(blob);
          setPreviewUrl(photoUrl);
          setPreviewIsMp4(false); // 明确标记为图片，不是视频
          console.log('拍照成功，图片大小:', blob.size, 'bytes');
        } else {
          console.error('拍照失败：无法生成图片 blob');
        }
      }, 'image/png');
    }

    // 翻转视频 Blob 的函数（改进版：使用固定帧率）
    async function flipVideoBlob(blob, mimeType) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const videoUrl = URL.createObjectURL(blob);
        video.src = videoUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        
        let canvas = null;
        let ctx = null;
        let recorder = null;
        let drawInterval = null;
        let chunks = [];
        let isStopped = false;
        const targetFPS = 30;
        const frameInterval = 1000 / targetFPS; // 约 33.33ms
        
        const cleanup = () => {
          if (drawInterval) {
            clearInterval(drawInterval);
            drawInterval = null;
          }
          if (video) {
            video.pause();
            video.src = '';
          }
          URL.revokeObjectURL(videoUrl);
        };
        
        video.onloadedmetadata = () => {
          try {
            canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx = canvas.getContext('2d');
            
            if (!ctx) {
              cleanup();
              reject(new Error('无法获取 canvas context'));
              return;
            }
            
            // 创建 MediaRecorder 来录制翻转后的视频
            const stream = canvas.captureStream(targetFPS);
            
            // 尝试使用相同的 MIME 类型
            let recorderMimeType = mimeType;
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              // 如果不支持，尝试其他格式
              if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                recorderMimeType = 'video/webm;codecs=vp9';
              } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                recorderMimeType = 'video/webm;codecs=vp8';
              } else if (MediaRecorder.isTypeSupported('video/webm')) {
                recorderMimeType = 'video/webm';
              } else {
                recorderMimeType = ''; // 让浏览器自动选择
              }
            }
            
            const recorderOptions = {
              mimeType: recorderMimeType || undefined,
              videoBitsPerSecond: 2000000
            };
            
            recorder = new MediaRecorder(stream, recorderOptions);
            
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                chunks.push(e.data);
              }
            };
            
            recorder.onstop = () => {
              cleanup();
              if (chunks.length === 0) {
                reject(new Error('没有录制到数据'));
                return;
              }
              const flippedBlob = new Blob(chunks, { type: recorderMimeType || mimeType });
              console.log('[录制完成] 视频翻转成功，新大小:', flippedBlob.size);
              resolve(flippedBlob);
            };
            
            recorder.onerror = (e) => {
              console.error('[录制完成] 视频翻转失败:', e);
              cleanup();
              reject(e);
            };
            
            // 等待视频可以播放
            video.oncanplay = () => {
              if (isStopped) return;
              
              // 开始录制
              recorder.start(100); // 每100ms收集一次数据
              
              // 开始播放
              video.play().then(() => {
                // 使用固定间隔绘制，而不是 requestAnimationFrame
                let lastDrawTime = 0;
                
                const drawFrame = (currentTime) => {
                  if (isStopped || video.ended) {
                    if (!isStopped) {
                      isStopped = true;
                      setTimeout(() => {
                        if (recorder && recorder.state !== 'inactive') {
                          recorder.stop();
                        }
                      }, 300);
                    }
                    return;
                  }
                  
                  // 控制帧率：只在达到目标间隔时绘制
                  if (currentTime - lastDrawTime >= frameInterval) {
                    // 只在视频有有效帧时绘制
                    if (video.readyState >= 2 && !video.paused && !video.ended) {
                      // 清空画布
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                      
                      // 翻转绘制：平移到右边缘，然后水平翻转
                      ctx.save();
                      ctx.translate(canvas.width, 0);
                      ctx.scale(-1, 1);
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      ctx.restore();
                      
                      lastDrawTime = currentTime;
                    }
                  }
                  
                  // 继续绘制循环
                  if (!isStopped) {
                    requestAnimationFrame(drawFrame);
                  }
                };
                
                // 开始绘制循环
                requestAnimationFrame(drawFrame);
                
                // 视频播放结束后停止录制
                video.onended = () => {
                  isStopped = true;
                  setTimeout(() => {
                    if (recorder && recorder.state !== 'inactive') {
                      recorder.stop();
                    }
                  }, 300);
                };
              }).catch((err) => {
                console.error('[录制完成] 视频播放失败:', err);
                isStopped = true;
                if (recorder && recorder.state !== 'inactive') {
                  recorder.stop();
                }
                cleanup();
                reject(err);
              });
            };
            
            // 如果视频已经可以播放，立即触发
            if (video.readyState >= 3) {
              video.oncanplay();
            }
          } catch (error) {
            cleanup();
            reject(error);
          }
        };
        
        video.onerror = (e) => {
          console.error('[录制完成] 视频加载失败:', e);
          cleanup();
          reject(new Error('视频加载失败'));
        };
        
        // 加载视频
        video.load();
      });
    }

    async function handleRecordingComplete() {
      console.log('[录制完成] 开始处理录制数据...');
      await new Promise(resolve => setTimeout(resolve, 300));

      // 低配置设备可能需要更长时间，增加等待和重试
      let retryCount = 0;
      const maxRetries = 5;
      while (canvasChunks.length === 0 && retryCount < maxRetries) {
        console.warn(`[录制完成] 数据块为空，等待中... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
      }

      if (canvasChunks.length === 0) {
        console.error('[录制完成] 错误：没有录制数据块！', {
          chunksRefLength: canvasChunksRef.current ? canvasChunksRef.current.length : 0,
          chunksLength: canvasChunks.length,
          recorderState: canvasRecorder ? canvasRecorder.state : 'null'
        });
        // 即使失败也要给用户反馈
        alert('录制失败：没有生成视频数据。请重试。');
        return;
      }

      const totalSize = canvasChunks.reduce((sum, chunk) => sum + chunk.size, 0);
      console.log('[录制完成] 数据块信息:', {
        chunksCount: canvasChunks.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
      });

      // 从 MediaRecorder 获取实际使用的 MIME 类型，如果没有则使用通用类型
      let mimeType = 'video/webm'; // 默认类型
      if (canvasRecorder && canvasRecorder.mimeType) {
        mimeType = canvasRecorder.mimeType;
        console.log('[录制完成] 使用 MediaRecorder 的 MIME 类型:', mimeType);
      } else {
        // 尝试从第一个数据块的类型推断
        if (canvasChunks.length > 0 && canvasChunks[0].type) {
          mimeType = canvasChunks[0].type;
          console.log('[录制完成] 从数据块推断 MIME 类型:', mimeType);
        } else {
          // 尝试检测支持的格式
          if (MediaRecorder.isTypeSupported('video/webm')) {
            mimeType = 'video/webm';
          } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/mp4';
          }
          console.log('[录制完成] 使用默认 MIME 类型:', mimeType);
        }
      }
      
      const canvasBlob = new Blob(canvasChunks, { type: mimeType });

      if (!canvasBlob || canvasBlob.size === 0) {
        console.error('[录制完成] 错误：生成的 Blob 为空！', {
          blob: canvasBlob,
          blobSize: canvasBlob ? canvasBlob.size : 0,
          chunksCount: canvasChunks.length
        });
        alert('录制失败：生成的视频文件为空。请重试。');
        return;
      }

      console.log('[录制完成] 视频 Blob 生成成功:', {
        blobSize: canvasBlob.size,
        blobSizeMB: (canvasBlob.size / 1024 / 1024).toFixed(2),
        mimeType: mimeType
      });

      // 录制完成后不显示原始视频，只显示合成后的视频
      // 注释掉预览设置，等待合成完成后再显示
      // const videoUrl = URL.createObjectURL(canvasBlob);
      // setPreviewUrl(videoUrl);
      // setPreviewIsMp4(false);
      console.log('[录制完成] 开始上传和处理，等待合成完成后再显示预览');

      setTimeout(async () => {
        const uploadFn = uploadToOSSRef.current;
        const processFn = processVideoWithFCRef.current;

        if (!uploadFn) {
          return;
        }

        // 录制画布上的视频已经是原始方向（不镜像），不需要再翻转
        // 参考 createP5Sketch copy 2.js 的方式：直接上传，不进行翻转处理
        // 这样可以避免 flipVideoBlob 函数导致的花屏问题

        // 根据 MIME 类型确定文件扩展名
        const extension = mimeType.includes('mp4') ? 'mp4' : 
                         mimeType.includes('webm') ? 'webm' : 
                         'webm'; // 默认使用 webm
        const fileName = `videos/recording-${Date.now()}.${extension}`;
        console.log('[录制完成] 上传文件名:', fileName, 'MIME 类型:', mimeType);

        try {
          // 直接使用原始视频上传（录制画布上已经是正确的方向）
          const uploadBlob = canvasBlob;
          const ossResult = await uploadFn(uploadBlob, fileName, () => {});
          if (processFn && ossResult.key && FC_FUNCTION_URL) {
            try {
              await processFn(ossResult.key);
            } catch (fcError) {
              console.error('FC processing failed:', fcError);
            }
          }
        } catch (uploadError) {
          console.error('Upload failed:', uploadError);
        }
      }, 200);
    }

    p.draw = () => {
      // 清除背景，避免画面叠加
      p.background(0);
      
      // 每 60 帧打印一次画布大小（用于调试）
      if (p.frameCount % 60 === 0) {
        console.log('画布大小（运行时）:', {
          canvasW: canvasW,
          canvasH: canvasH,
          resolution: resolution,
          p5CanvasWidth: p.width,
          p5CanvasHeight: p.height,
          actualCanvasWidth: p.canvas ? p.canvas.width : null,
          actualCanvasHeight: p.canvas ? p.canvas.height : null
        });
      }
      
      // iOS 微信特殊处理：检查视频元素是否真的准备好了
      // 对于 iOS 微信，需要检查 videoWidth 而不是 loadedmetadata
      if (video && video.elt) {
        const videoEl = video.elt;
        
        // 每 60 帧打印一次视频大小（用于调试）
        if (p.frameCount % 60 === 0 && videoEl.videoWidth > 0) {
          const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
          const canvasAspect = canvasW / canvasH;
          
          // 计算视频在画布上的实际显示尺寸
          let displayW, displayH, offsetX, offsetY;
          if (videoAspect > canvasAspect) {
            displayW = canvasW;
            displayH = canvasW / videoAspect;
            offsetX = 0;
            offsetY = (canvasH - displayH) / 2;
          } else {
            displayH = canvasH;
            displayW = canvasH * videoAspect;
            offsetX = (canvasW - displayW) / 2;
            offsetY = 0;
          }
          
          // console.log('视频大小（运行时）:', {
          //   videoWidth: videoEl.videoWidth,
          //   videoHeight: videoEl.videoHeight,
          //   videoAspectRatio: videoAspect,
          //   canvasW: canvasW,
          //   canvasH: canvasH,
          //   canvasAspectRatio: canvasAspect,
          //   displayWidth: displayW,
          //   displayHeight: displayH,
          //   displayOffsetX: offsetX,
          //   displayOffsetY: offsetY,
          //   readyState: videoEl.readyState
          // });
        }
        
        // 检查视频是否真的准备好了（iOS 微信可能需要更宽松的检查）
        const isVideoReady = videoEl.videoWidth > 0 || 
                            (videoEl.readyState >= 2 && videoEl.readyState <= 4) ||
                            (video.loadedmetadata === true);

        // 同步在界面上的调试文本（每 10 帧更新一次）
        if (videoStatusEl && (p.frameCount % 10 === 0)) {
          const text = [
            `视频就绪: ${isVideoReady ? '是' : '否'}`,
            `大小: ${videoEl.videoWidth}x${videoEl.videoHeight}`,
            `readyState: ${videoEl.readyState}`,
            `paused: ${videoEl.paused}`,
            `hasSrcObject: ${videoEl.srcObject ? '是' : '否'}`
          ].join('\n');
          if (text !== lastVideoStatusText) {
            lastVideoStatusText = text;
            videoStatusEl.textContent = text;
          }
        } else if (videoStatusEl && !video) {
          const text = '视频状态: 没有 video 对象';
          if (text !== lastVideoStatusText) {
            lastVideoStatusText = text;
            videoStatusEl.textContent = text;
          }
        }
        
        // 如果视频还没准备好，尝试播放
        if (!isVideoReady && videoEl.srcObject && videoEl.paused) {
          videoEl.play().catch(e => {
            if (p.frameCount % 60 === 0) {
              console.warn('iOS 微信：draw 中尝试播放失败', e);
            }
          });
        }
        
        if (isVideoReady) {
          // 先绘制视频（保持原始宽高比，居中显示，不拉伸）
        if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
          const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
          const canvasAspect = canvasW / canvasH;
          
          let drawW;
          let drawH;
          let offsetX;
          let offsetY;
          
          if (videoAspect > canvasAspect) {
            // 视频更宽，以宽度为准
            drawW = canvasW;
            drawH = canvasW / videoAspect;
            offsetX = 0;
            offsetY = (canvasH - drawH) / 2;
          } else {
            // 视频更高，以高度为准
            drawH = canvasH;
            drawW = canvasH * videoAspect;
            offsetX = (canvasW - drawW) / 2;
            offsetY = 0;
          }
          
          
          // 绘制视频，保持原始比例
          // 前置摄像头（user）需要左右镜像，后置摄像头（environment）不需要镜像
          // iOS 微信环境下，直接使用原生 context 绘制原生 video 元素；
          // 其他环境仍然使用 p5 自己的 video 对象，避免兼容性问题。
          const isIOSWeChat = /iPhone|iPad|iPod/.test(navigator.userAgent) && /MicroMessenger/.test(navigator.userAgent);
          const shouldMirror = currentFacingMode === 'user'; // 只有前置摄像头才镜像
          
          if (isIOSWeChat) {
            const ctx = p.drawingContext;
            if (ctx && typeof ctx.drawImage === 'function') {
              ctx.save();
              if (shouldMirror) {
                // 左右镜像：平移到右边缘，然后水平翻转
                ctx.translate(canvasW, 0);
                ctx.scale(-1, 1);
                // 在翻转后的坐标系中，绘制在 (offsetX, offsetY) 位置
                ctx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
              } else {
                // 后置摄像头：直接绘制，不镜像
                ctx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
              }
              ctx.restore();
            }
          } else {
            p.push();
            if (shouldMirror) {
              // 左右镜像：平移到右边缘，然后水平翻转
              p.translate(canvasW, 0);
              p.scale(-1, 1);
              // 在翻转后的坐标系中，绘制在 (offsetX, offsetY) 位置
              p.image(video, offsetX, offsetY, drawW, drawH);
            } else {
              // 后置摄像头：直接绘制，不镜像
              p.image(video, offsetX, offsetY, drawW, drawH);
            }
            p.pop();
          }
        } else {
          // 如果视频尺寸未知，使用全屏（向后兼容）
          // 前置摄像头（user）需要左右镜像，后置摄像头（environment）不需要镜像
          const isIOSWeChat = /iPhone|iPad|iPod/.test(navigator.userAgent) && /MicroMessenger/.test(navigator.userAgent);
          const shouldMirror = currentFacingMode === 'user'; // 只有前置摄像头才镜像
          
          if (isIOSWeChat) {
            const ctx = p.drawingContext;
            if (ctx && typeof ctx.drawImage === 'function') {
              ctx.save();
              if (shouldMirror) {
                // 左右镜像：平移到右边缘，然后水平翻转
                ctx.translate(canvasW, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoEl, 0, 0, canvasW, canvasH);
              } else {
                // 后置摄像头：直接绘制，不镜像
                ctx.drawImage(videoEl, 0, 0, canvasW, canvasH);
              }
              ctx.restore();
            }
          } else {
            p.push();
            if (shouldMirror) {
              // 左右镜像：平移到右边缘，然后水平翻转
              p.translate(canvasW, 0);
              p.scale(-1, 1);
              p.image(video, 0, 0, canvasW, canvasH);
            } else {
              // 后置摄像头：直接绘制，不镜像
              p.image(video, 0, 0, canvasW, canvasH);
            }
            p.pop();
          }
        }
        
        // 如果 MediaPipe Hands 还在加载中，显示全屏进度条
        // 只有在启用 MediaPipe 时才显示加载提示
        if (enableMediaPipe && !window.isHandPoseReady) {
          // 计算伪进度（基于时间，模拟加载进度）
          // 假设加载需要 2-3 秒，使用帧数或时间来计算进度
          const loadingStartTime = window._mediaPipeLoadingStartTime || p.millis();
          if (!window._mediaPipeLoadingStartTime) {
            window._mediaPipeLoadingStartTime = loadingStartTime;
          }
          
          const elapsedTime = p.millis() - loadingStartTime;
          // 伪进度：前 80% 快速加载，后 20% 慢速加载（模拟真实加载）
          let progress = Math.min(elapsedTime / 2500, 0.95); // 最多到 95%，等待实际加载完成
          // 使用缓动函数让进度更平滑
          progress = progress < 0.8 ? progress * 1.25 : 0.8 + (progress - 0.8) * 0.75;
          progress = Math.min(progress, 0.95);
          
          p.push();
          
          // 全屏半透明黑色背景
          p.noStroke();
          p.fill(0, 200); // 半透明黑色
          p.rect(0, 0, canvasW, canvasH);
          
          // 进度条容器
          const progressBarW = canvasW * 0.7;
          const progressBarH = 8;
          const progressBarX = (canvasW - progressBarW) / 2;
          const progressBarY = canvasH / 2;
          
          // 绘制进度条背景
          p.fill(255, 255, 255, 100); // 半透明白色背景
          p.rect(progressBarX, progressBarY, progressBarW, progressBarH, 4);
          
          // 绘制进度条填充
          const progressWidth = progressBarW * progress;
          p.fill(255, 255, 255); // 白色填充
          p.rect(progressBarX, progressBarY, progressWidth, progressBarH, 4);
          
          // 绘制文字
          p.fill(255);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(20);
          p.text('手势识别加载中…', canvasW / 2, progressBarY - 30);
          
          // 绘制百分比
          p.textSize(16);
          p.text(`${Math.round(progress * 100)}%`, canvasW / 2, progressBarY + 30);
          
          p.pop();
        } else if (window.isHandPoseReady && window._mediaPipeLoadingStartTime) {
          // 加载完成后清除开始时间
          window._mediaPipeLoadingStartTime = null;
        }
        
        // 绘制手部关键点和连接线（优化：降低绘制频率，减少性能开销）
        // 录制时：每 3 帧绘制一次（降低频率，减少性能开销）
        // 非录制时：每 2 帧绘制一次（保持视觉流畅性）
        const drawInterval = isRecording ? 3 : 2;
        // 调试：每 3 秒打印一次手势数据
        const currentTime = p.millis();
        if (currentTime - lastHandsLogTime >= 3000) {
          lastHandsLogTime = currentTime;
          console.log('[手势检测]', {
            hasHands: !!window.hands,
            handsLength: window.hands ? window.hands.length : 0,
            isHandPoseReady: window.isHandPoseReady,
            hasVideo: !!(video && video.elt),
            frameCount: p.frameCount,
            isRecording: isRecording,
            hands: window.hands ? window.hands.map(hand => ({
              landmarksCount: hand.landmarks ? hand.landmarks.length : 0,
              keypointsCount: hand.keypoints ? hand.keypoints.length : 0,
              handedness: hand.handedness,
              // 显示第一个关键点的坐标作为示例
              firstLandmark: hand.landmarks && hand.landmarks[0] ? hand.landmarks[0] : null,
              firstKeypoint: hand.keypoints && hand.keypoints[0] ? hand.keypoints[0] : null
            })) : null
          });
        }
        // 只有在启用 MediaPipe 时才绘制手势点
        if (enableMediaPipe && window.hands && window.hands.length > 0 && video && video.elt && p.frameCount % drawInterval === 0) {
          const videoEl = video.elt;
          if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
            // 计算视频在画布上的实际显示区域（用于坐标转换）
            // 缓存计算结果，避免重复计算
            const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
            const canvasAspect = canvasW / canvasH;
            
            let displayW;
            let displayH;
            let displayOffsetX;
            let displayOffsetY;
            
            if (videoAspect > canvasAspect) {
              displayW = canvasW;
              displayH = canvasW / videoAspect;
              displayOffsetX = 0;
              displayOffsetY = (canvasH - displayH) / 2;
            } else {
              displayH = canvasH;
              displayW = canvasH * videoAspect;
              displayOffsetX = (canvasW - displayW) / 2;
              displayOffsetY = 0;
            }
            
            // 预计算缩放因子，避免重复计算
            const scaleX = displayW / videoEl.videoWidth;
            const scaleY = displayH / videoEl.videoHeight;
            
            p.push();

            window.hands.forEach(function(hand, handIndex) {
              // 优先使用 landmarks，其次 keypoints
              let points = hand.landmarks || hand.keypoints || [];
              
              // 如果 points 为空，尝试从命名关键点构建
              if (!Array.isArray(points) || points.length === 0) {
                const namedPoints = [
                  hand['wrist'],
                  hand['thumb_cmc'], hand['thumb_mcp'], hand['thumb_ip'], hand['thumb_tip'],
                  hand['index_finger_mcp'], hand['index_finger_pip'], hand['index_finger_dip'], hand['index_finger_tip'],
                  hand['middle_finger_mcp'], hand['middle_finger_pip'], hand['middle_finger_dip'], hand['middle_finger_tip'],
                  hand['ring_finger_mcp'], hand['ring_finger_pip'], hand['ring_finger_dip'], hand['ring_finger_tip'],
                  hand['pinky_mcp'], hand['pinky_pip'], hand['pinky_dip'], hand['pinky_tip']
                ].filter(function(p) { return p != null; });
                if (namedPoints.length > 0) {
                  points = namedPoints;
                }
              }
              
              if (hand && Array.isArray(points) && points.length > 0) {
                // 使用拇指指尖和食指指尖控制小马 GIF（如果存在），用中指-手腕距离控制缩放
                if (magnets && magnets.length > 0 && points[4] && points[8]) {
                  const toCanvasPos = function(point) {
                    if (!point) return null;
                    let x = Array.isArray(point) ? point[0] : point.x;
                    let y = Array.isArray(point) ? point[1] : point.y;
                    let z = Array.isArray(point) ? point[2] : (point.z !== undefined ? point.z : 0);
                    if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
                      return null;
                    }
                    let canvasX;
                    let canvasY;
                    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                      // 归一化坐标
                      canvasX = displayOffsetX + x * displayW;
                      canvasY = displayOffsetY + y * displayH;
                    } else {
                      // 像素坐标
                      canvasX = displayOffsetX + x * scaleX;
                      canvasY = displayOffsetY + y * scaleY;
                    }
                    // 左右镜像：只有前置摄像头（user）时，视频已镜像，手势坐标也需要镜像才能对齐
                    // 后置摄像头（environment）时，视频不镜像，手势坐标也不需要镜像
                    if (currentFacingMode === 'user') {
                      canvasX = canvasW - canvasX;
                    }
                    return {
                      x: canvasX,
                      y: canvasY,
                      z: z !== undefined && !isNaN(z) ? z : 0
                    };
                  };

                  const thumbCanvas = toCanvasPos(points[4]); // 拇指尖
                  const indexCanvas = toCanvasPos(points[8]); // 食指尖
                  const middleCanvas = points[12] ? toCanvasPos(points[12]) : null; // 中指尖
                  const wristCanvas = points[0] ? toCanvasPos(points[0]) : null; // 手腕
                  // 只有在启用 MediaPipe 时才控制 GIF
                  if (enableMediaPipe && thumbCanvas && indexCanvas) {
                    magnets.forEach((m) => {
                      if (m && typeof m.touch === 'function') {
                        m.touch(
                          thumbCanvas.x,
                          thumbCanvas.y,
                          indexCanvas.x,
                          indexCanvas.y,
                          middleCanvas ? middleCanvas.x : undefined,
                          middleCanvas ? middleCanvas.y : undefined,
                          middleCanvas ? middleCanvas.z : undefined, // 中指尖的 z 坐标
                          wristCanvas ? wristCanvas.x : undefined,
                          wristCanvas ? wristCanvas.y : undefined,
                          wristCanvas ? wristCanvas.z : undefined, // 手腕的 z 坐标
                        );
                      }
                    });
                  }
                }

                // 绘制手部关键点（红色圆圈）
                points.forEach(function(point, pointIndex) {
                  if (!point) return;
                  
                  // MediaPipe Hands 返回的坐标格式：
                  // 1. landmarks: [x, y, z] 数组，坐标是归一化的（0-1）
                  // 2. keypoints: {x, y, z} 对象，坐标是归一化的（0-1）
                  let x;
                  let y;
                  
                  if (Array.isArray(point)) {
                    x = point[0];
                    y = point[1];
                  } else if (typeof point === 'object' && point !== null) {
                    x = point.x;
                    y = point.y;
                  } else {
                    return;
                  }
                  
                  // 检查坐标有效性
                  if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
                    return;
                  }
                  
                  // 判断坐标格式：如果值在 0-1 之间，是归一化坐标；否则是像素坐标
                  let canvasX;
                  let canvasY;
                  
                  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                    // 归一化坐标：使用预计算的缩放因子，优化性能
                    canvasX = displayOffsetX + x * displayW;
                    canvasY = displayOffsetY + y * displayH;
                  } else {
                    // 像素坐标：使用预计算的缩放因子
                    canvasX = displayOffsetX + x * scaleX;
                    canvasY = displayOffsetY + y * scaleY;
                  }
                  
                  // 左右镜像：只有前置摄像头（user）时，视频已镜像，手势坐标也需要镜像才能对齐
                  // 后置摄像头（environment）时，视频不镜像，手势坐标也不需要镜像
                  if (currentFacingMode === 'user') {
                    canvasX = canvasW - canvasX;
                  }
                  
                  // 检查画布坐标有效性，避免绘制到无效位置
                  if (canvasX < 0 || canvasX > canvasW || canvasY < 0 || canvasY > canvasH) {
                    return;
                  }
                  
                  // 绘制关键点（红色圆圈，优化：减小尺寸提升性能）
                  p.fill(255, 0, 0);
                  p.stroke(255, 255, 255);
                  p.strokeWeight(1);
                  p.circle(canvasX, canvasY, 8); // 减小圆圈尺寸，减少绘制开销
                });
                
                // 不再绘制手部连接线，降低视觉干扰和绘制开销
              }
            });

            p.pop();
          }
        }
        } // 闭合 if (isVideoReady)

        // 在视频和手势绘制之后绘制小马 GIF（如果图片已加载）
        if (magnets && magnets.length > 0) {
          magnets.forEach((m) => {
            if (m) {
              m.display(canvasW, canvasH);
            }
          });
        }

        // 只在录制时才绘制到录制画布，减少非录制时的性能开销
        // 录制时必须持续绘制到录制画布，确保录制流不会停止
        if (isRecording && recordCanvas && recordCtx) {
          // 即使视频还没完全准备好，也要尝试绘制（录制画布内部会检查视频状态）
          // 这样可以确保录制流持续更新，不会因为视频状态变化而停止
          drawToRecordCanvas();
          
          // 调试：每 60 帧打印一次录制画布状态
          if (p.frameCount % 60 === 0) {
            console.log('[录制画布] 绘制状态:', {
              isRecording: isRecording,
              hasRecordCanvas: !!recordCanvas,
              hasRecordCtx: !!recordCtx,
              hasVideo: !!(video && video.elt),
              videoReady: video && video.elt ? (video.elt.videoWidth > 0) : false,
              frameCount: p.frameCount
            });
          }
        }
        // 4. 安全调用 send（确保 WASM 完全初始化）
        // 使用低分辨率检测画布进行检测，降低计算量
        // 录制时：每 8 帧调用一次（降低检测频率，减少性能开销，约 3.75fps）
        // 非录制时：每 4 帧调用一次（约 15fps 检测频率，平衡性能和响应速度）
        // 只有在启用 MediaPipe 时才进行检测
        if (enableMediaPipe && window.isHandPoseReady && window.handsSolution && video && video.elt && detectCanvas && detectCtx) {
          const detectInterval = isRecording ? 8 : 4;
          if (p.frameCount % detectInterval === 0) {
            try {
              const currentVideoEl = video.elt;
              if (currentVideoEl && currentVideoEl.videoWidth > 0 && currentVideoEl.videoHeight > 0) {
                // 将视频绘制到低分辨率检测画布上，保持宽高比
                const videoAspect = currentVideoEl.videoWidth / currentVideoEl.videoHeight;
                const detectAspect = detectCanvasW / detectCanvasH;
                
                let detectDrawW, detectDrawH, detectOffsetX, detectOffsetY;
                
                if (videoAspect > detectAspect) {
                  // 视频更宽，以宽度为准
                  detectDrawW = detectCanvasW;
                  detectDrawH = detectCanvasW / videoAspect;
                  detectOffsetX = 0;
                  detectOffsetY = (detectCanvasH - detectDrawH) / 2;
                } else {
                  // 视频更高，以高度为准
                  detectDrawH = detectCanvasH;
                  detectDrawW = detectCanvasH * videoAspect;
                  detectOffsetX = (detectCanvasW - detectDrawW) / 2;
                  detectOffsetY = 0;
                }
                
                // 清空检测画布（填充黑色背景）
                detectCtx.fillStyle = '#000';
                detectCtx.fillRect(0, 0, detectCanvasW, detectCanvasH);
                
                // 将视频绘制到低分辨率检测画布上，居中显示
                detectCtx.drawImage(
                  currentVideoEl,
                  detectOffsetX, detectOffsetY, detectDrawW, detectDrawH
                );
                
                // 使用低分辨率检测画布进行 MediaPipe 检测
                window.handsSolution.send({ image: detectCanvas }).catch(e => {
                  // 静默处理错误，避免控制台噪音
                  if (!e.message || (!e.message.includes('already processing') && !e.message.includes('not ready'))) {
                    console.warn('Hands send skipped', e);
                  }
                });
              }
            } catch (e) {
              // 忽略同步错误
            }
          }
        }
      }
    };
  }, containerRef.current);

  return sketch;
}

