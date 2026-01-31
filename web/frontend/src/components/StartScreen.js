import React, { useCallback, useState } from 'react';
import './StartScreen.css';

export const StartScreen = ({ onStart, onSoundChoice }) => {
  const [showSoundPrompt, setShowSoundPrompt] = useState(true);

  const startWithSoundChoice = useCallback(
    async (enable) => {
      // 将选择告诉父组件，由父级统一控制音频播放（跨 Start/Loading）
      if (onSoundChoice) {
        onSoundChoice(enable);
      }
      // 关闭弹窗，等待用户点击开始
      setShowSoundPrompt(false);
    },
    [onSoundChoice]
  );

  const handleStart = async () => {
    // 若尚未选择声音策略，先弹选择，不立刻开始
    if (showSoundPrompt) {
      return;
    }
    if (onStart) {
      onStart();
    }
  };

  return (
    <div 
      className="start-screen"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
      }}
      onClick={showSoundPrompt ? undefined : handleStart}
    >
      <div className="start-screen-content">
        {/* 主视频 */}
        <div className="start-screen-image-container">
          <video 
            src="/Images/bg.webm" 
            className="start-screen-image"
            autoPlay
            loop
            muted
            playsInline
          />
        </div>

        {/* 声音选择弹窗 */}
        {showSoundPrompt && (
          <div className="sound-modal">
            <div className="sound-modal-backdrop" />
            <div 
              className="sound-modal-card"
              style={{
                backgroundImage: `url(${process.env.PUBLIC_URL}/Images/loading_bg.png)`
              }}
            >
              <div className="sound-prompt-text">是否开启声音？</div>
              <div className="sound-prompt-actions">
                <button className="sound-btn sound-btn-on" onClick={() => startWithSoundChoice(true)}>
                  开启声音
                </button>
                <button className="sound-btn sound-btn-off" onClick={() => startWithSoundChoice(false)}>
                  静音开始
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 点击提示文字 */}
        <div className="start-hint">
          点击屏幕开始
        </div>
        
        {/* 底部版权信息 */}
        <div className="start-screen-footer">
          Produced by THE3.STUDIO
        </div>
      </div>
    </div>
  );
};

export default StartScreen;

