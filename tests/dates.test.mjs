import test from "node:test";
import assert from "node:assert/strict";
import {
  today,
  addDays,
  monthDays,
  changeMonth,
  weekDates,
  streak,
  validDate,
} from "../src/dates.js";
test("오늘은 접속 위치와 관계없이 한국 자정에 변경된다", () => {
  assert.equal(today(new Date("2026-09-13T14:59:59Z")), "2026-09-13");
  assert.equal(today(new Date("2026-09-13T15:00:00Z")), "2026-09-14");
});
test("실제 달력 날짜를 검증한다", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-09-31"), false);
  assert.equal(validDate("not-a-date"), false);
});
test("월말과 윤년의 다음 달 선택일", () => {
  assert.equal(changeMonth("2026-01-31", 1), "2026-02-28");
  assert.equal(changeMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(changeMonth("2026-12-31", 1), "2027-01-31");
  assert.equal(monthDays("2024-02"), 29);
});
test("월요일 시작 주간 기록은 연도 경계를 넘는다", () => {
  assert.deepEqual(weekDates("2027-01-01"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
});
test("하루 여러 편은 연참 한 번, 미래 날짜는 제외", () => {
  assert.equal(
    streak(
      ["2026-09-12", "2026-09-13", "2026-09-13", "2026-09-14", "2026-09-15"],
      "2026-09-14",
    ),
    3,
  );
});
test("오늘 아직 안 썼으면 어제의 연참을 유지한다", () => {
  assert.equal(
    streak(
      ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"],
      "2026-09-14",
    ),
    4,
  );
});
test("작성일 삭제와 밀린 기록의 영향", () => {
  assert.equal(
    streak(
      ["2026-09-10", "2026-09-11", "2026-09-13", "2026-09-14"],
      "2026-09-14",
    ),
    2,
  );
  assert.equal(streak(["2026-09-10", "2026-09-11"], "2026-09-14"), 0);
  assert.equal(streak([], "2026-09-14"), 0);
});
test("하루 이동은 월말과 연말에 안정적이다", () => {
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
});
