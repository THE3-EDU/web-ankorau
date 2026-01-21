/*
----- Coding Tutorial by Patt Vira ----- 
Name: Interactive Fridge Magnets
Video Tutorial: https://youtu.be/72pAzuD8tqE

Connect with Patt: @pattvira
https://www.pattvira.com/
----------------------------------------
*/

let video; let handPose; let hands = [];
let size = 35;
let magnets = []; let num = 5;

function preload() {
  handPose = ml5.handPose({flipped: true});
}

function setup() {
  createCanvas(640, 480);
  // Detect video & load ML model
  video = createCapture(VIDEO, {flipped: true});
  video.hide();
  handPose.detectStart(video, gotHands);
  
  // Create magnet objects
  rectMode(CENTER);
  for (let i=0; i<num; i++) {
    magnets[i] = new Magnet();
    magnets[i].init(); // 初始化位置和大小
  }
}

function draw() {
  background(220);
  
  // Display video and detect index and thumb position
  image(video, 0, 0, width, height);
  if (hands.length > 0) {
    let index = hands[0].keypoints[8];
    let thumb = hands[0].keypoints[4];
    
    noFill();
    stroke(0, 255, 0);
    text("index", index.x, index.y);
    text("thumb", thumb.x, thumb.y);
  
    for (let i=0; i<num; i++) {
      magnets[i].touch(thumb.x, thumb.y, index.x, index.y);
    }
  }
  
  for (let i=0; i<num; i++) {
    magnets[i].display();
  }
}

function gotHands(results) {
  hands = results;
}