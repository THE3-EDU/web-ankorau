import logging
import os
import json
import oss2
from video_composer import VideoComposer

# 配置日志
logger = logging.getLogger()

def get_oss_bucket():
    """获取OSS bucket实例"""
    # 从环境变量获取配置
    access_key_id = "LTAI5tBhrFu4mrMC6cMpSKiC"
    access_key_secret = "8HsSNa0Llu5KUEcJj297J2sGigU9yF" 
    # oss2.Bucket的endpoint参数应该是纯域名，不包含协议前缀
    # 格式：oss-{region}.aliyuncs.com
    endpoint = "oss-cn-hangzhou.aliyuncs.com"
    bucket_name = "the3edu-event-bucket"
    
    if not all([access_key_id, access_key_secret, bucket_name]):
        raise ValueError("OSS环境变量配置不完整")
    
    logger.info(f"Creating OSS bucket: endpoint={endpoint}, bucket={bucket_name}")
    
    auth = oss2.Auth(access_key_id, access_key_secret)
    # 创建bucket实例，endpoint必须是纯域名格式
    # 显式设置 is_cname=False 确保使用标准OSS域名
    bucket = oss2.Bucket(auth, endpoint, bucket_name, is_cname=False)
    
    logger.info("OSS bucket created successfully")
    return bucket

def generate_output_key(user_video_key, template="default"):
    """生成输出文件的OSS key"""
    import time
    import hashlib
    
    # 基于用户视频key和时间生成唯一输出文件名
    timestamp = int(time.time())
    name_hash = hashlib.md5(user_video_key.encode()).hexdigest()[:8]
    
    # 从用户视频key中提取原始文件名
    original_name = os.path.basename(user_video_key)
    name_without_ext = os.path.splitext(original_name)[0]
    
    output_filename = f"composed-{name_without_ext}-{timestamp}-{name_hash}.mp4"
    return f"results/{output_filename}"

def make_http_response(data, status_code=200, origin=None):
    """
    为HTTP触发器创建标准响应格式
    确保返回JSON格式，避免被强制下载
    
    Args:
        data: 响应数据
        status_code: HTTP状态码
        origin: 请求的Origin头，用于设置CORS
    """
    headers = {
        'Content-Type': 'application/json',
    }
    
    # 根据请求的Origin设置CORS头，避免重复
    # 如果FC平台已经设置了CORS头，我们就不设置，避免冲突
    # 如果需要设置，使用请求的Origin值，而不是*
    if origin:
        headers['Access-Control-Allow-Origin'] = origin
        headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
        headers['Access-Control-Allow-Headers'] = 'Content-Type'
    else:
        # 如果没有Origin，使用*（但可能和平台设置冲突）
        # 为了安全，不设置，让FC平台处理
        pass
    
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps(data, ensure_ascii=False)
    }

