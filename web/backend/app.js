const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const OSS = require('ali-oss');

const app = express();

// 环境变量配置
require('dotenv').config();

// 中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS 配置
const allowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://127.0.0.1:3000',
  'https://127.0.0.1:3000',
  'http://localhost:80',
  'https://api.the3studio.cn',
  '*' // 开发时可以允许所有来源，生产环境建议指定具体域名
];

app.use(cors({
  origin: function (origin, callback) {
    // 允许没有 origin 的请求（如移动应用或 Postman）
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, true); // 开发环境允许所有来源
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 日志中间件
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`)
};

// HTTPS 证书路径（Windows 示例路径，可通过环境变量覆盖）
const HTTPS_CERT_PATH = process.env.SSL_CERT_PATH || 'C:/ssl/server.crt';
const HTTPS_KEY_PATH = process.env.SSL_KEY_PATH || 'C:/ssl/server.key';

// OSS 配置
const OSS_CONFIG = {
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || 'LTAI5tBhrFu4mrMC6cMpSKiC',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '8HsSNa0Llu5KUEcJj297J2sGigU9yF',
  endpoint: process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
  bucket: process.env.OSS_BUCKET_NAME || 'the3edu-event-bucket',
  bucketDomain: process.env.OSS_BUCKET_DOMAIN || null
};

// 检查 OSS 配置
const OSS_AVAILABLE = !!(OSS_CONFIG.accessKeyId && OSS_CONFIG.accessKeySecret && OSS_CONFIG.endpoint && OSS_CONFIG.bucket);

if (!OSS_AVAILABLE) {
  logger.warn('OSS configuration incomplete. OSS upload will be disabled.');
}

// 创建 OSS 客户端
let ossClient = null;
if (OSS_AVAILABLE) {
  try {
    // 清理 endpoint（去掉 https:// 前缀）
    const cleanEndpoint = OSS_CONFIG.endpoint.replace(/^https?:\/\//, '');
    
    ossClient = new OSS({
      region: cleanEndpoint.includes('oss-') ? cleanEndpoint.split('.')[0].replace('oss-', '') : 'oss-cn-hangzhou',
      accessKeyId: OSS_CONFIG.accessKeyId,
      accessKeySecret: OSS_CONFIG.accessKeySecret,
      bucket: OSS_CONFIG.bucket,
      endpoint: `https://${cleanEndpoint}`,
      timeout: 300000, // 5分钟超时
      secure: true
    });
    logger.info('OSS client initialized successfully');
  } catch (error) {
    logger.error(`Failed to initialize OSS client: ${error.message}`);
    ossClient = null;
  }
}

// 配置 multer 用于文件上传
const upload = multer({
  dest: os.tmpdir(), // 使用系统临时目录
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB 限制
  }
});

/**
 * 上传文件到 OSS
 * @param {string} filePath - 本地文件路径
 * @param {string} objectName - OSS 对象名称
 * @returns {Promise<string>} OSS 文件的完整 URL
 */
