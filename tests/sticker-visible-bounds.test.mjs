import test from 'node:test';
import assert from 'node:assert/strict';
import {alphaBounds, transformVisibleBounds} from '../src/sticker-visible-bounds.js';
test('스티커의 투명 테두리를 제외하고 반투명 픽셀과 가장자리 여유를 보존한다',()=>{
  const pixels=new Uint8ClampedArray(10*10*4);
  pixels[(6*10+3)*4+3]=1;pixels[(8*10+7)*4+3]=255;
  assert.deepEqual(alphaBounds(pixels,10,10),{left:.2,top:.5,right:.9,bottom:1});
  assert.equal(alphaBounds(new Uint8ClampedArray(16),2,2),null);
  assert.deepEqual(alphaBounds(new Uint8ClampedArray(16).fill(255),2,2),{left:0,top:0,right:1,bottom:1});
});
test('확대·회전·화면 축소 시 보이는 스티커 경계를 같은 좌표계로 변환한다',()=>{
  const bounds={left:.25,top:.5,right:.75,bottom:1};
  assert.deepEqual(transformVisibleBounds(bounds,100,80,{a:4,b:0,c:0,d:4},{x:200,y:300},.5),{left:150,right:250,top:300,bottom:380,width:100,height:80});
  assert.deepEqual(transformVisibleBounds(bounds,100,80,{a:0,b:4,c:-4,d:0},{x:200,y:300},.5),{left:120,right:200,top:250,bottom:350,width:80,height:100});
});
