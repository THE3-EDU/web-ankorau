import React, { useState, useEffect, useRef } from 'react';
import './LoadingScreen.css';

export const LoadingScreen = ({ onComplete, mediaPipeLoading = false }) => {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const timerRef = useRef(null);

  // 在 loading 时预加载音频权限和音频流
  useEffect(() => {
    const requestAudioPermission = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          // 请求音频权限并获取音频流
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // 保存到全局变量，供录制时使用
          window.preloadedAudioStream = stream;
          console.log('[LoadingScreen] 音频权限已获取，音频流已预加载');
          // 注意：不停止音频流，保持活跃状态，录制时直接使用
        } catch (audioError) {
          console.warn('[LoadingScreen] 获取音频权限失败:', audioError);
          // 如果用户拒绝或出错，不设置全局变量，录制时将只录制视频
          window.preloadedAudioStream = null;
        }
      } else {
        console.warn('[LoadingScreen] 浏览器不支持 getUserMedia');
        window.preloadedAudioStream = null;
      }
    };

    // 延迟一点再请求，避免与 GIF 加载冲突
    const timer = setTimeout(() => {
      requestAudioPermission();
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    // 清除之前的定时器
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const updateProgress = () => {
      if (mediaPipeLoading) {
        // MediaPipe还在加载时，进度条慢慢增长到90%
        if (progressRef.current < 90) {
          progressRef.current = Math.min(progressRef.current + 0.3, 90);
          setProgress(Math.floor(progressRef.current));
        }
      } else {
        // MediaPipe加载完成后，进度条快速增长到100%
        if (progressRef.current < 100) {
          progressRef.current = Math.min(progressRef.current + 2, 100);
          setProgress(Math.floor(progressRef.current));
          
          if (progressRef.current >= 100) {
            clearInterval(timerRef.current);
            // 延迟一点时间再触发完成，让用户看到100%
            setTimeout(() => {
              if (onComplete) {
                onComplete();
              }
            }, 500);
          }
        }
      }
    };

    // 每100ms更新一次进度
    timerRef.current = setInterval(updateProgress, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [mediaPipeLoading, onComplete]);

  return (
    <div 
      className="loading-screen"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
      }}
    >
      <div className="loading-screen-content">
        {/* 中间图片 */}
        <div className="loading-image-container">
          <img 
            src={`${process.env.PUBLIC_URL}/Images/loading.webp`}
            alt="Loading" 
            className="loading-image"
          />
        </div>
        
        {/* 百分比显示 */}
        <div className="loading-percentage">
          {progress}%
        </div>
        
        <p className="loading-text">
          黑马疯狂加载中....马上就来!<br/>
          注意使用浏览器打开
        </p>
        
        {/* 底部版权信息 */}
        <div className="loading-screen-footer">
          Produced by THE3.STUDIO
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;