async function uploadToOSS(filePath, objectName = null) {
  if (!ossClient) {
    throw new Error('OSS client not available');
  }

  // 如果没有指定对象名称，自动生成
  if (!objectName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    objectName = `videos/${timestamp}.mp4`;
  }

  // 获取文件大小
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  logger.info(`Uploading file to OSS: ${objectName}, size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  try {
    // 读取文件
    const fileStream = fs.createReadStream(filePath);

    // 对于大文件（>100MB），使用分片上传
    if (fileSize > 100 * 1024 * 1024) {
      logger.info('Using multipart upload for large file');
      
      // 根据文件大小动态调整分片大小
      let partSize = 10 * 1024 * 1024; // 默认 10MB
      if (fileSize > 500 * 1024 * 1024) {
        partSize = 20 * 1024 * 1024; // 20MB
      } else if (fileSize > 200 * 1024 * 1024) {
        partSize = 15 * 1024 * 1024; // 15MB
      }

      // 使用分片上传
      const result = await ossClient.multipartUpload(objectName, filePath, {
        partSize: partSize,
        progress: (p, c, total) => {
          const percent = ((c / total) * 100).toFixed(1);
          if (parseInt(percent) % 10 === 0) {
            logger.info(`Upload progress: ${percent}% (${c}/${total} bytes)`);
          }
        }
      });

      // 返回完整 URL
      if (OSS_CONFIG.bucketDomain) {
        return `${OSS_CONFIG.bucketDomain.replace(/\/$/, '')}/${objectName}`;
      } else {
        return result.url;
      }
    } else {
      // 小文件直接上传
      const result = await ossClient.put(objectName, filePath);
      
      // 返回完整 URL
      if (OSS_CONFIG.bucketDomain) {
        return `${OSS_CONFIG.bucketDomain.replace(/\/$/, '')}/${objectName}`;
      } else {
        return result.url;
      }
    }
  } catch (error) {
    logger.error(`OSS upload error: ${error.message}`);
    throw error;
  }
}

// ==================== API 路由 ====================

/**
 * 上传文件到 OSS
 * POST /upload-to-oss
 * 
 * 请求:
 *   - method: POST
 *   - content-type: multipart/form-data
 *   - field: "video" 视频文件
 *   - field: "fileName" (可选) 文件名，如果不提供会自动生成
 * 
 * 响应:
 *   - 成功: JSON { "success": true, "url": "OSS URL", "key": "object name" }
 *   - 失败: JSON { "success": false, "error": "错误信息" }
 */
app.post('/upload-to-oss', upload.single('video'), async (req, res) => {
  if (!OSS_AVAILABLE || !ossClient) {
    return res.status(500).json({
      success: false,
      error: 'OSS not available'
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'no video file provided'
    });
  }

  const tempFilePath = req.file.path;
  let customFileName = req.body.fileName;

  try {
    // 如果没有提供文件名，自动生成
    if (!customFileName) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
      const fileExt = path.extname(req.file.originalname) || '.webm';
      customFileName = `videos/${timestamp}${fileExt}`;
    }

    logger.info(`Uploading file to OSS: ${customFileName}`);

    // 上传到 OSS
    const ossUrl = await uploadToOSS(tempFilePath, customFileName);
    logger.info(`Upload successful: ${ossUrl}`);

    res.json({
      success: true,
      url: ossUrl,
      key: customFileName
    });
  } catch (error) {
    logger.error(`OSS upload proxy error: ${error.message}`);
    logger.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    // 清理临时文件
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        logger.info(`Temporary file deleted: ${tempFilePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to delete temporary file: ${error.message}`);
    }
  }
});

/**
 * 健康检查
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * 测试 OSS 配置和连接
 * GET /test-oss
 */
app.get('/test-oss', async (req, res) => {
  try {
    if (!OSS_AVAILABLE || !ossClient) {
      return res.status(500).json({
        success: false,
        error: 'OSS not available',
        message: 'Please check OSS configuration'
      });
    }

    // 尝试列出 bucket（测试连接）
    try {
      const result = await ossClient.list({
        'max-keys': 1
      });

      res.json({
        success: true,
        message: 'OSS connection successful',
        bucket: OSS_CONFIG.bucket,
        endpoint: OSS_CONFIG.endpoint,
        objects_count: result.objects ? result.objects.length : 0
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `OSS connection failed: ${error.message}`,
        bucket: OSS_CONFIG.bucket,
        endpoint: OSS_CONFIG.endpoint
      });
    }
  } catch (error) {
    logger.error(`Test OSS error: ${error.message}`);
    logger.error(error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// 启动服务器
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

// 优先启动 HTTPS，若证书不存在则回退到 HTTP
const certExists = fs.existsSync(HTTPS_CERT_PATH);
const keyExists = fs.existsSync(HTTPS_KEY_PATH);

if (certExists && keyExists) {
  try {
    const httpsOptions = {
      cert: fs.readFileSync(HTTPS_CERT_PATH),
      key: fs.readFileSync(HTTPS_KEY_PATH)
    };
    https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
      logger.info(`Server running on https://${HOST}:${PORT}`);
      logger.info(`OSS available: ${OSS_AVAILABLE}`);
      if (OSS_AVAILABLE) {
        logger.info(`OSS bucket: ${OSS_CONFIG.bucket}`);
        logger.info(`OSS endpoint: ${OSS_CONFIG.endpoint}`);
      }
    });
  } catch (error) {
    logger.error(`Failed to start HTTPS server: ${error.message}`);
    app.listen(PORT, HOST, () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
      logger.info(`OSS available: ${OSS_AVAILABLE}`);
      if (OSS_AVAILABLE) {
        logger.info(`OSS bucket: ${OSS_CONFIG.bucket}`);
        logger.info(`OSS endpoint: ${OSS_CONFIG.endpoint}`);
      }
    });
  }
} else {
  if (!certExists) logger.warn(`HTTPS cert not found: ${HTTPS_CERT_PATH}`);
  if (!keyExists) logger.warn(`HTTPS key not found: ${HTTPS_KEY_PATH}`);
  app.listen(PORT, HOST, () => {
    logger.info(`Server running on http://${HOST}:${PORT}`);
    logger.info(`OSS available: ${OSS_AVAILABLE}`);
    if (OSS_AVAILABLE) {
      logger.info(`OSS bucket: ${OSS_CONFIG.bucket}`);
      logger.info(`OSS endpoint: ${OSS_CONFIG.endpoint}`);
    }
  });
}

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;

