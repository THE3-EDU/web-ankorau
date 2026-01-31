// requestIdleCallback 兼容性处理
// 如果浏览器不支持 requestIdleCallback，使用 setTimeout 模拟
export const requestIdleCallbackCompat = (callback: IdleRequestCallback, options?: IdleRequestOptions): number => {
  if (typeof window !== 'undefined' && (window as any).requestIdleCallback) {
    return (window as any).requestIdleCallback(callback, options);
  }
  // 使用更精确的条件检查，确保0值能被正确处理
  const timeout = options?.timeout !== undefined ? options.timeout : 0;
  return window.setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 5, // 模拟 5ms 剩余时间
    });
  }, timeout);
};

export const cancelIdleCallbackCompat = (handle: number): void => {
  if (typeof window !== 'undefined' && (window as any).cancelIdleCallback) {
    (window as any).cancelIdleCallback(handle);
  } else {
    window.clearTimeout(handle);
  }
};

