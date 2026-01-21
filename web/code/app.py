import os
import tempfile
import subprocess
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

logger = logging.getLogger(__name__)

# OSS 上传功能（可选）
try:
    import oss2
    OSS_AVAILABLE = True
except ImportError:
    OSS_AVAILABLE = False
    print("Warning: oss2 not installed, OSS upload disabled. Install with: pip install oss2")

# Flask 应用初始化（纯 API 服务，不提供静态文件）
app = Flask(__name__)

# 允许前端访问该后端（解决 CORS）
# 前后端分离后，需要配置前端域名
CORS(app, resources={r"/*": {
    "origins": [
        "http://localhost:3000",  # 开发环境前端
        "https://localhost:3000",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000",
        "http://localhost:80",  # 生产环境前端（如果使用 Nginx）
        "https://api.the3studio.cn",  # 生产环境前端域名（根据实际情况修改）
        "*"  # 开发时可以允许所有来源，生产环境建议指定具体域名
    ],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
    "supports_credentials": True
}})

# 创建线程池用于异步处理上传任务（可选，如果使用 Gunicorn 多进程可以不用）
# 线程池大小：根据服务器 CPU 核心数调整，建议为 CPU 核心数 * 2
MAX_WORKERS = int(os.getenv("UPLOAD_THREAD_POOL_SIZE", "8"))
upload_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)


# def get_project_root() -> str:
#   """
#   返回包含前端和 VIDEO 资源的项目根目录。
#   现在片头片尾直接放在 backend/VIDEO 下，
#   所以这里返回 backend 目录本身。
#   """
#   return os.path.abspath(os.path.dirname(__file__))


