import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarCrop} from '../src/avatar-crop.js';
import {growPaper,paperLayout,stickerStyle,blockHeight} from '../src/paper-layout.js';

test('사진 확대는 같은 중심에서 원본 영역을 줄이고 위치 조절은 사진 경계를 넘지 않는다',()=>{
  assert.deepEqual(avatarCrop(1200,800),{x:200,y:0,size:800});
  assert.deepEqual(avatarCrop(1200,800,{zoom:2}),{x:400,y:200,size:400});
  assert.deepEqual(avatarCrop(800,1200,{zoom:4,x:1,y:0}),{x:600,y:0,size:200});
  assert.deepEqual(avatarCrop(800,800,{zoom:0,x:-1,y:2}),{x:0,y:0,size:800});
});
test('종이가 길어져도 붙여둔 스티커의 종이 좌표와 크기는 그대로 유지한다',()=>{
  const d={layout:{version:1,width:600,height:400},stickers:[{x:.8,y:.75,scale:2,rotation:30,z:1}]};
  const before=stickerStyle(d.stickers[0],d.layout);
  growPaper(d,1200);
  assert.equal(d.stickers[0].y,.25);
  assert.equal(stickerStyle(d.stickers[0],d.layout),before);
  growPaper(d,240);
  assert.equal(d.layout.height,1200);
});
test('예전 일기 및 손상된 종이 치수는 고정 레이아웃으로 해석하지 않는다',()=>{
  assert.equal(paperLayout({}),null);
  assert.equal(paperLayout({layout:{version:1,width:Infinity,height:200}}),null);
  assert.equal(paperLayout({layout:{version:1,width:600,height:-1}}),null);
  assert.equal(blockHeight({blocks:{test:NaN}},'test'),0);
  assert.equal(blockHeight({blocks:{test:182}},'test'),182);
});
