import { useState, useCallback } from 'react';

const FC_FUNCTION_URL = process.env.REACT_APP_FC_FUNCTION_URL || 'https://test-sdcdvaytub.cn-hangzhou.fcapp.run';

export const useFCProcessing = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState<number | null>(null);

  const processVideoWithFC = useCallback(async (ossVideoKey: string): Promise<string> => {
    try {
      setIsProcessing(true);
      setProcessingTime(0);
      
      const startTime = Date.now();
      
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
        
        console.log('FC request URL:', FC_FUNCTION_URL);
        console.log('FC request body:', requestBody);
        
        const response = await fetch(FC_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        console.log('FC response status:', response.status, response.statusText);
        console.log('FC response headers:', Object.fromEntries(response.headers.entries()));
        
        // 获取响应文本（先不解析，看看原始内容）
        const responseText = await response.text();
        console.log('FC response raw text:', responseText);
        
        if (!response.ok) {
          console.error('FC function failed, status:', response.status);
          console.error('FC function failed, response text:', responseText);
          throw new Error(`FC function failed: ${response.status} - ${responseText}`);
        }
        
        // 尝试解析 JSON
        let result;
        try {
          result = JSON.parse(responseText);
          console.log('FC response parsed JSON:', result);
        } catch (parseError) {
          console.error('Failed to parse FC response as JSON:', parseError);
          console.error('Response text:', responseText);
          throw new Error(`FC response is not valid JSON: ${responseText}`);
        }
        
        const processingTime = Math.round((Date.now() - startTime) / 1000);
        setProcessingTime(processingTime);
        
        // 检查多种可能的响应格式（根据 Postman 测试的实际响应格式调整）
        // 优先使用 finalVideoUrl（FC 返回的格式）
        const outputUrl = result.finalVideoUrl || result.outputUrl || result.url || result.videoUrl || result.output || result.data?.url || result.data?.outputUrl;
        const success = result.success !== false; // 默认为 true，除非明确为 false
        
        if (outputUrl) {
          setIsProcessing(false);
          console.log('FC processing completed, output URL:', outputUrl);
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
      setIsProcessing(false);
      console.error('Error processing video with FC:', error);
      throw error;
    }
  }, []);

  return {
    isProcessing,
    processingTime,
    processVideoWithFC,
  };
};

