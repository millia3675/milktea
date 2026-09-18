import test from 'node:test';
import assert from 'node:assert/strict';
import { readingGaps } from '../src/paper-layout.js';

test('읽기 간격: 글·사진 뒤 편집용 높이만 제거하고 입력한 빈 줄은 내용 높이에 포함한다', () => {
  assert.deepEqual(readingGaps([
    { top: 3, bottom: 199, contentBottom: 113 },
    { top: 213, bottom: 753, contentBottom: 629 },
    { top: 767, bottom: 967, contentBottom: 990 },
  ], []), [
    { start: 113, end: 199, height: 86 },
    { start: 629, end: 753, height: 124 },
    { start: 967, end: 967, height: 0 },
  ]);
});

test('읽기 간격: 빈 공간의 스티커 및 경계를 가로지르는 회전 스티커를 자르지 않는다', () => {
  const block = { top: 0, bottom: 200, contentBottom: 80 };
  assert.deepEqual(readingGaps([block], [{ top: 90, bottom: 140 }]), [{ start: 148, end: 200, height: 52 }]);
  assert.deepEqual(readingGaps([block], [{ top: 180, bottom: 230 }]), [{ start: 200, end: 200, height: 0 }]);
  assert.deepEqual(readingGaps([block], [{ top: 200, bottom: 250 }]), [{ start: 80, end: 200, height: 120 }]);
});

test('읽기 간격: 여러 스티커의 순서와 소수점 오차에 관계없이 같은 여백을 계산한다', () => {
  const blocks = [{ top: 3, bottom: 203, contentBottom: 82.0000001 }];
  const stickers = [{ top: 85, bottom: 130.2 }, { top: 125, bottom: 185.2 }];
  assert.deepEqual(readingGaps(blocks, stickers), readingGaps(blocks, stickers.toReversed()));
  assert.deepEqual(readingGaps(blocks, stickers), [{ start: 194, end: 203, height: 9 }]);
  assert.deepEqual(readingGaps(blocks, []), [{ start: 82, end: 203, height: 121 }]);
});
