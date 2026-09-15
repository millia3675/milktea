import test from "node:test";
import assert from "node:assert/strict";
import {
  gestureSnapshot,
  transformGesture,
  normalizeRotation,
  resizeSnapshot,
  transformResize,
} from "../src/sticker-gestures.js";
const rect = { left: 100, top: 200, width: 400, height: 600 };
const sticker = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("한 손가락 이동은 종이 크기에 맞춰 저장한다", () => {
  const result = transformGesture(
    gestureSnapshot(sticker, [{ x: 300, y: 500 }], rect),
    [{ x: 340, y: 560 }],
  );
  near(result.x, 0.6);
  near(result.y, 0.6);
  assert.equal(result.scale, 1);
  assert.equal(result.rotation, 0);
});
test("두 손가락으로 동시에 이동·두 배 확대·90도 회전", () => {
  const start = gestureSnapshot(
    sticker,
    [
      { x: 250, y: 500 },
      { x: 350, y: 500 },
    ],
    rect,
  );
  const result = transformGesture(start, [
    { x: 320, y: 430 },
    { x: 320, y: 630 },
  ]);
  near(result.x, 0.55);
  near(result.y, 0.55);
  near(result.scale, 2);
  near(result.rotation, 90);
});
test("중심에서 벗어난 핀치는 손가락 사이 위치를 기준으로 변환한다", () => {
  const start = gestureSnapshot(
    sticker,
    [
      { x: 150, y: 500 },
      { x: 250, y: 500 },
    ],
    rect,
  );
  const result = transformGesture(start, [
    { x: 200, y: 400 },
    { x: 200, y: 600 },
  ]);
  near(result.x, 0.25);
  near(result.y, 5 / 6);
  near(result.scale, 2);
  near(result.rotation, 90);
});
test("저장 범위 안에서 확대·축소와 위치를 제한한다", () => {
  const start = gestureSnapshot(
    sticker,
    [
      { x: 250, y: 500 },
      { x: 350, y: 500 },
    ],
    rect,
  );
  assert.equal(
    transformGesture(start, [
      { x: -2000, y: 500 },
      { x: 2600, y: 500 },
    ]).scale,
    4,
  );
  assert.equal(
    transformGesture(start, [
      { x: 299, y: 500 },
      { x: 301, y: 500 },
    ]).scale,
    0.25,
  );
  assert.equal(
    transformGesture(gestureSnapshot(sticker, [{ x: 300, y: 500 }], rect), [
      { x: 900, y: -500 },
    ]).x,
    1,
  );
});
test("회전 경계를 넘어가도 방향이 이어지고 저장 가능한 각도가 된다", () => {
  near(normalizeRotation(190), -170);
  near(normalizeRotation(-190), 170);
  near(normalizeRotation(720), 0);
  const start = gestureSnapshot(
    { ...sticker, rotation: 170 },
    [
      { x: 250, y: 500 },
      { x: 350, y: 500 },
    ],
    rect,
  );
  const result = transformGesture(start, [
    { x: 300, y: 450 },
    { x: 300, y: 550 },
  ]);
  near(result.rotation, -100);
});
test("두 손가락에서 한 손가락으로 전환할 때 크기와 각도가 유지된다", () => {
  const changed = { x: 0.6, y: 0.4, scale: 2.3, rotation: -82 };
  const start = gestureSnapshot(changed, [{ x: 310, y: 450 }], rect);
  assert.deepEqual(transformGesture(start, [{ x: 310, y: 450 }]), changed);
  const next = transformGesture(start, [{ x: 330, y: 480 }]);
  near(next.x, 0.65);
  near(next.y, 0.45);
  assert.equal(next.scale, 2.3);
  assert.equal(next.rotation, -82);
});
test("두 손가락이 겹치거나 종이 크기가 0이어도 잘못된 수를 만들지 않는다", () => {
  const start = gestureSnapshot(
    sticker,
    [
      { x: 300, y: 500 },
      { x: 300, y: 500 },
    ],
    rect,
  );
  assert.ok(
    Object.values(
      transformGesture(start, [
        { x: 300, y: 500 },
        { x: 302, y: 500 },
      ]),
    ).every(Number.isFinite),
  );
  assert.deepEqual(
    transformGesture(
      gestureSnapshot(sticker, [{ x: 0, y: 0 }], { ...rect, width: 0 }),
      [{ x: 5, y: 5 }],
    ),
    sticker,
  );
});

test("회전된 스티커의 네 모서리에서 반대 모서리와 비율을 유지하며 확대한다", () => {
  for (const rotation of [0, 35, 90, -135]) {
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const start = resizeSnapshot(
        { ...sticker, rotation },
        { x: 335, y: 521 },
        rect,
        corner,
        { width: 100, height: 60 },
      );
      const next = transformResize(start, {
        x: 335 + start.diagonal.x / 2,
        y: 521 + start.diagonal.y / 2,
      });
      near(next.scale, 1.5);
      near(next.rotation, rotation);
      near(
        next.x * rect.width - (start.diagonal.x * 1.5) / 2,
        sticker.x * rect.width - start.diagonal.x / 2,
      );
      near(
        next.y * rect.height - (start.diagonal.y * 1.5) / 2,
        sticker.y * rect.height - start.diagonal.y / 2,
      );
    }
  }
});

test("모서리 클릭 위치가 어긋나도 시작 시 점프하지 않고 옆으로 당겨도 회전하지 않는다", () => {
  const start = resizeSnapshot(sticker, { x: 360, y: 545 }, rect, "se", {
    width: 100,
    height: 60,
  });
  assert.deepEqual(transformResize(start, { x: 360, y: 545 }), sticker);
  const next = transformResize(start, { x: 300, y: 645 });
  assert.deepEqual(next, sticker);
});

test("모서리 축소·확대 제한과 반대편으로 넘겨 끌 때 뒤집힘 방지", () => {
  const start = resizeSnapshot(sticker, { x: 350, y: 530 }, rect, "se", {
    width: 100,
    height: 60,
  });
  const smaller = transformResize(start, { x: 325, y: 515 });
  near(smaller.scale, 0.75);
  near(smaller.x, 0.46875);
  near(smaller.y, 0.4875);
  const minimum = transformResize(start, { x: -500, y: -500 });
  assert.equal(minimum.scale, 0.25);
  assert.equal(minimum.rotation, 0);
  assert.equal(transformResize(start, { x: 5000, y: 5000 }).scale, 4);
});

test("이미지 크기가 없거나 캔버스 크기가 0인 동안 크기 조절을 보류한다", () => {
  for (const [canvas, size] of [
    [rect, { width: 0, height: 0 }],
    [
      { ...rect, height: 0 },
      { width: 100, height: 60 },
    ],
  ]) {
    const start = resizeSnapshot(
      sticker,
      { x: 350, y: 530 },
      canvas,
      "se",
      size,
    );
    assert.deepEqual(transformResize(start, { x: 400, y: 580 }), sticker);
  }
});
