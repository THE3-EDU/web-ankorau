import React, { useState } from 'react';

export const ResolutionSelector = ({ onSelect }) => {
  const handleSelect = (resolution) => {
    onSelect(resolution, true); // MediaPipe 默认开启，在识别页面可以切换
  };

  return (
    <div className="resolution-selector">
      <div className="resolution-selector-content">
        <h2 className="resolution-title">选择分辨率</h2>
        <p className="resolution-subtitle">请根据您的设备性能选择合适的分辨率</p>
        
        <div className="resolution-buttons">
          <button
            className="resolution-button resolution-button-high"
            onClick={() => handleSelect('high')}
          >
            <div className="resolution-button-title">高清模式</div>
            <div className="resolution-button-desc">1080 × 1440</div>
            <div className="resolution-button-hint">推荐：高性能设备</div>
          </button>
          
          <button
            className="resolution-button resolution-button-low"
            onClick={() => handleSelect('low')}
          >
            <div className="resolution-button-title">流畅模式</div>
            <div className="resolution-button-desc">720 × 960</div>
            <div className="resolution-button-hint">推荐：低端设备</div>
          </button>
        </div>

      </div>
    </div>
  );
};


