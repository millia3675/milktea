import test from "node:test";
import assert from "node:assert/strict";
import {
  stickerInsertionPosition,
  isRetiredSticker,
} from "../src/sticker-placement.js";
const viewport = { top: 80, bottom: 780, left: 20, right: 1420 };
test("긴 일기의 첫 화면에서 스티커를 화면 안에 배치한다", () => {
  const paper = { left: 300, top: 300, width: 700, height: 20000 };
  const p = stickerInsertionPosition(paper, viewport);
  assert.ok(p.y < 0.03);
  assert.equal(paper.top + p.y * paper.height, 540);
});
test("스크롤한 긴 일기는 지금 보이는 본문의 중심을 사용한다", () => {
  const paper = { left: 300, top: -9500, width: 700, height: 20000 };
  const p = stickerInsertionPosition(paper, viewport);
  assert.equal(paper.top + p.y * paper.height, 430);
});
test("모바일 하단 도구에서 추가하면 본문의 끝쪽으로 돌아간다", () => {
  const paper = { left: 35, top: -22000, width: 320, height: 18000 };
  const p = stickerInsertionPosition(paper, { ...viewport, right: 370 });
  assert.equal(paper.height - p.y * paper.height, 64);
});
test("본문 위에서 고르면 본문의 시작에 배치한다", () => {
  const p = stickerInsertionPosition(
    { left: 35, top: 1000, width: 320, height: 9000 },
    viewport,
  );
  assert.equal(p.y * 9000, 64);
});
test("짧은 종이와 잘못된 크기도 유효한 좌표를 반환한다", () => {
  assert.deepEqual(
    stickerInsertionPosition(
      { left: 100, top: 100, width: 80, height: 80 },
      viewport,
    ),
    { x: 0.5, y: 0.5 },
  );
  assert.deepEqual(
    stickerInsertionPosition(
      { left: 0, top: 0, width: 0, height: 0 },
      viewport,
    ),
    { x: 0.5, y: 0.5 },
  );
});
test("퇴역한 기본 이모지만 숨기며 사용자 자료와 프로필은 유지한다", () => {
  assert.equal(isRetiredSticker({ kind: "sticker", name: "기본 🌙" }), true);
  assert.equal(
    isRetiredSticker({ kind: "sticker", name: "기본 뚜씨티콘 · 커피" }),
    false,
  );
  assert.equal(
    isRetiredSticker({ kind: "sticker", name: "내 별 스티커" }),
    false,
  );
  assert.equal(isRetiredSticker({ kind: "avatar", name: "기본 🌙" }), false);
});
