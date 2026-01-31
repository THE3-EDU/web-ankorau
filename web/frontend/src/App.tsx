import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BlackHorseGame } from './components/BlackHorseGame';
import './App.css';

function App() {
  // 获取 GitHub Pages 的 base path
  // 如果部署在子路径下，需要设置 basename
  const basename = process.env.PUBLIC_URL || '';
  
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        {/* 首页重定向到游戏页面 */}
        <Route path="/" element={<Navigate to="/game/2026/blackhorse" replace />} />
        {/* 游戏页面 */}
        <Route path="/game/2026/blackhorse" element={<BlackHorseGame />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
