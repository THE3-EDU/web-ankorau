import { useState, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://ankorau0.com/api';

export const useVideoUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadToOSS = useCallback(async (
    blob: Blob, 
    fileName: string, 
    onProgress?: (progress: number) => void
  ): Promise<{ url: string; key: string }> => {
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
            onProgress?.(progress);
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
                  key: response.key || fileName
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
        
        xhr.open('POST', `${BACKEND_URL}/upload-to-oss`);
        xhr.send(formData);
      });
    } catch (error) {
      setIsUploading(false);
      console.error('Error uploading to OSS:', error);
      throw error;
    }
  }, []);

  const resetUploadProgress = useCallback(() => {
    setUploadProgress(0);
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadToOSS,
    resetUploadProgress,
  };
};