def handler(event, context):
    """
    视频合成处理函数
    
    event示例:
    {
        "userVideoKey": "uploads/user-video-1234567890-abc123.mp4",
        "template": "default",
        "preset": "veryfast"
    }
    """
    logger.info("开始视频合成任务")
    
    # 提取请求的Origin头（用于CORS）
    request_origin = None
    if isinstance(event, dict):
        # FC HTTP触发器可能把headers放在headers字段中
        if 'headers' in event and isinstance(event['headers'], dict):
            # 检查各种可能的Origin头字段名（大小写不敏感）
            headers = event['headers']
            request_origin = (
                headers.get('origin') or 
                headers.get('Origin') or 
                headers.get('ORIGIN') or
                headers.get('x-forwarded-origin') or
                headers.get('X-Forwarded-Origin')
            )
            logger.info(f"Extracted Origin from headers: {request_origin}")
        # 也可能直接在event顶层
        elif 'origin' in event:
            request_origin = event['origin']
            logger.info(f"Extracted Origin from event: {request_origin}")
    
    try:
        # 解析输入参数
        # FC的HTTP触发器会把请求体包装在body字段中
        logger.info(f"Received event type: {type(event)}")
        logger.info(f"Event keys: {list(event.keys()) if isinstance(event, dict) else 'not a dict'}")
        
        # 处理HTTP触发器的event格式
        if isinstance(event, dict):
            # HTTP触发器/API Gateway把请求体放在body字段中（字符串格式）
            if 'body' in event:
                body_str = event['body']
                logger.info(f"Found body field, type: {type(body_str)}")
                logger.info(f"Body content (first 500 chars): {str(body_str)[:500]}")
                
                # body是JSON字符串，需要解析
                if isinstance(body_str, str) and body_str.strip():
                    try:
                        # 直接解析JSON（json.loads能处理转义字符）
                        parsed_body = json.loads(body_str)
                        logger.info(f"Successfully parsed body JSON: {parsed_body}")
                        logger.info(f"Parsed body type: {type(parsed_body)}, keys: {list(parsed_body.keys()) if isinstance(parsed_body, dict) else 'not a dict'}")
                        
                        # 确保解析后是字典且包含userVideoKey
                        if isinstance(parsed_body, dict):
                            event = parsed_body  # 使用解析后的字典
                            logger.info(f"Replaced event with parsed body. New event keys: {list(event.keys())}")
                        else:
                            logger.warning(f"Parsed body is not a dict: {type(parsed_body)}")
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse body as JSON: {e}")
                        logger.error(f"Body content (full): {body_str}")
                        # 尝试处理可能的双重转义
                        try:
                            # 如果body包含字面的\\n，尝试替换
                            cleaned_body = body_str.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                            # 移除首尾可能的额外引号
                            if cleaned_body.startswith('"') and cleaned_body.endswith('"'):
                                cleaned_body = cleaned_body[1:-1]
                            parsed_body = json.loads(cleaned_body)
                            logger.info(f"Successfully parsed body JSON after cleaning: {parsed_body}")
                            if isinstance(parsed_body, dict):
                                event = parsed_body
                            else:
                                raise ValueError("Parsed body is not a dict")
                        except Exception as e2:
                            logger.error(f"Failed to parse body after cleaning: {e2}")
                            return make_http_response({
                                'success': False,
                                'error': f'Failed to parse body JSON: {str(e2)}',
                                'body_content': body_str[:200]
                            }, 400, origin=request_origin)
                # body可能已经是字典（不太常见，但处理一下）
                elif isinstance(body_str, dict):
                    logger.info(f"Body is already dict: {body_str}")
                    event = body_str
                elif not body_str or not body_str.strip():
                    logger.warning("Body field is empty")
            # 如果字典中直接有userVideoKey，说明已经是解析后的格式（直接调用）
            elif 'userVideoKey' in event:
                logger.info("Event already contains userVideoKey, using directly")
                # 已经是正确格式，不需要处理
        elif isinstance(event, bytes):
            event_str = event.decode('utf-8')
            event = json.loads(event_str)
            logger.info(f"Parsed bytes to dict: {event}")
        elif isinstance(event, str):
            event = json.loads(event)
            logger.info(f"Parsed string to dict: {event}")
        
        # 确保event是字典
        if not isinstance(event, dict):
            logger.error(f"Event is not a dict after parsing: {type(event)}, value: {event}")
            return make_http_response({
                'success': False,
                'error': f'Invalid event format: {type(event)}',
                'received_event': str(event)[:500]
            }, 400, origin=request_origin)
        
        logger.info(f"Final parsed event: {event}, keys: {list(event.keys())}")
        
        # 如果event仍然包含HTTP Gateway的字段（version, rawPath等），说明body解析可能有问题
        # 再次尝试从body字段提取
        if isinstance(event, dict) and 'body' in event and 'version' in event:
            logger.warning("Event still contains HTTP Gateway fields, attempting to re-parse body")
            body_str = event.get('body', '')
            if body_str and isinstance(body_str, str):
                try:
                    # 尝试解析body
                    parsed_body = json.loads(body_str)
                    logger.info(f"Re-parsed body: {parsed_body}")
                    # 如果解析成功，使用解析后的内容
                    if isinstance(parsed_body, dict) and 'userVideoKey' in parsed_body:
                        event = parsed_body
                        logger.info(f"Using parsed body as event: {event}")
                except Exception as e:
                    logger.error(f"Failed to re-parse body: {e}")
        
        user_video_key = event.get('userVideoKey')
        template = event.get('template', 'default')
        preset = event.get('preset', 'ultrafast')  # 默认使用ultrafast以获得最快速度
        
        logger.info(f"Extracted - userVideoKey: {user_video_key}, template: {template}, preset: {preset}")
        
        if not user_video_key:
            return make_http_response({
                'success': False,
                'error': f'缺少userVideoKey参数。收到的event keys: {list(event.keys()) if isinstance(event, dict) else "not a dict"}, event preview: {str(event)[:500]}'
            }, 400, origin=request_origin)
        
        # 初始化
        bucket = get_oss_bucket()
        composer = VideoComposer()
        
        # 生成输出文件路径
        output_key = generate_output_key(user_video_key, template)
        
        # 执行视频合成
        success, message = composer.compose_video(
            bucket=bucket,
            user_video_key=user_video_key,
            output_key=output_key,
            preset=preset
        )
        
        if success:
            # 构建可访问的URL
            # 使用已知的 endpoint 构建 URL
            bucket_name = "the3edu-event-bucket"
            endpoint = "oss-cn-hangzhou.aliyuncs.com"
            final_url = f"https://{bucket_name}.{endpoint}/{output_key}"
            
            return make_http_response({
                'success': True,
                'message': message,
                'finalVideoUrl': final_url,
                'outputKey': output_key
            }, 200, origin=request_origin)
        else:
            return make_http_response({
                'success': False,
                'error': message
            }, 500, origin=request_origin)
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"视频合成任务异常: {str(e)}\n{error_trace}")
        return make_http_response({
            'success': False,
            'error': f'处理失败: {str(e)}'
        }, 500, origin=request_origin)

def main():
    """本地测试函数"""
    # 设置测试环境变量
    os.environ['OSS_ACCESS_KEY_ID'] = 'LTAI5tBhrFu4mrMC6cMpSKiC'
    os.environ['OSS_ACCESS_KEY_SECRET'] = '8HsSNa0Llu5KUEcJj297J2sGigU9yF'
    os.environ['OSS_BUCKET_NAME'] = 'the3edu-event-bucket'
    os.environ['OSS_ENDPOINT'] = 'https://oss-cn-hangzhou.aliyuncs.com'
    
    # 测试事件
    test_event = {
        "userVideoKey": "uploads/test-video.mp4",
        "template": "default",
        "preset": "veryfast"
    }
    
    result = handler(test_event, None)
    print("测试结果:", json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()