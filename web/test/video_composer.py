import os
import json
import logging
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
# 2.0
logger = logging.getLogger()

class VideoComposer:
    def __init__(self, work_dir="/tmp"):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(exist_ok=True)
        
        # 固定片头片尾路径（在OSS中的位置）
        self.intro_path = "templates/intro.mp4"
        self.outro_path = "templates/outro.mp4"
    
    def download_file(self, bucket, oss_key, local_path):
        """从OSS下载文件"""
        try:
            logger.info(f"下载文件: {oss_key} -> {local_path}")
            local_path = Path(local_path)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            bucket.get_object_to_file(oss_key, str(local_path))
            return True
        except Exception as e:
            logger.error(f"下载文件失败 {oss_key}: {str(e)}")
            return False
    
    def download_files_parallel(self, bucket, download_tasks):
        """
        并行下载多个文件
        
        Args:
            bucket: OSS bucket对象
            download_tasks: [(oss_key, local_path), ...] 下载任务列表
        
        Returns:
            bool: 是否全部下载成功
        """
        def download_task(oss_key, local_path):
            return self.download_file(bucket, oss_key, local_path)
        
        logger.info(f"开始并行下载 {len(download_tasks)} 个文件...")
        success_count = 0
        
        with ThreadPoolExecutor(max_workers=3) as executor:
            # 提交所有下载任务
            future_to_task = {
                executor.submit(download_task, oss_key, local_path): (oss_key, local_path)
                for oss_key, local_path in download_tasks
            }
            
            # 等待所有任务完成
            for future in as_completed(future_to_task):
                oss_key, local_path = future_to_task[future]
                try:
                    if future.result():
                        success_count += 1
                        logger.info(f"✓ 下载完成: {oss_key}")
                    else:
                        logger.error(f"✗ 下载失败: {oss_key}")
                        return False
                except Exception as e:
                    logger.error(f"✗ 下载异常 {oss_key}: {str(e)}")
                    return False
        
        logger.info(f"所有文件下载完成 ({success_count}/{len(download_tasks)})")
        return success_count == len(download_tasks)
    
    def execute_ffmpeg(self, command, timeout=1200):
        """执行FFmpeg命令"""
        try:
            logger.info(f"执行FFmpeg命令: {' '.join(command)}")
            logger.info(f"超时设置: {timeout}秒")
            
            result = subprocess.run(
                command,
                cwd=self.work_dir,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if result.returncode != 0:
                logger.error(f"FFmpeg失败: {result.stderr}")
                return False, result.stderr
            
            logger.info("FFmpeg执行成功")
            return True, result.stdout
            
        except subprocess.TimeoutExpired:
            error_msg = f"FFmpeg执行超时 ({timeout}秒)"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"FFmpeg异常: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
    
    def compose_video(self, bucket, user_video_key, output_key, preset="ultrafast"):
        """
        合成视频：片头 + 用户视频 + 片尾
        
        Args:
            bucket: OSS bucket对象
            user_video_key: 用户上传的视频在OSS中的key
            output_key: 输出视频的OSS key
            preset: FFmpeg编码预设（默认ultrafast，最快速度）
        """
        try:
            # 1. 定义本地文件路径
            local_intro = self.work_dir / "intro.mp4"
            local_user_video = self.work_dir / "user_video.mp4" 
            local_outro = self.work_dir / "outro.mp4"
            local_output = self.work_dir / "final_output.mp4"
            
            # 2. 并行下载所有需要的文件（加快下载速度）
            logger.info("开始并行下载视频文件...")
            download_tasks = [
                (self.intro_path, local_intro),
                (user_video_key, local_user_video),
                (self.outro_path, local_outro)
            ]
            
            if not self.download_files_parallel(bucket, download_tasks):
                return False, "下载视频文件失败"
            
            # 3. 预处理：快速压缩用户视频以减少处理时间（如果文件较大）
            logger.info("检查用户视频文件大小...")
            user_video_size = local_user_video.stat().st_size if local_user_video.exists() else 0
            user_video_size_mb = user_video_size / (1024 * 1024)
            logger.info(f"用户视频大小: {user_video_size_mb:.2f} MB")
            
            # 如果用户视频大于10MB，先快速压缩
            if user_video_size_mb > 10:
                logger.info("用户视频较大，先进行快速压缩...")
                compressed_user_video = self.work_dir / "user_video_compressed.mp4"
                compress_command = [
                    'ffmpeg', '-y',
                    '-i', str(local_user_video),
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '35',  # 高压缩比
                    '-r', '24',  # 降低帧率
                    '-vf', 'scale=1080:1440:force_original_aspect_ratio=decrease,pad=1080:1440:(ow-iw)/2:(oh-ih)/2',
                    '-c:a', 'aac',
                    '-b:a', '64k',
                    '-threads', '0',
                    '-movflags', '+faststart',
                    str(compressed_user_video)
                ]
                compress_success, compress_result = self.execute_ffmpeg(compress_command, timeout=300)
                if compress_success and compressed_user_video.exists():
                    logger.info("用户视频压缩成功，使用压缩后的版本")
                    local_user_video = compressed_user_video
                else:
                    logger.warn(f"压缩失败，使用原始视频: {compress_result}")
            
            # 4. 使用filter_complex统一编码并合并视频和音频（优化速度）
            # 统一所有视频为1080x1440，H.264编码，确保兼容性
            # 对用户视频应用水平镜像（自拍效果）
            # 统一音频：采样率44100Hz，立体声，如果某个视频没有音频则生成静音
            # 优化参数：
            # - preset: ultrafast (最快编码速度)
            # - crf: 27 (比23更快，文件稍大但质量可接受)
            # - threads: 0 (自动使用所有CPU核心)
            # - tune: fastdecode (优化解码速度)
            # - flags: fast_bilinear (快速缩放算法)
            command = [
                'ffmpeg', '-y',
                '-i', str(local_intro),
                '-i', str(local_user_video),
                '-i', str(local_outro),
                '-filter_complex',
                # 处理视频流：保持1080x1440分辨率，优化处理速度
                # 对用户视频（[1:v]）应用水平镜像
                # 使用 flags=0 (fast_bilinear) 确保兼容性，简化 pad 操作
                '[0:v]scale=1080:1440:force_original_aspect_ratio=decrease:flags=0,'
                'pad=1080:1440:(ow-iw)/2:(oh-ih)/2[v0];'
                '[1:v]hflip,scale=1080:1440:force_original_aspect_ratio=decrease:flags=0,'
                'pad=1080:1440:(ow-iw)/2:(oh-ih)/2[v1];'
                '[2:v]scale=1080:1440:force_original_aspect_ratio=decrease:flags=0,'
                'pad=1080:1440:(ow-iw)/2:(oh-ih)/2[v2];'
                # 处理音频流：使用条件处理，如果输入有音频则使用，否则生成静音
                # 方法：使用 aevalsrc=0 生成静音，然后使用 amix 混合
                # 更可靠的方法：为每个输入尝试提取音频，如果没有则使用静音
                # 使用 anullsrc 生成静音音频，时长与视频匹配
                # 使用 amovie 或 aevalsrc 生成静音，但需要知道视频时长
                # 最简单可靠的方法：使用 apad 和条件选择
                # 使用 FFmpeg 的音频选择器：如果输入有音频则使用，否则使用静音
                # 使用 anullsrc 生成静音音频流，然后与视频同步
                # 方法：为每个输入创建音频流（有则用原音频，无则用静音）
                # 使用 aevalsrc=0:channel_layout=stereo:sample_rate=44100 生成静音
                # 然后根据视频时长调整，使用 atrim 和 apad
                # 更简单的方法：使用 -shortest 和 -map，让 FFmpeg 自动处理
                # 但需要确保所有输入都有音频流
                # 最可靠的方法：为每个输入添加静音音频作为后备
                # 使用 anullsrc 生成静音，然后与视频同步
                # 处理音频：简化音频处理以加快速度
                # 使用 asetrate 和 aresample 快速处理，降低采样率到 22050Hz 以加快处理
                # 移除 apad（让 concat 自动处理长度差异）
                '[0:a]aresample=22050[a0];'
                '[1:a]aresample=22050[a1];'
                '[2:a]aresample=22050[a2];'
                # 拼接视频和音频流
                '[v0][v1][v2]concat=n=3:v=1[outv];'
                '[a0][a1][a2]concat=n=3:v=0:a=1[outa]',
                '-map', '[outv]',
                '-map', '[outa]',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',  # 强制使用 ultrafast，最快速度
                '-crf', '32',  # 32: 进一步降低质量，大幅提升编码速度
                '-r', '24',  # 降低帧率到24fps，减少处理量
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',  # 音频编码使用AAC
                '-b:a', '48k',  # 进一步降低音频比特率到48kbps，加快编码
                '-ar', '22050',  # 降低采样率到22050Hz，减少处理量50%（原来44100Hz）
                '-ac', '2',  # 立体声
                '-threads', '0',  # 0: 自动使用所有CPU核心
                '-tune', 'fastdecode',  # 优化解码速度
                '-movflags', '+faststart',  # 快速启动，便于流式播放
                '-shortest',  # 以最短的流为准，确保同步
                # 最激进的 x264 参数：减少关键帧、关闭场景检测、降低复杂度
                '-x264-params', 'keyint=60:min-keyint=60:scenecut=0:ref=1:bframes=0:me=dia:subme=0:trellis=0:fast-pskip=1:no-mbtree=1:no-cabac=1',  # no-cabac=1 关闭CABAC，进一步提升编码速度
                str(local_output)
            ]
            
            logger.info("开始执行FFmpeg视频合成...")
            logger.info(f"分辨率: 1080x1440, 帧率: 24fps, 预设: ultrafast, CRF: 32, 音频: 22050Hz/48k, 超时: 1200秒")
            success, result = self.execute_ffmpeg(command, timeout=1200)
            if not success:
                logger.error(f"FFmpeg执行失败: {result}")
                return False, f"视频合成失败: {result}"
            logger.info("FFmpeg执行成功，开始上传...")
            
            # 5. 上传最终视频到OSS
            logger.info(f"上传最终视频: {output_key}")
            bucket.put_object_from_file(output_key, local_output)
            
            # 6. 清理临时文件
            self.cleanup_files([
                local_intro, local_user_video, local_outro, 
                local_output
            ])
            
            return True, "合成成功"
            
        except Exception as e:
            logger.error(f"视频合成过程异常: {str(e)}")
            return False, f"合成异常: {str(e)}"
    
    def cleanup_files(self, file_list):
        """清理临时文件"""
        for file_path in file_list:
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception as e:
                logger.warning(f"清理文件失败 {file_path}: {str(e)}")