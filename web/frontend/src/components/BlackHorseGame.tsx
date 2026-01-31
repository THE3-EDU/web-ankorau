import React, { useState, useCallback, useRef, useEffect } from 'react';
import { P5Sketch } from './P5Sketch';
import { StartScreen } from './StartScreen';
import { LoadingScreen } from './LoadingScreen';
import { WeChatWarningScreen } from './WeChatWarningScreen';
import '../App.css';

// 检测是否是 iOS 微信浏览器
const isIOSWeChat = () => {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isWeChat = /MicroMessenger/.test(ua);
  return isIOS && isWeChat;
};

export const BlackHorseGame = () => {
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showWeChatWarning, setShowWeChatWarning] = useState(isIOSWeChat());
  const [showStartScreen, setShowStartScreen] = useState(!isIOSWeChat());
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [mediaPipeLoading, setMediaPipeLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasPreview, setHasPreview] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false); // 是否开启声音
  const resolution = 'high'; // 固定使用 1080x1440 分辨率

  // 初始化背景音频：默认静音，允许自动播放，循环
  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio) return;

    audio.loop = true;
    audio.volume = 0.0; // 默认静音
    audio.muted = true; // 允许自动播放

    // 尝试自动播放（被策略阻止则静默）
    audio.play().catch(() => {});

    return () => {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    };
  }, []);

  // 用户选择声音后，更新音频状态
  const handleSoundChoice = useCallback(async (enable: boolean) => {
    setSoundEnabled(enable);
    const audio = bgAudioRef.current;
    if (audio) {
      if (enable) {
        audio.muted = false;
        audio.volume = 1.0;
        audio.loop = true;
        try {
          await audio.play();
        } catch {
          // 如果被策略阻止，等待后续用户交互
        }
      } else {
        audio.muted = true;
        audio.volume = 0.0;
      }
    }
  }, []);

  const handleLoadingChange = useCallback((isLoading: boolean) => {
    // console.log('Loading state changed:', isLoading);
    setLoading(isLoading);
  }, []);

  const handleStart = useCallback(() => {
    setShowStartScreen(false);
    setShowLoadingScreen(true);
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setShowLoadingScreen(false);
    // 进入主界面后关闭背景音频
    const audio = bgAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const handleMediaPipeLoadingChange = useCallback((isLoading: boolean) => {
    setMediaPipeLoading(isLoading);
  }, []);

  const handleRestart = useCallback(() => {
    // 重置到起始页
    setShowStartScreen(true);
    setShowLoadingScreen(false);
    setMediaPipeLoading(true);
    setLoading(true);
    setHasPreview(false);
    setSoundEnabled(false);
    const audio = bgAudioRef.current;
    if (audio) {
      audio.muted = true;
      audio.volume = 0.0;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, []);

  const handlePreviewChange = useCallback((hasPreview: boolean) => {
    setHasPreview(hasPreview);
  }, []);

  // 背景音频：贯穿整个应用生命周期，始终存在（简单循环）
  const audioElements = (
    <audio
      ref={bgAudioRef}
      src={`${process.env.PUBLIC_URL}/Images/bg.mp3`}
      preload="auto"
      loop
      style={{ display: 'none' }}
    />
  );

  // 显示 iOS 微信警告页面
  if (showWeChatWarning) {
    return <WeChatWarningScreen />;
  }

  // 显示起始页面
  if (showStartScreen) {
    return (
      <div 
        className="App"
        style={{
          backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
        }}
      >
        {audioElements}
        <StartScreen onStart={handleStart} onSoundChoice={handleSoundChoice} />
      </div>
    );
  }

  // 显示Loading页面
  if (showLoadingScreen) {
    return (
      <div 
        className="App"
        style={{
          backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
        }}
      >
        {audioElements}
        <LoadingScreen 
          onComplete={handleLoadingComplete}
          mediaPipeLoading={mediaPipeLoading}
        />
        {/* 在后台初始化P5Sketch，用于加载MediaPipe */}
        <P5Sketch 
          onLoadingChange={handleLoadingChange} 
          onMediaPipeLoadingChange={handleMediaPipeLoadingChange}
          resolution={resolution}
          onRestart={handleRestart}
          onPreviewChange={handlePreviewChange}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  // 显示主应用
  return (
    <div 
      className="App"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
      }}
    >
      {audioElements}
      {/* {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">加载中...</div>
        </div>
      )} */}
      {/* 右上角图片 - 放在页面级别，有预览时隐藏 */}
      {/* {!hasPreview && (
        <img 
          src={`${process.env.PUBLIC_URL}/Images/logo.webp`}
          alt="Logo"
          className="logo-image"
        />
      )} */}
      {/* 右上角图片 - 放在页面级别，有预览时隐藏 */}
      {!hasPreview && (
        <img 
          src={`${process.env.PUBLIC_URL}/Images/hourse.webp`}
          alt="Hourse"
          className="hourse-image"
        />
      )}
      <P5Sketch 
        onLoadingChange={handleLoadingChange} 
        onMediaPipeLoadingChange={handleMediaPipeLoadingChange}
        resolution={resolution}
        onRestart={handleRestart}
        onPreviewChange={handlePreviewChange}
      />
      {/* 底部版权信息 - 放在页面级别，不受p5画板位置影响 */}
      <div className="p5-sketch-footer">
        Produced by THE3.STUDIO
      </div>
    </div>
  );
};

export default BlackHorseGame;