def upload_to_oss(file_path: str, object_name: str = None) -> str:
  """
  上传文件到阿里云OSS
  
  参数:
    file_path: 本地文件路径
    object_name: OSS对象名称（如果不提供，会自动生成）
  
  返回:
    OSS文件的完整URL
  
  环境变量配置:
    OSS_ACCESS_KEY_ID: OSS访问密钥ID
    OSS_ACCESS_KEY_SECRET: OSS访问密钥Secret
    OSS_ENDPOINT: OSS端点（如: oss-cn-hangzhou.aliyuncs.com）
    OSS_BUCKET_NAME: OSS存储桶名称
    OSS_BUCKET_DOMAIN: OSS存储桶域名（可选，如: https://your-bucket.oss-cn-hangzhou.aliyuncs.com）
  """
  if not OSS_AVAILABLE:
    raise Exception("OSS not available, oss2 not installed")
  
  # 从环境变量读取OSS配置，如果没有则使用默认值（与前端一致）
  access_key_id = os.getenv("OSS_ACCESS_KEY_ID", "LTAI5tBhrFu4mrMC6cMpSKiC")
  access_key_secret = os.getenv("OSS_ACCESS_KEY_SECRET", "8HsSNa0Llu5KUEcJj297J2sGigU9yF")
  endpoint = os.getenv("OSS_ENDPOINT", "oss-cn-hangzhou.aliyuncs.com")
  bucket_name = os.getenv("OSS_BUCKET_NAME", "the3edu-event-bucket")
  bucket_domain = os.getenv("OSS_BUCKET_DOMAIN")
  
  if not all([access_key_id, access_key_secret, endpoint, bucket_name]):
    raise Exception("OSS configuration incomplete. Please set OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_ENDPOINT, OSS_BUCKET_NAME")
  
  # 如果没有指定对象名称，自动生成
  if not object_name:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    object_name = f"videos/{timestamp}.mp4"
  
  # 创建OSS客户端
  # endpoint需要去掉https://前缀（如果有）
  clean_endpoint = endpoint.replace('https://', '').replace('http://', '')
  auth = oss2.Auth(access_key_id, access_key_secret)
  
  # 配置OSS客户端以优化上传速度和并发性能
  # 使用连接池和超时设置
  # 注意：每个进程/线程应该创建自己的 bucket 实例，避免并发冲突
  # oss2.Bucket 只支持 connect_timeout 参数，不支持 read_timeout
  # 对于大文件上传，oss2 内部会自动处理超时
  bucket = oss2.Bucket(
    auth, 
    clean_endpoint, 
    bucket_name,
    connect_timeout=30,  # 连接超时30秒
    # oss2 默认已启用连接池，支持多线程并发上传
    # 连接池大小由 oss2 内部管理，通常足够处理并发请求
    # 大文件上传时，oss2 会自动处理读取超时，无需手动设置
  )
  
  # 获取文件大小
  file_size = os.path.getsize(file_path)
  logger.info(f"Uploading file to OSS: {object_name}, size: {file_size / 1024 / 1024:.2f} MB")
  
  # 对于大文件（>100MB），使用分片上传以提高速度和可靠性
  # 对于小文件，直接上传更快
  if file_size > 100 * 1024 * 1024:  # 100MB
    logger.info("Using multipart upload for large file")
    # 分片上传
    def progress_callback(consumed_bytes, total_bytes):
      percent = (consumed_bytes / total_bytes) * 100 if total_bytes > 0 else 0
      if int(percent) % 10 == 0:  # 每10%打印一次
        logger.info(f"Upload progress: {percent:.1f}% ({consumed_bytes}/{total_bytes} bytes)")
    
    # 分片上传：根据文件大小动态调整分片大小和线程数
    # 大文件使用更多线程，小文件使用较少线程
    if file_size > 500 * 1024 * 1024:  # 500MB 以上
      part_size = 20 * 1024 * 1024  # 20MB per part
      num_threads = 8  # 8个并发线程
    elif file_size > 200 * 1024 * 1024:  # 200MB-500MB
      part_size = 15 * 1024 * 1024  # 15MB per part
      num_threads = 6  # 6个并发线程
    else:  # 100MB-200MB
      part_size = 10 * 1024 * 1024  # 10MB per part
      num_threads = 4  # 4个并发线程
    
    bucket.multipart_upload(
      object_name,
      file_path,
      progress_callback=progress_callback,
      part_size=part_size,
      num_threads=num_threads
    )
  else:
    # 小文件直接上传（更快）
    with open(file_path, 'rb') as f:
      bucket.put_object(object_name, f)
  
  # 返回完整URL
  if bucket_domain:
    # 如果提供了自定义域名，使用自定义域名
    url = f"{bucket_domain.rstrip('/')}/{object_name}"
  else:
    # 否则使用默认OSS域名
    url = f"https://{bucket_name}.{clean_endpoint}/{object_name}"
  
  return url


