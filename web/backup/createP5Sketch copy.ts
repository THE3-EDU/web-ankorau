// p5.js sketch 创建函数
import p5 from 'p5';
import { Hands } from '@mediapipe/hands';
import { requestIdleCallbackCompat } from '../../utils/requestIdleCallback';

// 使用 mediapipe runtime，不需要 TensorFlow.js 后端设置

// 全局错误处理：忽略 WebGPU 和 MediaPipe WASM 相关错误
if (typeof window !== 'undefined') {
  const originalErrorHandler = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
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
  window.addEventListener('unhandledrejection', (event) => {
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

export interface P5SketchConfig {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onLoadingChange?: (loading: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setPreviewIsMp4: (isMp4: boolean) => void;
  setElapsedTime: (time: number | ((prev: number) => number)) => void;
  setCanvasStopped: (stopped: boolean) => void;
  setVideoStopped: (stopped: boolean) => void;
  canvasChunksRef: React.MutableRefObject<Blob[]>;
  videoChunksRef: React.MutableRefObject<Blob[]>;
  elapsedTimerRef: React.MutableRefObject<number | null>;
  uploadToOSSRef: React.MutableRefObject<((blob: Blob, fileName: string, onProgress?: (progress: number) => void) => Promise<{ url: string; key: string }>) | null>;
  processVideoWithFCRef: React.MutableRefObject<((ossVideoKey: string) => Promise<string>) | null>;
  startRecordingRef: React.MutableRefObject<(() => void) | null>;
  stopRecordingRef: React.MutableRefObject<(() => void) | null>;
  takePhotoRef: React.MutableRefObject<(() => void) | null>;
  FC_FUNCTION_URL: string;
}

export function createP5Sketch(config: P5SketchConfig) {
  const {
    containerRef,
    onLoadingChange,
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
    FC_FUNCTION_URL,
  } = config;

  let mounted = true;
  let loadingTimeout: ReturnType<typeof setTimeout> | null = null;

  if (!containerRef.current) return;
  
  const sketch = new p5((p: any) => {
    let video: any;
    let handsSolution: Hands | null = null;
    let hands: any[] = [];
    let isHandPoseReady = false;
    const canvasW = 1080;
    const canvasH = 1440;
    const recordCanvasW = 1080;
    const recordCanvasH = 1440;

    let canvasRecorder: MediaRecorder | null = null;
    let videoRecorder: MediaRecorder | null = null;
    let canvasChunks: BlobPart[] = [];
    let videoChunks: BlobPart[] = [];
    let isRecording = false;

    let recordCanvas: HTMLCanvasElement | null = null;
    let recordCtx: CanvasRenderingContext2D | null = null;

    p.setup = () => {
      // 抑制设备方向 API 警告（我们不需要使用设备方向功能）
      if (typeof DeviceOrientationEvent !== 'undefined' && 
          typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        // iOS 13+ 需要请求权限，但我们不需要这个功能，所以不请求
        // 这样可以避免控制台警告
      }
      
      const canvas = p.createCanvas(canvasW, canvasH);
      if (containerRef.current) {
        canvas.parent(containerRef.current);
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

      p.background(0, 0, 0, 0);

      // 手机端使用4:3比例
      const constraints = {
        video: {
          aspectRatio: { exact: 4/3 },
          facingMode: 'user',
        },
        audio: false
      };

      const fallbackConstraints = {
        video: {
          aspectRatio: { ideal: 4/3 },
          facingMode: 'user',
        },
        audio: false
      };

      try {
        video = p.createCapture(constraints);
        if (video && video.elt) {
          video.elt.style.display = 'none';
          video.elt.style.position = 'absolute';
          video.elt.style.visibility = 'hidden';
        }
      } catch (error) {
        console.warn('Failed with exact constraints, trying fallback:', error);
        try {
          video = p.createCapture(fallbackConstraints);
          if (video && video.elt) {
            video.elt.style.display = 'none';
            video.elt.style.position = 'absolute';
            video.elt.style.visibility = 'hidden';
          }
        } catch (fallbackError) {
          console.error('Failed to create video capture:', fallbackError);
        }
      }

      startRecordingRef.current = startRecording;
      stopRecordingRef.current = stopRecording;
      takePhotoRef.current = takePhoto;

      if (video && video.elt) {
        const videoEl = video.elt as HTMLVideoElement;
        const onVideoReady = () => {
          if (mounted) {
            onLoadingChange?.(false);
            if (loadingTimeout) {
              clearTimeout(loadingTimeout);
            }
          }

          // 初始化手势识别（直接使用 MediaPipe Hands）
          if (videoEl.videoWidth > 0) {
            setTimeout(() => {
              try {
                console.log('=== 开始初始化 MediaPipe Hands ===');
                
                // 初始化 MediaPipe Hands，使用本地文件
                handsSolution = new Hands({
                  locateFile: (file: string) => {
                    // 使用本地文件路径（注意：路径中不要包含 @ 符号）
                    return `/mediapipe/hands/${file}`;
                  }
                });
                
                // 设置选项 - 使用 lite 模型（modelComplexity: 0）避免需要额外的 palm_detection_full.tflite
                handsSolution.setOptions({
                  maxNumHands: 2,
                  modelComplexity: 0, // 0 = lite (只需要 hand_landmark_lite.tflite), 1 = full (需要 palm_detection_full.tflite)
                  minDetectionConfidence: 0.5,
                  minTrackingConfidence: 0.5
                });
                
                // 设置结果回调
                let resultCount = 0;
                handsSolution.onResults((results: any) => {
                  try {
                    resultCount++;
                    
                    // 打印原始结果（每60次回调打印一次）
                    if (resultCount % 60 === 0) {
                      console.log('📊 MediaPipe Hands 原始结果:', {
                        resultCount,
                        hasMultiHandLandmarks: !!results.multiHandLandmarks,
                        landmarksCount: results.multiHandLandmarks?.length || 0,
                        hasMultiHandedness: !!results.multiHandedness,
                        handednessCount: results.multiHandedness?.length || 0,
                        fullResults: results
                      });
                    }
                    
                    // 转换 MediaPipe 格式为兼容格式
                    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                      hands = results.multiHandLandmarks.map((landmarks: any[], index: number) => {
                        const handData = {
                          landmarks: landmarks.map((lm: any) => [lm.x, lm.y, lm.z]),
                          keypoints: landmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z }))
                        };
                        
                        // 如果有 handedness 信息，也保存
                        if (results.multiHandedness && results.multiHandedness[index]) {
                          (handData as any).handedness = results.multiHandedness[index].categoryName;
                          (handData as any).score = results.multiHandedness[index].score;
                        }
                        
                        return handData;
                      });
                      
                      // 每60次回调打印一次检测结果（不使用 p.frameCount，因为这是在回调中）
                      if (resultCount % 60 === 0) {
                        const handsInfo = hands.map((hand: any, idx: number) => {
                          return {
                            index: idx,
                            landmarksCount: hand.landmarks?.length || 0,
                            keypointsCount: hand.keypoints?.length || 0,
                            handedness: (hand as any).handedness || 'unknown',
                            score: (hand as any).score || 0,
                            firstLandmark: hand.landmarks?.[0],
                            firstKeypoint: hand.keypoints?.[0]
                          };
                        });
                        console.log('✅ MediaPipe Hands 检测到手:', {
                          handsCount: hands.length,
                          hands: handsInfo
                        });
                      }
                    } else {
                      hands = [];
                      // 每60次回调打印一次无检测结果
                      if (resultCount % 60 === 0) {
                        console.log('⏳ MediaPipe Hands 未检测到手');
                      }
                    }
                  } catch (error) {
                    console.error('❌ onResults 处理错误:', error);
                    hands = [];
                  }
                });
                
                // 等待 MediaPipe Hands 完全初始化
                // 通过检查 send 方法是否存在来确认初始化完成
                let checkInitCount = 0;
                const maxCheckCount = 100; // 最多检查 10 秒 (100 * 100ms)
                const checkInit = setInterval(() => {
                  checkInitCount++;
                  if (handsSolution && typeof handsSolution.send === 'function') {
                    clearInterval(checkInit);
                    isHandPoseReady = true;
                    console.log('✅ MediaPipe Hands 初始化完成，send 方法可用');
                  } else if (checkInitCount >= maxCheckCount) {
                    clearInterval(checkInit);
                    console.warn('⚠️ MediaPipe Hands 初始化超时');
                    isHandPoseReady = false;
                  }
                }, 100);
              } catch (error) {
                console.error('❌ MediaPipe Hands 初始化失败:', error);
                isHandPoseReady = false;
                handsSolution = null;
              }
            }, 500);
          }
      };

      videoEl.addEventListener('loadedmetadata', onVideoReady);
      videoEl.addEventListener('loadeddata', onVideoReady);

      if (videoEl.readyState >= 2) {
        setTimeout(onVideoReady, 100);
      }

      videoEl.addEventListener('error', () => {
        if (mounted) {
          onLoadingChange?.(false);
          if (loadingTimeout) {
            clearTimeout(loadingTimeout);
          }
        }
      });
    }
  };

    function startRecording() {
      if (typeof MediaRecorder === 'undefined') {
        console.error('MediaRecorder is not supported');
        return;
      }

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
        try {
          const canvasStream = recordCanvas.captureStream(30);
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';

          canvasRecorder = new MediaRecorder(canvasStream, {
            mimeType,
            videoBitsPerSecond: 5000000
          });

          canvasRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              canvasChunks.push(event.data);
              canvasChunksRef.current = canvasChunks.filter((chunk): chunk is Blob => chunk instanceof Blob);
            }
          };

          canvasRecorder.onstop = () => {
            setCanvasStopped(true);
            setTimeout(() => {
              handleRecordingComplete();
            }, 300);
          };

          canvasRecorder.onerror = () => {
            stopRecording();
          };

          canvasRecorder.start(1000);
        } catch (error) {
          console.error('Error setting up recorder:', error);
        }
      }

      isRecording = true;
      setElapsedTime(0);

      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedTime((prev: number) => prev + 1);
      }, 1000);
    }

    function stopRecording() {
      if (!isRecording) {
        return;
      }

      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (canvasRecorder) {
        try {
          if (canvasRecorder.state === 'recording') {
            canvasRecorder.stop();
          } else {
            setCanvasStopped(true);
            setTimeout(() => {
              handleRecordingComplete();
            }, 300);
          }
        } catch (error) {
          console.error('Error stopping recorder:', error);
          setCanvasStopped(true);
          setTimeout(() => {
            handleRecordingComplete();
          }, 300);
        }
      } else {
        setCanvasStopped(true);
        setTimeout(() => {
          handleRecordingComplete();
        }, 300);
      }

      isRecording = false;
    }

    function takePhoto() {
      if (!recordCanvas || !recordCtx) {
        return;
      }
      recordCanvas.toBlob((blob) => {
        if (blob) {
          const photoUrl = URL.createObjectURL(blob);
          setPreviewUrl(photoUrl);
        }
      }, 'image/png');
    }

    async function handleRecordingComplete() {
      await new Promise(resolve => setTimeout(resolve, 300));

      if (canvasChunks.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (canvasChunks.length === 0) {
          return;
        }
      }

      const mimeType = 'video/webm;codecs=vp9';
      const canvasBlob = new Blob(canvasChunks, { type: mimeType });

      if (!canvasBlob || canvasBlob.size === 0) {
        return;
      }

      const videoUrl = URL.createObjectURL(canvasBlob);
      setPreviewUrl(videoUrl);
      setPreviewIsMp4(false);

      setTimeout(async () => {
        const uploadFn = uploadToOSSRef.current;
        const processFn = processVideoWithFCRef.current;

        if (!uploadFn) {
          return;
        }

        const fileName = `videos/recording-${Date.now()}.webm`;

        try {
          const ossResult = await uploadFn(canvasBlob, fileName, () => {});
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
      if (video && video.loadedmetadata) {
        // 先绘制视频（保持原始宽高比，居中显示，不拉伸）
        const videoEl = video.elt as HTMLVideoElement;
        if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
          const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
          const canvasAspect = canvasW / canvasH;
          
          let drawW: number;
          let drawH: number;
          let offsetX: number;
          let offsetY: number;
          
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
          p.image(video, offsetX, offsetY, drawW, drawH);
        } else {
          // 如果视频尺寸未知，使用全屏（向后兼容）
          p.image(video, 0, 0, canvasW, canvasH);
        }

        // 测试绘制功能：在画布右上角绘制一个黄色测试点
        p.fill(255, 255, 0);
        p.noStroke();
        p.circle(canvasW - 30, 30, 20);

        // 在手势检测到的情况下绘制
        // 每60帧打印一次hands数组状态
        if (p.frameCount % 60 === 0) {
          console.log('🎨 绘制检查:', {
            hasHands: !!hands,
            handsLength: hands?.length || 0,
            hasVideo: !!video,
            hasVideoElt: !!(video && video.elt),
            handsArray: hands
          });
        }
        
        if (hands && hands.length > 0 && video && video.elt) {
          const videoEl = video.elt as HTMLVideoElement;
          if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
            // 计算视频在画布上的实际显示区域（用于坐标转换）
            const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
            const canvasAspect = canvasW / canvasH;
            
            let displayW: number;
            let displayH: number;
            let displayOffsetX: number;
            let displayOffsetY: number;
            
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
            
            p.push();
            p.stroke(0, 255, 0);
            p.strokeWeight(3);
            p.noFill();

            hands.forEach((hand: any, handIndex: number) => {
              // ml5.js 返回的格式：可能有 landmarks/keypoints 数组，或者命名关键点
              // 优先使用 landmarks，其次 keypoints，最后尝试从命名关键点构建数组
              let points = hand.landmarks || hand.keypoints || [];
              
              // 如果 points 为空，尝试从命名关键点构建（ml5.js 格式）
              if (!Array.isArray(points) || points.length === 0) {
                const namedPoints = [
                  hand['wrist'],
                  hand['thumb_cmc'], hand['thumb_mcp'], hand['thumb_ip'], hand['thumb_tip'],
                  hand['index_finger_mcp'], hand['index_finger_pip'], hand['index_finger_dip'], hand['index_finger_tip'],
                  hand['middle_finger_mcp'], hand['middle_finger_pip'], hand['middle_finger_dip'], hand['middle_finger_tip'],
                  hand['ring_finger_mcp'], hand['ring_finger_pip'], hand['ring_finger_dip'], hand['ring_finger_tip'],
                  hand['pinky_mcp'], hand['pinky_pip'], hand['pinky_dip'], hand['pinky_tip']
                ].filter(p => p != null);
                if (namedPoints.length > 0) {
                  points = namedPoints;
                }
              }
              
              // 每60帧打印一次绘制信息
              if (p.frameCount % 60 === 0 && handIndex === 0) {
                console.log('🎨 开始绘制手:', {
                  handIndex,
                  hasLandmarks: !!hand.landmarks,
                  landmarksCount: hand.landmarks?.length || 0,
                  hasKeypoints: !!hand.keypoints,
                  keypointsCount: hand.keypoints?.length || 0,
                  pointsLength: points?.length || 0,
                  firstPoint: points?.[0],
                  hasWrist: !!hand['wrist']
                });
              }
              
              if (hand && Array.isArray(points) && points.length > 0) {
                // 绘制手部关键点（红色圆圈）
                points.forEach((point: any, pointIndex: number) => {
                  if (!point) return;
                  
                  // MediaPipe Hands 返回的坐标格式：
                  // 1. landmarks: [x, y, z] 数组，坐标是归一化的（0-1）
                  // 2. keypoints: {x, y, z} 对象，坐标是归一化的（0-1）
                  let x: number;
                  let y: number;
                  
                  if (Array.isArray(point)) {
                    // landmarks 格式：[x, y, z]
                    x = point[0] || 0;
                    y = point[1] || 0;
                  } else if (typeof point === 'object' && point !== null) {
                    // keypoints 格式：{x, y, name}
                    x = point.x || 0;
                    y = point.y || 0;
                  } else {
                    return;
                  }
                  
                  // 判断坐标格式：如果值在 0-1 之间，是归一化坐标；否则是像素坐标
                  let canvasX: number;
                  let canvasY: number;
                  
                  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                    // 归一化坐标：先转换为视频像素坐标，再转换为画布显示坐标
                    const videoX = x * videoEl.videoWidth;
                    const videoY = y * videoEl.videoHeight;
                    canvasX = displayOffsetX + (videoX / videoEl.videoWidth) * displayW;
                    canvasY = displayOffsetY + (videoY / videoEl.videoHeight) * displayH;
                  } else {
                    // 像素坐标：直接转换为画布显示坐标
                    canvasX = displayOffsetX + (x / videoEl.videoWidth) * displayW;
                    canvasY = displayOffsetY + (y / videoEl.videoHeight) * displayH;
                  }
                  
                  // 绘制关键点（红色圆圈，更大更明显，带边框）
                  p.fill(255, 0, 0);
                  p.stroke(255, 255, 255);
                  p.strokeWeight(2);
                  p.circle(canvasX, canvasY, 12);
                });
                
                // 绘制手部连接线（绿色）
                p.stroke(0, 255, 0);
                p.strokeWeight(2);
                p.noFill();
                
                // 手部关键点连接（连接相邻的关键点形成手的形状）
                const connections = [
                  [0, 1], [1, 2], [2, 3], [3, 4], // 拇指
                  [0, 5], [5, 6], [6, 7], [7, 8], // 食指
                  [0, 9], [9, 10], [10, 11], [11, 12], // 中指
                  [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
                  [0, 17], [17, 18], [18, 19], [19, 20], // 小指
                ];
                
                connections.forEach(([start, end]) => {
                  if (points && points[start] && points[end]) {
                    const startPoint = points[start];
                    const endPoint = points[end];
                    
                    // 处理起点坐标
                    let startX: number;
                    let startY: number;
                    
                    if (Array.isArray(startPoint)) {
                      startX = startPoint[0] || 0;
                      startY = startPoint[1] || 0;
                    } else if (typeof startPoint === 'object' && startPoint !== null) {
                      startX = startPoint.x || 0;
                      startY = startPoint.y || 0;
                    } else {
                      return;
                    }
                    
                    let canvasStartX: number;
                    let canvasStartY: number;
                    
                    if (startX >= 0 && startX <= 1 && startY >= 0 && startY <= 1) {
                      // 归一化坐标：先转换为视频像素坐标，再转换为画布显示坐标
                      const videoStartX = startX * videoEl.videoWidth;
                      const videoStartY = startY * videoEl.videoHeight;
                      canvasStartX = displayOffsetX + (videoStartX / videoEl.videoWidth) * displayW;
                      canvasStartY = displayOffsetY + (videoStartY / videoEl.videoHeight) * displayH;
                    } else {
                      // 像素坐标：直接转换为画布显示坐标
                      canvasStartX = displayOffsetX + (startX / videoEl.videoWidth) * displayW;
                      canvasStartY = displayOffsetY + (startY / videoEl.videoHeight) * displayH;
                    }
                    
                    // 处理终点坐标
                    let endX: number;
                    let endY: number;
                    
                    if (Array.isArray(endPoint)) {
                      endX = endPoint[0] || 0;
                      endY = endPoint[1] || 0;
                    } else if (typeof endPoint === 'object' && endPoint !== null) {
                      endX = endPoint.x || 0;
                      endY = endPoint.y || 0;
                    } else {
                      return;
                    }
                    
                    let canvasEndX: number;
                    let canvasEndY: number;
                    
                    if (endX >= 0 && endX <= 1 && endY >= 0 && endY <= 1) {
                      // 归一化坐标：先转换为视频像素坐标，再转换为画布显示坐标
                      const videoEndX = endX * videoEl.videoWidth;
                      const videoEndY = endY * videoEl.videoHeight;
                      canvasEndX = displayOffsetX + (videoEndX / videoEl.videoWidth) * displayW;
                      canvasEndY = displayOffsetY + (videoEndY / videoEl.videoHeight) * displayH;
                    } else {
                      // 像素坐标：直接转换为画布显示坐标
                      canvasEndX = displayOffsetX + (endX / videoEl.videoWidth) * displayW;
                      canvasEndY = displayOffsetY + (endY / videoEl.videoHeight) * displayH;
                    }
                    
                    // 绘制连接线（绿色，更粗更明显）
                    p.stroke(0, 255, 0);
                    p.strokeWeight(3);
                    p.line(canvasStartX, canvasStartY, canvasEndX, canvasEndY);
                  }
                });
              }
            });

            p.pop();
          }
        }

        if (recordCanvas && recordCtx && video && video.elt) {
          const videoEl = video.elt as HTMLVideoElement;
          if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
            recordCtx.clearRect(0, 0, recordCanvasW, recordCanvasH);
            
            // 保持视频原始宽高比，居中显示，不拉伸
            const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
            const canvasAspect = recordCanvasW / recordCanvasH;
            
            let drawW: number;
            let drawH: number;
            let offsetX: number;
            let offsetY: number;
            
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
            recordCtx.drawImage(videoEl, offsetX, offsetY, drawW, drawH);
            
            // 在录制画布上也绘制手势识别结果（与主画布保持一致）
            if (hands && hands.length > 0 && recordCtx) {
              hands.forEach((hand: any) => {
                // ml5.js 返回的格式：可能有 landmarks/keypoints 数组，或者命名关键点
                let points = hand.landmarks || hand.keypoints || [];
                
                // 如果 points 为空，尝试从命名关键点构建（ml5.js 格式）
                if (!Array.isArray(points) || points.length === 0) {
                  const namedPoints = [
                    hand['wrist'],
                    hand['thumb_cmc'], hand['thumb_mcp'], hand['thumb_ip'], hand['thumb_tip'],
                    hand['index_finger_mcp'], hand['index_finger_pip'], hand['index_finger_dip'], hand['index_finger_tip'],
                    hand['middle_finger_mcp'], hand['middle_finger_pip'], hand['middle_finger_dip'], hand['middle_finger_tip'],
                    hand['ring_finger_mcp'], hand['ring_finger_pip'], hand['ring_finger_dip'], hand['ring_finger_tip'],
                    hand['pinky_mcp'], hand['pinky_pip'], hand['pinky_dip'], hand['pinky_tip']
                  ].filter(p => p != null);
                  if (namedPoints.length > 0) {
                    points = namedPoints;
                  }
                }
                
                if (hand && Array.isArray(points) && points.length > 0 && recordCtx) {
                  // 绘制关键点（红色圆圈，带白色边框）
                  points.forEach((point: any) => {
                    if (!recordCtx || !point) return;
                    
                    // 处理坐标格式（与主画布逻辑一致）
                    let x: number;
                    let y: number;
                    
                    if (Array.isArray(point)) {
                      x = point[0] || 0;
                      y = point[1] || 0;
                    } else if (typeof point === 'object' && point !== null) {
                      x = point.x || 0;
                      y = point.y || 0;
                    } else {
                      return;
                    }
                    
                    // 坐标转换（与主画布逻辑一致，使用已定义的 drawW, drawH, offsetX, offsetY）
                    let canvasX: number;
                    let canvasY: number;
                    
                    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                      // 归一化坐标：先转换为视频像素坐标，再转换为录制画布显示坐标
                      const videoX = x * videoEl.videoWidth;
                      const videoY = y * videoEl.videoHeight;
                      canvasX = offsetX + (videoX / videoEl.videoWidth) * drawW;
                      canvasY = offsetY + (videoY / videoEl.videoHeight) * drawH;
                    } else {
                      // 像素坐标：直接转换为录制画布显示坐标
                      canvasX = offsetX + (x / videoEl.videoWidth) * drawW;
                      canvasY = offsetY + (y / videoEl.videoHeight) * drawH;
                    }
                    
                    // 绘制关键点（红色圆圈，更大更明显，带白色边框）
                    recordCtx.fillStyle = 'rgba(255, 0, 0, 1)';
                    recordCtx.strokeStyle = 'rgba(255, 255, 255, 1)';
                    recordCtx.lineWidth = 2;
                    recordCtx.beginPath();
                    recordCtx.arc(canvasX, canvasY, 6, 0, 2 * Math.PI);
                    recordCtx.fill();
                    recordCtx.stroke();
                  });
                  
                  // 绘制连接线（绿色，更粗更明显）
                  recordCtx.strokeStyle = 'rgba(0, 255, 0, 1)';
                  recordCtx.lineWidth = 3;
                  recordCtx.fillStyle = 'transparent';
                  
                  const connections = [
                    [0, 1], [1, 2], [2, 3], [3, 4], // 拇指
                    [0, 5], [5, 6], [6, 7], [7, 8], // 食指
                    [0, 9], [9, 10], [10, 11], [11, 12], // 中指
                    [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
                    [0, 17], [17, 18], [18, 19], [19, 20], // 小指
                  ];
                  
                  connections.forEach(([start, end]) => {
                    if (!recordCtx || !points[start] || !points[end]) return;
                    
                    const startPoint = points[start];
                    const endPoint = points[end];
                    
                    // 处理起点坐标
                    let startX: number;
                    let startY: number;
                    
                    if (Array.isArray(startPoint)) {
                      startX = startPoint[0] || 0;
                      startY = startPoint[1] || 0;
                    } else if (typeof startPoint === 'object' && startPoint !== null) {
                      startX = startPoint.x || 0;
                      startY = startPoint.y || 0;
                    } else {
                      return;
                    }
                    
                    let canvasStartX: number;
                    let canvasStartY: number;
                    
                    if (startX >= 0 && startX <= 1 && startY >= 0 && startY <= 1) {
                      // 归一化坐标：先转换为视频像素坐标，再转换为录制画布显示坐标
                      const videoStartX = startX * videoEl.videoWidth;
                      const videoStartY = startY * videoEl.videoHeight;
                      canvasStartX = offsetX + (videoStartX / videoEl.videoWidth) * drawW;
                      canvasStartY = offsetY + (videoStartY / videoEl.videoHeight) * drawH;
                    } else {
                      // 像素坐标：直接转换为录制画布显示坐标
                      canvasStartX = offsetX + (startX / videoEl.videoWidth) * drawW;
                      canvasStartY = offsetY + (startY / videoEl.videoHeight) * drawH;
                    }
                    
                    // 处理终点坐标
                    let endX: number;
                    let endY: number;
                    
                    if (Array.isArray(endPoint)) {
                      endX = endPoint[0] || 0;
                      endY = endPoint[1] || 0;
                    } else if (typeof endPoint === 'object' && endPoint !== null) {
                      endX = endPoint.x || 0;
                      endY = endPoint.y || 0;
                    } else {
                      return;
                    }
                    
                    let canvasEndX: number;
                    let canvasEndY: number;
                    
                    if (endX >= 0 && endX <= 1 && endY >= 0 && endY <= 1) {
                      // 归一化坐标：先转换为视频像素坐标，再转换为录制画布显示坐标
                      const videoEndX = endX * videoEl.videoWidth;
                      const videoEndY = endY * videoEl.videoHeight;
                      canvasEndX = offsetX + (videoEndX / videoEl.videoWidth) * drawW;
                      canvasEndY = offsetY + (videoEndY / videoEl.videoHeight) * drawH;
                    } else {
                      // 像素坐标：直接转换为录制画布显示坐标
                      canvasEndX = offsetX + (endX / videoEl.videoWidth) * drawW;
                      canvasEndY = offsetY + (endY / videoEl.videoHeight) * drawH;
                    }
                    
                    // 绘制连接线
                    recordCtx.beginPath();
                    recordCtx.moveTo(canvasStartX, canvasStartY);
                    recordCtx.lineTo(canvasEndX, canvasEndY);
                    recordCtx.stroke();
                  });
                }
              });
            }
          }
        }

        // MediaPipe Hands 检测（在 draw 循环中直接调用 send）
        if (isHandPoseReady && handsSolution && typeof handsSolution.send === 'function' && video && video.elt) {
          const videoEl = video.elt as HTMLVideoElement;
          if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            // 每 3 帧调用一次，避免过于频繁
            if (p.frameCount % 3 === 0) {
              try {
                handsSolution.send({ image: videoEl }).catch((err: any) => {
                  // 静默处理错误
                  if (p.frameCount % 180 === 0) {
                    console.warn('⚠️ handsSolution.send 失败:', err);
                  }
                });
              } catch (error) {
                // 静默处理错误
                if (p.frameCount % 180 === 0) {
                  console.warn('⚠️ handsSolution.send 异常:', error);
                }
              }
            }
          }
        }
      }
    };
  }, containerRef.current!);

  return sketch;
}

