class Magnet {
  constructor() {
    // 使用 GIF 图片而不是文字
    this.img = gifImage;
    // 延迟初始化位置，等 setup 完成后再设置
    this.x = 0;
    this.y = 0;
    this.angle = random(TWO_PI);
    this.c = color(255);
    
    // 图片尺寸
    this.w = 100; // 默认宽度
    this.h = 100;  // 默认高度（保持正方形比例）
    this.baseW = 100; // 基础宽度（用于缩放参考）
    this.baseH = 100; // 基础高度（用于缩放参考）
    
    this.pos = createVector(0, 0);
    this.fingerx = 0;
    this.fingery = 0;
    this.initialized = false;
    
    // 缩放相关
    this.isSelected = false; // 是否被选中
    this.isBeingScaled = false; // 是否正在被缩放
    this.initialDistance = 0; // 开始缩放时的手指距离
    this.initialSize = createVector(0, 0); // 开始缩放时的尺寸
    this.wasPinching = false; // 上一帧是否在捏合
  }
  
  init() {
    if (!this.initialized && this.img) {
      this.x = random(width);
      this.y = random(height);
      this.pos = createVector(this.x, this.y);
      
      // 使用图片的实际尺寸，或按比例缩放
      if (this.img.width > 0 && this.img.height > 0) {
        // 保持图片宽高比，设置一个合适的显示尺寸
        let maxSize = 150; // 最大尺寸
        let scale = min(maxSize / this.img.width, maxSize / this.img.height);
        this.w = this.img.width * scale;
        this.h = this.img.height * scale;
        this.baseW = this.w; // 保存基础尺寸
        this.baseH = this.h;
      } else {
        // 如果图片还没加载完成，使用默认尺寸
        this.w = 100;
        this.h = 100;
        this.baseW = 100;
        this.baseH = 100;
      }
      
      this.initialized = true;
    }
  }
  
  display() {
    if (!this.img) return; // 如果图片还没加载，不显示
    
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    
    // 绘制图片
    imageMode(CENTER);
    image(this.img, 0, 0, this.w, this.h);

    pop();
    
    // 调试：显示手指位置（可选）
    // fill(255, 0, 0);
    // ellipse(this.fingerx, this.fingery, 10, 10);
  }
  
  touch(thumbx, thumby, indexx, indexy) {
    let distBetweenFingers = dist(thumbx, thumby, indexx, indexy);
    this.fingerx = (thumbx + indexx) / 2; // 手指中点 x
    this.fingery = (thumby + indexy) / 2; // 手指中点 y
    
    // 计算从图片中心到手指中点的距离
    let distFromFingers = dist(this.pos.x, this.pos.y, this.fingerx, this.fingery);
    
    // 使用图片对角线的一半作为检测半径
    let detectionRadius = sqrt(this.w * this.w + this.h * this.h) / 2;
    
    // 检查是否在触摸范围内
    let isNear = distFromFingers < detectionRadius * 2;
    let isPinching = distBetweenFingers < 150; // 手指捏合阈值
    
    // 检测捏合手势的开始（从非捏合到捏合）
    let pinchStarted = isPinching && !this.wasPinching;
    
    // 如果捏合手势开始，切换选中状态
    if (pinchStarted && isNear) {
      if (!this.isSelected) {
        // 第一次捏合：选中
        this.isSelected = true;
        this.isBeingScaled = true;
        this.initialDistance = distBetweenFingers;
        this.initialSize = createVector(this.w, this.h);
        // 立即移动到手指位置
      this.pos.x = this.fingerx;
      this.pos.y = this.fingery;
    } else {
        // 第二次捏合：放置（取消选中）
        this.isSelected = false;
        this.isBeingScaled = false;
        this.baseW = this.w;
        this.baseH = this.h;
      }
    }
    
    // 如果被选中，继续控制（缩放和移动）
    if (this.isSelected) {
      // 如果手指在捏合状态，进行缩放和移动
      if (isPinching) {
        // 更新初始距离（如果之前没有记录）
        if (this.initialDistance <= 0) {
          this.initialDistance = distBetweenFingers;
          this.initialSize = createVector(this.w, this.h);
        }
        
        // 继续缩放
        if (this.initialDistance > 0 && distBetweenFingers > 0) {
          let scaleFactor = distBetweenFingers / this.initialDistance;
          // 限制缩放范围（0.2 到 4 倍）
          scaleFactor = constrain(scaleFactor, 0.2, 4.0);
          
          // 保持宽高比缩放
          this.w = this.initialSize.x * scaleFactor;
          this.h = this.initialSize.y * scaleFactor;
        }
      } else {
        // 手指未捏合，重置初始距离，以便下次捏合时重新计算
        this.initialDistance = 0;
      }
      
      // 选中后，手指在附近时跟随移动
      if (isNear || isPinching) {
        this.pos.x = this.fingerx;
        this.pos.y = this.fingery;
      }
    }
    
    // 更新上一帧的捏合状态
    this.wasPinching = isPinching;
  }
}