# ==================== API 路由 ====================
@app.route("/upload-to-oss", methods=["POST"])
def upload_to_oss_proxy():
  """
  后端代理上传文件到OSS（避免CORS问题）
  
  请求:
    - method: POST
    - content-type: multipart/form-data
    - field: "video" 视频文件
    - field: "fileName" (可选) 文件名，如果不提供会自动生成
  
  响应:
    - 成功: JSON { "success": True, "url": "OSS URL" }
    - 失败: JSON { "success": False, "error": "错误信息" }
  """
  if not OSS_AVAILABLE:
    return jsonify({"success": False, "error": "OSS not available"}), 500
  
  if "video" not in request.files:
    return jsonify({"success": False, "error": "no video file provided"}), 400
  
  video_file = request.files["video"]
  if video_file.filename == "":
    return jsonify({"success": False, "error": "empty filename"}), 400
  
  try:
    # 获取文件名（可选）
    custom_file_name = request.form.get("fileName")
    if not custom_file_name:
      timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
      custom_file_name = f"videos/{timestamp}.webm"
    
    app.logger.info(f"Uploading file to OSS: {custom_file_name}")
    
    # 保存到临时文件
    tmp_dir = tempfile.mkdtemp(prefix="oss_upload_")
    # 使用临时文件名，保留原始扩展名
    file_ext = os.path.splitext(custom_file_name)[1] or '.webm'
    tmp_filename = f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}{file_ext}"
    tmp_path = os.path.join(tmp_dir, tmp_filename)
    
    try:
      app.logger.info(f"Saving file to temp path: {tmp_path}")
      video_file.save(tmp_path)
      
      # 检查文件是否保存成功
      if not os.path.exists(tmp_path):
        raise Exception("Failed to save file to temporary location")
      
      file_size = os.path.getsize(tmp_path)
      app.logger.info(f"File saved, size: {file_size} bytes")
      
      # 直接上传原始文件（webm格式也可以，不需要转换）
      app.logger.info(f"Uploading to OSS: {custom_file_name}")
      oss_url = upload_to_oss(tmp_path, custom_file_name)
      app.logger.info(f"Upload successful: {oss_url}")
      
      return jsonify({
        "success": True,
        "url": oss_url,
        "key": custom_file_name  # 返回原始文件名（webm格式）
      }), 200
    finally:
      # 清理临时文件
      try:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
          os.remove(tmp_path)
        if os.path.exists(tmp_dir):
          # 清理目录中剩余的文件
          for name in os.listdir(tmp_dir):
            try:
              os.remove(os.path.join(tmp_dir, name))
            except OSError:
              pass
          os.rmdir(tmp_dir)
      except OSError as e:
        app.logger.warning(f"Failed to clean up temp files: {str(e)}")
      
  except Exception as e:
    import traceback
    error_trace = traceback.format_exc()
    app.logger.error(f"OSS upload proxy error: {str(e)}\n{error_trace}")
    return jsonify({"success": False, "error": str(e)}), 500



@app.route("/health", methods=["GET"])
def health():
  return jsonify({"status": "ok"}), 200


@app.route("/test-oss", methods=["GET"])
def test_oss():
  """测试OSS配置和连接"""
  try:
    if not OSS_AVAILABLE:
      return jsonify({
        "success": False,
        "error": "oss2 not installed",
        "message": "Please install: pip install oss2"
      }), 500
    
    # 检查配置
    access_key_id = os.getenv("OSS_ACCESS_KEY_ID", "LTAI5tBhrFu4mrMC6cMpSKiC")
    access_key_secret = os.getenv("OSS_ACCESS_KEY_SECRET", "8HsSNa0Llu5KUEcJj297J2sGigU9yF")
    endpoint = os.getenv("OSS_ENDPOINT", "oss-cn-hangzhou.aliyuncs.com")
    bucket_name = os.getenv("OSS_BUCKET_NAME", "the3edu-event-bucket")
    
    clean_endpoint = endpoint.replace('https://', '').replace('http://', '')
    
    # 尝试创建OSS客户端
    auth = oss2.Auth(access_key_id, access_key_secret)
    bucket = oss2.Bucket(auth, clean_endpoint, bucket_name)
    
    # 尝试列出bucket（测试连接）
    try:
      result = bucket.list_objects(max_keys=1)
      return jsonify({
        "success": True,
        "message": "OSS connection successful",
        "bucket": bucket_name,
        "endpoint": clean_endpoint,
        "objects_count": len(result.object_list) if hasattr(result, 'object_list') else 0
      }), 200
    except Exception as e:
      return jsonify({
        "success": False,
        "error": f"OSS connection failed: {str(e)}",
        "bucket": bucket_name,
        "endpoint": clean_endpoint
      }), 500
      
  except Exception as e:
    import traceback
    return jsonify({
      "success": False,
      "error": str(e),
      "traceback": traceback.format_exc()
    }), 500


# 注意：前后端已分离，静态文件由 Nginx 提供，后端只处理 API 请求





if __name__ == "__main__":
  # 默认监听 5000 端口，前端可通过 http://localhost:5000 调用
  app.run(host="0.0.0.0", port=5001, debug=True)


