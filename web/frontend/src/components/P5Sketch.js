import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createP5Sketch } from './p5Sketch/createP5Sketch';

export const P5Sketch = ({ onLoadingChange, resolution = 'high', enableMediaPipe: initialEnableMediaPipe = true, onMediaPipeLoadingChange, onPreviewChange, onRestart, ...props }) => {
  const containerRef = useRef(null);
  const sketchRef = useRef(null);
  const takePhotoRef = useRef(null);
  const startRecordingRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const switchCameraRef = useRef(null);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [enableMediaPipe, setEnableMediaPipe] = useState(initialEnableMediaPipe);
  const enableMediaPipeRef = useRef(enableMediaPipe);
  const onLoadingChangeRef = useRef(onLoadingChange); // 使用 ref 存储 onLoadingChange，避免重复初始化

  const pressStartTimeRef = useRef(0);
  const pressTimerRef = useRef(null);
  const LONG_PRESS_MS = 400;
  const isLongPressRef = useRef(false);
  const isProcessingRef = useRef(false); // 使用 ref 存储 isProcessing，避免闭包问题

  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewIsMp4, setPreviewIsMp4] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingTime, setProcessingTime] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0); // 处理进度 0-1
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false); // 跟踪是否正在长按
  const [canvasStopped, setCanvasStopped] = useState(false);
  const [videoStopped, setVideoStopped] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedVideoUrl, setProcessedVideoUrl] = useState(null);
  const [isLongPressingVideo, setIsLongPressingVideo] = useState(false); // 视频长按状态
  const videoLongPressTimerRef = useRef(null); // 视频长按定时器
  const [isSaving, setIsSaving] = useState(false); // 保存中状态
  const [showSaveSuccess, setShowSaveSuccess] = useState(false); // 显示保存成功提示
  const [showError, setShowError] = useState(false); // 显示错误页面
  const [mediaPipeLoading, setMediaPipeLoading] = useState(true); // MediaPipe 加载状态
  
  const elapsedTimerRef = useRef(null);
  const canvasChunksRef = useRef([]);
  const videoChunksRef = useRef([]);
  const longPressTimerRef = useRef(null);
  const canvasRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const handDetectionIntervalRef = useRef(null);
  const handPoseWorkerRef = useRef(null);
  const uploadToOSSRef = useRef(null);
  const processVideoWithFCRef = useRef(null);
  
  // 后端API配置
  // 前后端合并后，使用相对路径（与 Flask 在同一服务器）
  const BACKEND_URL = "https://ankorau0.com/api";
  const FC_FUNCTION_URL = 'https://test-ucbxwkwvtz.cn-hangzhou.fcapp.run';
  
  // 重置上传进度
  const resetUploadProgress = useCallback(() => {
    setUploadProgress(0);
  }, []);

  // 处理错误的通用函数
  const handleError = useCallback((error, message) => {
    console.error(message, error);
    setIsProcessing(false);
    // 可以在这里添加用户通知
  }, []);
  
  // 事件处理函数定义
  const handlePressStart = useCallback(() => {
    // 如果正在上传或处理，不允许操作
    if (isUploading || isProcessing) {
      return;
    }
    try {
      // 记录按压开始时间
      pressStartTimeRef.current = Date.now();
      
      // 清理可能存在的旧定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      setIsLongPressing(false);
      isLongPressRef.current = false;
      
      // 设置长按检测定时器
      longPressTimerRef.current = setTimeout(() => {
        try {
          setIsLongPressing(true);
          isLongPressRef.current = true;
          // 如果是长按，开始录制视频
          if (typeof startRecordingRef.current === 'function') {
            console.log('Starting recording on long press');
            try {
              startRecordingRef.current();
            } catch (recordingError) {
              console.error('Error starting recording:', recordingError);
              setIsLongPressing(false);
              isLongPressRef.current = false;
            }
          } else {
            console.warn('startRecordingRef.current is not a function:', startRecordingRef.current);
          }
        } catch (error) {
          console.error('长按处理出错:', error);
          setIsLongPressing(false);
          isLongPressRef.current = false;
        }
      }, LONG_PRESS_MS);
    } catch (error) {
      console.error('开始按压处理出错:', error);
      // 清理定时器防止资源泄漏
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, [isUploading, isProcessing]);
  
  const handlePressEnd = useCallback(() => {
    // 如果正在上传或处理，不允许操作
    if (isUploading || isProcessing) {
      return;
    }
    try {
      // 清理长按定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      // 检查是否正在录制（通过isLongPressing状态或isLongPressRef）
      const wasRecording = isLongPressing || isLongPressRef.current;
      
      console.log('[按钮] 松开按钮，状态检查:', {
        isLongPressing,
        isLongPressRef: isLongPressRef.current,
        wasRecording,
        hasStopRecording: typeof stopRecordingRef.current === 'function',
        hasTakePhoto: typeof takePhotoRef.current === 'function'
      });
      
      if (wasRecording && typeof stopRecordingRef.current === 'function') {
        // 如果是长按后松开，停止视频录制
        console.log('[按钮] 停止录制');
        stopRecordingRef.current();
        setIsLongPressing(false);
        isLongPressRef.current = false;
      } else if (!wasRecording && typeof takePhotoRef.current === 'function') {
        // 如果是短按，拍摄照片
        console.log('[按钮] 拍摄照片');
        takePhotoRef.current();
      } else {
        console.warn('[按钮] 未执行任何操作，状态:', {
          wasRecording,
          hasStopRecording: typeof stopRecordingRef.current === 'function',
          hasTakePhoto: typeof takePhotoRef.current === 'function'
        });
      }
    } catch (error) {
      console.error('结束按压处理出错:', error);
      // 清理状态
      setIsLongPressing(false);
      isLongPressRef.current = false;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, [isLongPressing]);
  
  const handlePressCancel = useCallback(() => {
    // 如果正在上传或处理，不允许操作
    if (isUploading || isProcessing) {
      return;
    }
    try {
      // 清理长按定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      setIsLongPressing(false);
      isLongPressRef.current = false;
    } catch (error) {
      console.error('取消按压处理出错:', error);
    }
  }, [isUploading, isProcessing]);
  
  const handleDownload = useCallback(async () => {
    if (isSaving) {
      return; // 如果正在保存，直接返回
    }
    
    try {
      setIsSaving(true); // 开始保存
      
      if (!previewUrl) {
        console.warn('预览URL不存在，无法下载');
        setIsSaving(false);
        return;
      }
      
      // 检测设备类型
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      const isIPad = /iPad/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isMac = /Macintosh|MacIntel|Mac OS X/.test(navigator.userAgent) && !isIPad;
      const isIOSOrIPadOrMac = isIOS || isIPad || isMac;
      const isSecureContext = window.isSecureContext || window.location.protocol === 'https:';
      const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge|Edg|OPR/.test(navigator.userAgent);
      
      console.log('[保存] 设备信息:', {
        isIOS,
        isAndroid,
        isIPad,
        isMac,
        isIOSOrIPadOrMac,
        isChrome,
        isSecureContext,
        hasNavigatorShare: !!navigator.share,
        hasNavigatorCanShare: !!navigator.canShare,
        userAgent: navigator.userAgent
      });
      
      // 获取视频/图片 blob
      let blob;
      if (previewUrl.startsWith('blob:')) {
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`下载文件失败: ${response.status}`);
        }
        blob = await response.blob();
      } else {
        // 如果是远程URL，先下载
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`下载文件失败: ${response.status}`);
        }
        blob = await response.blob();
      }
      
      // console.log('[保存] Blob 信息:', {
      //   size: blob.size,
      //   type: blob.type,
      //   sizeMB: (blob.size / 1024 / 1024).toFixed(2)
      // });
      
      const filename = previewIsMp4 
        ? `recording-${Date.now()}.mp4` 
        : `capture-${Date.now()}.jpg`;
      
      // iOS/iPad/Mac 优先使用 Web Share API
      // 对于 iOS/iPad/Mac 设备，优先使用 Web Share API，可以直接保存到相册
      if (isIOSOrIPadOrMac && navigator.share) {
        // console.log('[保存] iOS/iPad/Mac 设备，优先使用 Web Share API...');
        try {
          const file = new File([blob], filename, { type: blob.type });
          
          // 检查是否支持分享文件
          if (navigator.canShare) {
            const canShareFiles = navigator.canShare({ files: [file] });
            // console.log('[保存] canShare 检查结果:', canShareFiles);
            
            if (canShareFiles) {
              // console.log('[保存] 使用 Web Share API 分享文件（可直接保存到相册）...');
              setIsSaving(false);
              await navigator.share({
                title: '安高若视频',
                text: previewIsMp4 ? '保存视频到相册' : '保存图片到相册',
                files: [file],
              });
              // console.log('✅ 已通过 Web Share API 保存到相册');
              setShowSaveSuccess(true);
              return;
            } else {
              // console.warn('[保存] 设备不支持分享文件，尝试其他方式...');
            }
          } else {
            // 没有 canShare，直接尝试分享（某些旧版浏览器）
            // console.log('[保存] 没有 canShare 方法，直接尝试分享...');
            try {
              setIsSaving(false);
              await navigator.share({
                title: '安高若视频',
                text: previewIsMp4 ? '保存视频到相册' : '保存图片到相册',
                files: [file],
              });
              // console.log('✅ 已通过 Web Share API 保存到相册');
              setShowSaveSuccess(true);
              return;
            } catch (directShareError) {
              // console.warn('[保存] 直接分享失败:', directShareError);
              // 如果是用户取消，不需要降级
              if (directShareError.name === 'AbortError') {
                setIsSaving(false);
                return;
              }
            }
          }
        } catch (shareError) {
          // console.warn('[保存] Web Share API 失败:', shareError);
          // 如果是用户取消，不需要降级
          if (shareError.name === 'AbortError') {
            setIsSaving(false);
            return;
          }
          // 非用户取消的错误，继续使用下载方式
        }
      }
      
      // iPad 特殊处理：对于图片，使用长按保存的方式（仅当 Web Share API 不可用时）
      // 对于视频，iPad 需要通过 Web Share API 或下载后手动保存
      if (isIPad && !previewIsMp4 && !navigator.share) {
        // iPad 图片：创建一个可长按保存的图片元素
        // console.log('[保存] iPad 图片：使用长按保存方式...');
        try {
          const img = document.createElement('img');
          img.src = previewUrl;
          img.style.position = 'fixed';
          img.style.top = '50%';
          img.style.left = '50%';
          img.style.transform = 'translate(-50%, -50%)';
          img.style.maxWidth = '90vw';
          img.style.maxHeight = '90vh';
          img.style.zIndex = '10000';
          img.style.border = '2px solid #fff';
          img.style.borderRadius = '8px';
          img.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
          img.style.cursor = 'pointer';
          
          // 添加点击关闭
          const closeHandler = () => {
            document.body.removeChild(img);
            setIsSaving(false);
          };
          img.addEventListener('click', closeHandler);
          
          document.body.appendChild(img);
          
          // 5秒后移除临时图片，显示保存成功提示（不自动关闭）
          setTimeout(() => {
            if (document.body.contains(img)) {
              document.body.removeChild(img);
            }
            setIsSaving(false);
            setShowSaveSuccess(true);
          }, 5000);
          
          return;
        } catch (imgError) {
          console.warn('[保存] iPad 图片保存方式失败:', imgError);
        }
      }
      
      // 其他设备或 Web Share API 不可用时，使用 Web Share API（如果支持）
      if (navigator.share) {
        try {
          const file = new File([blob], filename, { type: blob.type });
          
          // 检查是否支持分享文件
          if (navigator.canShare) {
            const canShareFiles = navigator.canShare({ files: [file] });
            console.log('[保存] canShare 检查结果:', canShareFiles, '设备:', isIPad ? 'iPad' : isAndroid ? 'Android' : '其他');
            
            if (canShareFiles) {
              console.log('[保存] 尝试使用 Web Share API 分享文件（iPad/安卓端可直接保存到相册）...');
              // 分享界面即将弹出，先恢复按钮状态
              setIsSaving(false);
              // 调用分享 API（会弹出分享界面，iPad/安卓端可以选择"保存到相册"）
              await navigator.share({
                title: '安高若视频',
                text: isIPad ? '保存到相册' : '保存视频到相册',
                files: [file],
              });
              console.log('✅ 已通过分享API保存到相册');
              // 显示保存成功提示（不自动关闭，点击后关闭）
              setShowSaveSuccess(true);
              return;
            } else {
              console.warn('[保存] 设备不支持分享文件，尝试其他方式...');
              // iPad iOS 13 及以下不支持 files，需要其他方式
              if (isIPad && previewIsMp4) {
                // iPad 视频：尝试分享 URL（虽然不理想，但可以引导用户）
                console.log('[保存] iPad 视频：尝试分享 URL...');
                try {
                  setIsSaving(false);
                  await navigator.share({
                    title: '安高若视频',
                    text: '请下载后，在"文件"应用中选择"存储到相册"',
                    url: previewUrl,
                  });
                  console.log('✅ 已分享链接');
                  setShowSaveSuccess(true);
                  // 不再自动关闭，点击后关闭
                  return;
                } catch (urlShareError) {
                  console.warn('[保存] iPad 分享 URL 失败:', urlShareError);
                }
              }
            }
          } else {
            // 没有 canShare，直接尝试分享（某些旧版浏览器）
            console.log('[保存] 没有 canShare 方法，直接尝试分享...');
            try {
              // 分享界面即将弹出，先恢复按钮状态
              setIsSaving(false);
              await navigator.share({
                title: '安高若视频',
                text: isIPad ? '保存到相册' : '保存视频到相册',
                files: [file],
              });
              console.log('✅ 已通过分享API保存到相册');
              // 显示保存成功提示（不自动关闭，点击后关闭）
              setShowSaveSuccess(true);
              return;
            } catch (directShareError) {
              console.warn('[保存] 直接分享失败:', directShareError);
              // 如果是用户取消，不需要降级
              if (directShareError.name === 'AbortError') {
                setIsSaving(false);
                return;
              }
            }
          }
        } catch (shareError) {
          // 如果分享失败，降级到下载方式
          console.warn('[保存] 分享API失败，错误详情:', {
            name: shareError.name,
            message: shareError.message,
            stack: shareError.stack
          });
          // 如果是用户取消分享，不需要降级
          if (shareError.name === 'AbortError') {
            setIsSaving(false);
            return;
          }
          // 非用户取消的错误，继续使用下载方式
        }
      } else {
        console.log('[保存] 设备不支持 Web Share API，使用下载方式');
      }
      
      // 降级方案：使用下载链接（移动端会提示保存位置）
      console.log('[保存] 使用下载方式...');
      downloadFile(blob, filename);
      
    } catch (error) {
      console.error('[保存] 下载处理出错:', error);
      // 最后降级：直接打开链接
      if (previewUrl) {
        window.open(previewUrl, '_blank');
      }
    }
  }, [previewUrl, previewIsMp4]);
  
  const downloadFile = useCallback((blob, filename) => {
    try {
      // 检测设备类型
      const isAndroid = /Android/.test(navigator.userAgent);
      const isIPad = /iPad/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge|Edg|OPR/.test(navigator.userAgent);
      
      // 创建 blob URL（如果传入的是 blob 对象）
      let url = previewUrl;
      if (blob) {
        url = URL.createObjectURL(blob);
      }
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || (previewIsMp4 
        ? `recording-${Date.now()}.mp4` 
        : `capture-${Date.now()}.jpg`);
      
      // 安卓端 Chrome：确保触发下载而不是打开
      // 对于视频文件，安卓 Chrome 会显示保存对话框，用户可以选择"保存到相册"
      if (isAndroid && isChrome) {
        // 安卓 Chrome：强制下载，用户可以在下载管理中选择"保存到相册"
        link.setAttribute('download', link.download);
        link.setAttribute('target', '_blank');
      }
      
      // iPad：对于视频，下载后需要用户在"文件"应用中手动保存到相册
      // 对于图片，应该已经通过长按方式处理了
      if (isIPad && previewIsMp4) {
        // iPad 视频下载：添加提示
        console.log('[保存] iPad 视频：下载后请在"文件"应用中选择"存储到相册"');
      }
      
      // 设置样式，确保链接不可见
      link.style.display = 'none';
      link.style.position = 'absolute';
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      
      // 延迟移除，确保点击事件完成
      setTimeout(() => {
        document.body.removeChild(link);
        // 如果是新创建的 blob URL，需要清理
        if (blob && url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url);
          } catch (revokeError) {
            console.warn('撤销URL失败:', revokeError);
          }
        }
      }, 200); // 移动端可能需要更长时间
      
      console.log('✅ 已触发下载', {
        isAndroid,
        isIPad,
        isChrome,
        filename: link.download,
        message: isIPad && previewIsMp4 
          ? 'iPad 视频：下载后请在"文件"应用中选择"存储到相册"'
          : isAndroid 
            ? '安卓端：请在下载提示中选择"保存到相册"' 
            : '移动端用户可以选择保存到相册'
      });
      
      // 显示保存成功提示（不自动关闭，点击后关闭）
      setTimeout(() => {
        setIsSaving(false);
        setShowSaveSuccess(true);
      }, 500);
    } catch (error) {
      console.error('下载方式失败:', error);
      setIsSaving(false);
      // 最后降级方案
      if (previewUrl) {
        window.open(previewUrl, '_blank');
      }
    }
  }, [previewUrl, previewIsMp4]);
  
  const handleClosePreview = useCallback(() => {
    try {
      // 清理预览URL
      if (previewUrl && previewUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (revokeError) {
          console.warn('撤销预览URL失败:', revokeError);
        }
      }
      
      // 清理长按定时器
      if (videoLongPressTimerRef.current) {
        clearTimeout(videoLongPressTimerRef.current);
        videoLongPressTimerRef.current = null;
      }
      
      // 重置所有状态
      setPreviewUrl(null);
      setPreviewIsMp4(false);
      setIsUploading(false);
      setIsProcessing(false);
      setProcessedVideoUrl(null);
      setUploadProgress(0);
      setProcessingTime(null);
      setProcessingProgress(0);
      setIsLongPressingVideo(false);
    } catch (error) {
      console.error('关闭预览处理出错:', error);
      // 即使出错也要尝试重置状态
      setPreviewUrl(null);
      setIsUploading(false);
      setIsProcessing(false);
      setIsLongPressingVideo(false);
    }
  }, [previewUrl]);

  // 通知父组件预览状态变化
  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange(!!previewUrl);
    }
  }, [previewUrl, onPreviewChange]);
  
  // 视频长按开始
  const handleVideoLongPressStart = useCallback(() => {
    // 清理可能存在的旧定时器
    if (videoLongPressTimerRef.current) {
      clearTimeout(videoLongPressTimerRef.current);
      videoLongPressTimerRef.current = null;
    }
    
    setIsLongPressingVideo(false);
    
    // 设置长按检测定时器（400ms）
    videoLongPressTimerRef.current = setTimeout(() => {
      setIsLongPressingVideo(true);
      // 触发保存
      handleDownload();
    }, 400);
  }, [handleDownload]);
  
  // 视频长按结束
  const handleVideoLongPressEnd = useCallback(() => {
    // 清理长按定时器
    if (videoLongPressTimerRef.current) {
      clearTimeout(videoLongPressTimerRef.current);
      videoLongPressTimerRef.current = null;
    }
    
    setIsLongPressingVideo(false);
  }, []);
  
  // 视频长按取消
  const handleVideoLongPressCancel = useCallback(() => {
    // 清理长按定时器
    if (videoLongPressTimerRef.current) {
      clearTimeout(videoLongPressTimerRef.current);
      videoLongPressTimerRef.current = null;
    }
    
    setIsLongPressingVideo(false);
  }, []);

  useEffect(() => {
    // 保存原始的 console.error
    const originalConsoleError = console.error;
    
    // 覆盖 console.error 以过滤 model.json 和 anchors.json 相关的错误
    console.error = (...args) => {
      const errorMessage = args.join(' ');
      // 过滤 model.json 和 anchors.json 相关的错误
      if (
        errorMessage.includes('model.json') ||
        errorMessage.includes('anchors.json') ||
        (errorMessage.includes('Failed to load resource') && (
          errorMessage.includes('model.json') ||
          errorMessage.includes('anchors.json')
        )) ||
        errorMessage.includes('网络连接已中断') ||
        (errorMessage.includes('Load failed') && (
          errorMessage.includes('model.json') ||
          errorMessage.includes('anchors.json')
        )) ||
        (args[0] && typeof args[0] === 'string' && (
          args[0].includes('model.json') ||
          args[0].includes('anchors.json')
        ))
      ) {
        // 静默忽略这些错误，不输出到控制台
        return;
      }
      // 其他错误正常输出（包括 CORS 错误，这些需要用户知道）
      originalConsoleError.apply(console, args);
    };
    
    // 全局错误处理，捕获未处理的错误，避免页面崩溃
    const handleError = (event) => {
      const message = event.message || '';
      const filename = event.filename || '';
      
      // 忽略外部脚本和模型文件加载失败的错误（包括 TensorFlow.js 和 MediaPipe 错误）
      if (message && (
        message.includes('infird.com') ||
        message.includes('ERR_CONNECTION_REFUSED') ||
        message.includes('Failed to fetch') ||
        message.includes('model.json') ||
        message.includes('anchors.json') ||
        message.includes('网络连接已中断') ||
        message.includes('Load failed') ||
        message.includes('hand_landmark') ||
        message.includes('hand_pose') ||
        message.includes('tfjs') ||
        message.includes('TensorFlow') ||
        message.includes('estimateHands') ||
        message.includes('MediaPipe') ||
        message.includes('mediapipe') ||
        message.includes('WASM') ||
        message.includes('Aborted') ||
        message.includes('Module.arguments')
      )) {
        event.preventDefault();
        return true;
      }
      
      // 忽略资源加载失败的错误（如 model.json、TensorFlow.js 模型文件、MediaPipe WASM）
      if (filename && (
        filename.includes('model.json') ||
        filename.includes('anchors.json') ||
        filename.includes('hand_landmark') ||
        filename.includes('hand_pose') ||
        filename.includes('.bin') ||
        filename.includes('.tflite') ||
        filename.includes('hands_solution') ||
        filename.includes('mediapipe') ||
        filename.includes('wasm')
      )) {
        event.preventDefault();
        return true;
      }
      
      // 其他错误正常处理
      return false;
    };

    const handleUnhandledRejection = (event) => {
      // 忽略外部脚本加载失败的 Promise rejection（包括 anchors.json、model.json 等模型文件）
      const reason = event.reason;
      const reasonStr = typeof reason === 'string' ? reason : (reason?.message || reason?.toString() || '');
      
      if (reason && (
        reasonStr.includes('infird.com') ||
        reasonStr.includes('ERR_CONNECTION_REFUSED') ||
        reasonStr.includes('Failed to fetch') ||
        reasonStr.includes('Load failed') ||
        reasonStr.includes('网络连接已中断') ||
        reasonStr.includes('anchors.json') ||
        reasonStr.includes('model.json') ||
        reasonStr.includes('hand_landmark') ||
        reasonStr.includes('hand_pose') ||
        reasonStr.includes('tfjs') ||
        reasonStr.includes('TensorFlow') ||
        reasonStr.includes('estimateHands') ||
        reasonStr.includes('MediaPipe') ||
        reasonStr.includes('mediapipe') ||
        reasonStr.includes('WASM') ||
        reasonStr.includes('Aborted') ||
        reasonStr.includes('Module.arguments') ||
        (reason instanceof TypeError && reason.message.includes('Failed to fetch')) ||
        (reason instanceof Error && (
          reason.message.includes('MediaPipe') ||
          reason.message.includes('WASM') ||
          reason.message.includes('Aborted')
        ))
      )) {
        event.preventDefault();
        // 静默处理，不打印警告，避免控制台噪音
        return;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // 在 body 上添加样式，防止下拉刷新（针对某些浏览器）
    const originalBodyStyle = document.body.style.cssText;
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'pan-y'; // 只允许垂直滚动，不允许下拉刷新

    // 更新 ref 的值
    onLoadingChangeRef.current = onLoadingChange;

    let mounted = true;
    let loadingTimeout = null;

    // 如果视频加载超时，也结束加载状态
    loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('Loading timeout, ending loading state');
        if (onLoadingChangeRef.current) {
          onLoadingChangeRef.current(false);
        }
      }
    }, 10000); // 10秒超时

    if (onLoadingChangeRef.current) {
      onLoadingChangeRef.current(true);
    }
    console.log('Starting p5 camera + capture sketch...');

    // 创建 p5.js sketch
    const sketchConfig = {
      containerRef,
      onLoadingChange: (isLoading) => {
        // 使用 ref 确保总是调用最新的函数
        if (onLoadingChangeRef.current) {
          onLoadingChangeRef.current(isLoading);
        }
      },
      onMediaPipeLoadingChange: (isLoading) => {
        setMediaPipeLoading(isLoading);
        // 如果外部有回调，也调用它
        if (onMediaPipeLoadingChange) {
          onMediaPipeLoadingChange(isLoading);
        }
      },
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
      resolution, // 传递分辨率选项
      enableMediaPipe, // 传递 MediaPipe 开关
    };

    const sketch = createP5Sketch(sketchConfig);
    
    // 保存 sketch 引用
    sketchRef.current = sketch;
    
    // 返回清理函数
    return () => {
      mounted = false;
      // 组件卸载时确保结束加载状态
      if (onLoadingChangeRef.current) {
        onLoadingChangeRef.current(false);
      }
      
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      
      // 恢复原始的 console.error
      console.error = originalConsoleError;
      
      // 移除事件监听器
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      
      // 恢复原始body样式
      document.body.style.cssText = originalBodyStyle;
      
      // 清理计时器
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
      }
      
      // 停止录制
      if (stopRecordingRef.current) {
        stopRecordingRef.current();
      }
      
      // 清理sketch
      if (sketchRef.current) {
        sketchRef.current.remove();
      }
      
        // 清理Worker
        if (handPoseWorkerRef.current) {
          handPoseWorkerRef.current.terminate();
          handPoseWorkerRef.current = null;
        }
      };
    }, [FC_FUNCTION_URL, resolution]); // 移除 enableMediaPipe 从依赖项，避免重新创建sketch导致gif位置重置

  // 上传到OSS（通过后端代理）
  const uploadToOSS = useCallback(async (blob, fileName, onProgress) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('video', blob, fileName);
      formData.append('fileName', fileName);
      
      // 使用XMLHttpRequest以支持上传进度
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = e.loaded / e.total;
            setUploadProgress(progress);
            if (onProgress) {
              onProgress(progress);
            }
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response.success && response.url) {
                setIsUploading(false);
                setUploadProgress(1);
                resolve({
                  url: response.url,
                  key: response.key || fileName // 如果后端返回了key，使用它；否则使用fileName
                });
              } else {
                throw new Error(response.error || 'Upload failed');
              }
            } catch (parseError) {
              setIsUploading(false);
              reject(new Error('Failed to parse upload response'));
            }
          } else {
            setIsUploading(false);
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          setIsUploading(false);
          reject(new Error('Upload request failed'));
        });
        
        // 确保URL格式正确
        const uploadUrl = BACKEND_URL 
          ? `${BACKEND_URL.replace(/\/$/, '')}/upload-to-oss`
          : '/upload-to-oss';
        console.log('[上传] 上传URL:', uploadUrl);
        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });
    } catch (error) {
      setIsUploading(false);
      console.error('Error uploading to OSS:', error);
      throw error;
    }
  }, [BACKEND_URL]);
  
  // 调用FC云函数处理视频
  const processVideoWithFC = useCallback(async (ossVideoKey) => {
    let progressInterval = null;
    try {
      // 开始处理，设置状态并启动进度模拟
      setIsProcessing(true);
      setProcessingProgress(0);
      
      const startTime = Date.now();
      
      // 启动处理进度定时器（模拟进度从60%到100%）
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // 假设处理需要15秒，模拟进度
        const estimatedProcessingTime = 15000; // 15秒
        const progress = Math.min(elapsed / estimatedProcessingTime, 1);
        setProcessingProgress(progress);
      }, 100); // 每100ms更新一次
      
      // 如果配置了FC函数URL，直接调用
      if (FC_FUNCTION_URL) {
        console.log('Calling FC function with:', {
          userVideoKey: ossVideoKey,
          template: 'default',
          preset: 'ultrafast'
        });
        
        const requestBody = {
          userVideoKey: ossVideoKey,
          template: 'default',
          preset: 'ultrafast'
        };
        
        // console.log('FC request URL:', FC_FUNCTION_URL);
        // console.log('FC request body:', requestBody);
        
        const response = await fetch(FC_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        // console.log('FC response status:', response.status, response.statusText);
        // console.log('FC response headers:', Object.fromEntries(response.headers.entries()));
        
        // 获取响应文本（先不解析，看看原始内容）
        const responseText = await response.text();
        console.log('FC response raw text:', responseText);
        
        if (!response.ok) {
          // console.error('FC function failed, status:', response.status);
          // console.error('FC function failed, response text:', responseText);
          throw new Error(`FC function failed: ${response.status} - ${responseText}`);
        }
        
        // 尝试解析 JSON
        let result;
        try {
          result = JSON.parse(responseText);
          console.log('FC response parsed JSON:', result);
        } catch (parseError) {
          // console.error('Failed to parse FC response as JSON:', parseError);
          console.error('Response text:', responseText);
          throw new Error(`FC response is not valid JSON: ${responseText}`);
        }
        
        // 检查多种可能的响应格式（根据 Postman 测试的实际响应格式调整）
        // 优先使用 finalVideoUrl（FC 返回的格式）
        let outputUrl = result.finalVideoUrl || result.outputUrl || result.url || result.videoUrl || result.output || result.data?.url || result.data?.outputUrl;
        const success = result.success !== false; // 默认为 true，除非明确为 false
        
        if (outputUrl) {
          // 清理URL中多余的 http://（修复格式错误的URL）
          // 例如：https://bucket.http://oss-cn-hangzhou.aliyuncs.com/... 
          // 应该变成：https://bucket.oss-cn-hangzhou.aliyuncs.com/...
          outputUrl = outputUrl.replace(/\.http:\/\//g, '.');
          outputUrl = outputUrl.replace(/http:\/\//g, 'https://'); // 确保使用 https
          
          // 清除进度定时器
          if (progressInterval) {
            clearInterval(progressInterval);
          }
          setIsProcessing(false);
          setProcessingProgress(1); // 设置为100%
          
          console.log('FC processing completed, output URL:', outputUrl);
          
          // 更新预览为处理后的视频
          setPreviewUrl(outputUrl);
          setPreviewIsMp4(true);
          
          return outputUrl;
        } else {
          console.error('FC response missing output URL. Full response:', result);
          // 如果响应中有其他有用信息，也显示出来
          throw new Error(result.error || result.message || result.msg || `Video processing failed: No output URL in response. Response: ${JSON.stringify(result)}`);
        }
      } else {
        throw new Error('FC_FUNCTION_URL is not configured');
      }
    } catch (error) {
      // 清除进度定时器（如果存在）
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIsProcessing(false);
      setProcessingProgress(0);
      console.error('Error processing video with FC:', error);
      // 显示错误页面
      setShowError(true);
      throw error;
    }
  }, [FC_FUNCTION_URL]);
  
  // 将上传函数保存到 ref，供 p5.js 内部使用
  useEffect(() => {
    uploadToOSSRef.current = uploadToOSS;
    processVideoWithFCRef.current = processVideoWithFC;
  }, [uploadToOSS, processVideoWithFC]);

  // 格式化时间函数
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p5-sketch-container" style={props?.style}>
      {/* 上传和处理视频的loading遮罩 */}
      {(isUploading || isProcessing) && (() => {
        // 计算综合进度
        let overallProgress = 0;
        if (isUploading) {
          // 上传阶段：0-60%
          overallProgress = uploadProgress * 60;
        } else if (isProcessing) {
          // 处理阶段：60-100%
          overallProgress = 60 + processingProgress * 40;
        }
        
        return (
          <div className="upload-overlay">
            <div className="upload-progress-container">
              <div className="upload-progress-bar">
                <div 
                  className="upload-progress-fill" 
                  style={{ 
                    width: `${Math.min(overallProgress, 100)}%` 
                  }}
                />
              </div>
              <div className="upload-progress-text">
                黑马加载中……
              </div>
            </div>
          </div>
        );
      })()}
      <div ref={containerRef} className="sketch-wrapper"></div>
      
      {/* p5画板下方的intro图片 - 预览时隐藏 */}
      {!previewUrl && (
        <img 
          src={`${process.env.PUBLIC_URL}/Images/intro.webp`}
          alt="Intro"
          className="intro-image"
        />
      )}
      
      <div className="controls">
        {/* 切换摄像头按钮 */}
        <button
          className="switch-camera-button"
          disabled={isUploading || isProcessing}
          onClick={async () => {
            if (switchCameraRef.current) {
              try {
                await switchCameraRef.current();
                setIsFrontCamera(!isFrontCamera);
              } catch (error) {
                console.error('切换摄像头失败:', error);
              }
            }
          }}
          title={isFrontCamera ? '切换到后置摄像头' : '切换到前置摄像头'}
        >
          <img 
            src={`${process.env.PUBLIC_URL}/Images/change.webp`}
            alt="切换摄像头"
            className="switch-camera-icon"
          />
        </button>
        
        {/* 录制倒计时显示在按钮上方 */}
        {isLongPressing && (
          <div className="recording-indicator">
            <div className="recording-time">{formatTime(elapsedTime)}</div>
          </div>
        )}
        
        <button 
          className={`capture-button ${isLongPressing ? 'recording' : ''}`}
          disabled={isUploading || isProcessing}
          onTouchStart={handlePressStart}
          onTouchEnd={handlePressEnd}
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressCancel}
        >
          <span className="capture-button-line1">长按录制</span>
          <span className="capture-button-line2">单击拍照</span>
        </button>
        
        {/* MediaPipe 开关按钮 */}
        <button
          className={`mediapipe-toggle-button ${enableMediaPipe ? 'active' : ''}`}
          disabled={isUploading || isProcessing}
          onClick={() => {
            const newValue = !enableMediaPipe;
            setEnableMediaPipe(newValue);
            enableMediaPipeRef.current = newValue;
            // 更新sketch内部的enableMediaPipe值，不重新创建sketch
            if (sketchRef.current && sketchRef.current.updateEnableMediaPipe) {
              sketchRef.current.updateEnableMediaPipe(newValue);
            }
          }}
          title={enableMediaPipe ? '关闭手势识别' : '启用手势识别'}
        >
          <span className="mediapipe-toggle-text">
            <span className="mediapipe-toggle-line1">手势</span>
            <span className="mediapipe-toggle-line2">识别</span>
          </span>
          <span className="mediapipe-toggle-slider"></span>
        </button>
      </div>
      
      {/* 预览界面 - 只在有 previewUrl 且不在处理中时显示 */}
      {(() => {
        // 如果没有 previewUrl，不显示
        if (!previewUrl) {
          return null;
        }
        
        // 判断是否是视频格式
        // 注意：图片的 blob URL 不包含 'image' 字符串，需要通过 previewIsMp4 来判断
        // 如果 previewIsMp4 明确为 false，则认为是图片；如果为 true 或 undefined，且 URL 包含视频特征，则认为是视频
        const isVideo = previewIsMp4 === true || 
                       previewUrl.includes('.mp4') || 
                       previewUrl.includes('.webm') ||
                       previewUrl.includes('video/') ||
                       (previewUrl.startsWith('blob:') && previewIsMp4 !== false && !previewUrl.includes('image'));
        
        // 显示预览 - 直接覆盖在p5画布上
        return (
          <div className="preview-overlay-canvas" onClick={handleClosePreview}>
            <div className="preview-content-canvas" onClick={(e) => e.stopPropagation()}>
              {isVideo ? (
              <video 
                src={previewUrl} 
                autoPlay 
                loop 
                controls
                className="preview-media"
                alt="Preview Video"
                onTouchStart={handleVideoLongPressStart}
                onTouchEnd={handleVideoLongPressEnd}
                onTouchCancel={handleVideoLongPressCancel}
                onMouseDown={handleVideoLongPressStart}
                onMouseUp={handleVideoLongPressEnd}
                onMouseLeave={handleVideoLongPressCancel}
              />
            ) : (
              <img 
                src={previewUrl} 
                alt="Preview Image" 
                className="preview-media"
              />
              )}
            
            {/* 长按提示 */}
            {isLongPressingVideo && (
              <div className="video-long-press-hint">
                正在保存到相册...
              </div>
            )}
            
            {/* 处理完成的视频 */}
            {processedVideoUrl && !isProcessing && (
              <div className="processed-video">
                <a 
                  href={processedVideoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="processed-link"
                >
                  查看处理后的视频
                </a>
              </div>
            )}
            
            <div className="preview-button-container">
              <button 
                className="download-button" 
                onClick={handleDownload}
                disabled={isSaving}
              >
                {isSaving && (
                  <span className="save-loading-spinner"></span>
                )}
                保存视频
              </button>
              
              <button 
                className="cancel-button" 
                onClick={handleClosePreview}
              >
                重新拍摄
              </button>
            </div>
            
            {/* 保存成功提示 - 显示save.png图片 */}
            {showSaveSuccess && (
              <div 
                className="save-success-overlay"
                onClick={() => {
                  setShowSaveSuccess(false);
                  // 重置所有状态
                  setPreviewUrl(null);
                  setPreviewIsMp4(false);
                  setProcessedVideoUrl(null);
                  setIsUploading(false);
                  setIsSaving(false);
                  // 调用回调回到起始页
                  if (onRestart) {
                    onRestart();
                  }
                }}
              >
                <img 
                  src={`${process.env.PUBLIC_URL}/Images/save.webp`}
                  alt="保存成功"
                  className="save-success-image"
                />
              </div>
            )}

            {/* 错误页面 - 显示bg.webp背景和error.png图片 */}
            {showError && (
              <div 
                className="error-overlay"
                style={{
                  backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
                }}
                onClick={() => {
                  setShowError(false);
                  // 重置所有状态
                  setPreviewUrl(null);
                  setPreviewIsMp4(false);
                  setProcessedVideoUrl(null);
                  setIsUploading(false);
                  setIsProcessing(false);
                  setProcessingProgress(0);
                  // 调用回调回到起始页
                  if (onRestart) {
                    onRestart();
                  }
                }}
              >
                <img 
                  src={`${process.env.PUBLIC_URL}/Images/error.png`}
                  alt="处理失败"
                  className="error-image"
                />
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default P5Sketch;


