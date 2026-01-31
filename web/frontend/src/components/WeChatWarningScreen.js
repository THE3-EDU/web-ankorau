import React, { useState } from 'react';
import './WeChatWarningScreen.css';

export const WeChatWarningScreen = () => {
  const [showCopied, setShowCopied] = useState(false);

  const handleCopyUrl = async () => {
    const url = 'https://ankorau0.com/game/2026/blackhorse';
    try {
      // 使用 Clipboard API 复制网址
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // 降级方案：使用传统的复制方法
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      // 显示"已复制"提示
      setShowCopied(true);
      setTimeout(() => {
        setShowCopied(false);
      }, 2000); // 2秒后自动隐藏
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  return (
    <div 
      className="wechat-warning-screen"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/Images/bg.webp)`
      }}
      onClick={handleCopyUrl}
    >
      <div className="wechat-warning-content">
        {/* 浏览器 Logo */}
        <div className="wechat-warning-browser-logo">
          <img 
            src={`${process.env.PUBLIC_URL}/Images/weblogo.png`}
            alt="Browser Logo"
            className="browser-logo-image"
          />
        </div>
        
        {/* 提示文字 - 放在 logo 下面 */}
        <div className="wechat-warning-text">
          <div>https://ankorau0.com/game/2026/blackhorse</div>
          <div>点击<span className="copy-text">复制网址</span>并在浏览器打开</div>
          <div>小马们等你</div>
        </div>
      </div>
      
      {/* 已复制提示弹框 */}
      {showCopied && (
        <div className="copied-toast">
          链接已复制
        </div>
      )}
    </div>
  );
};

export default WeChatWarningScreen;

