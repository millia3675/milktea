import test from "node:test";
import assert from "node:assert/strict";
import { commentThreads, compareComments } from "../src/comment-threads.js";
const comment = (id, parent_id = null, created_at = "2026-09-16T01:00:00Z") => ({ id, parent_id, created_at, entry_id: "diary" });

test("기존 댓글과 답글을 대화별로 묶고 같은 시각도 일관된 순서로 정렬한다", () => {
  const input = [comment("d", "b"), comment("c", "a"), comment("b", "a"), comment("a"), comment("z")];
  const original = structuredClone(input);
  const threads = commentThreads(input, "diary");
  assert.deepEqual(threads.map(t => t.root.id), ["a", "z"]);
  assert.deepEqual(threads[0].replies.map(r => [r.comment.id, r.parent.id, r.depth]), [["b", "a", 1], ["d", "b", 2], ["c", "a", 1]]);
  assert.deepEqual(input, original);
});

test("오래된 댓글에 새 답글이 달리면 최근 대화로 선택한다", () => {
  const threads = commentThreads([comment("a"), comment("b"), comment("c"), comment("reply", "a", "2026-09-17T01:00:00Z")], "diary");
  const preview = threads.sort((a,b) => compareComments(a.latest,b.latest)).slice(-2);
  assert.deepEqual(preview.map(t => t.root.id), ["c", "a"]);
});

test("원댓글 삭제 후 답글과 그 자식은 유지하고 다른 일기는 섞지 않는다", () => {
  const threads = commentThreads([{ ...comment("b"), parent_deleted: true }, comment("c", "b"), { ...comment("x"), entry_id: "other" }, comment("orphan", "missing")], "diary");
  assert.equal(threads.length, 2);
  assert.equal(threads[0].root.parent_deleted, true);
  assert.equal(threads[0].replies[0].comment.id, "c");
});

test("답글 만 단계도 재귀 호출 없이 보존한다", () => {
  const input = Array.from({ length: 10001 }, (_, i) => comment(String(i), i ? String(i - 1) : null));
  const [thread] = commentThreads(input, "diary");
  assert.equal(thread.replies.length, 10000);
  assert.equal(thread.replies.at(-1).depth, 10000);
});

test("손상된 체험 데이터의 순환·자기 참조도 중복이나 무한 순회 없이 표시한다", () => {
  const threads = commentThreads([comment("a", "b"), comment("b", "a"), comment("c", "c")], "diary");
  const ids = threads.flatMap(t => [t.root.id, ...t.replies.map(r => r.comment.id)]);
  assert.deepEqual(ids.sort(), ["a", "b", "c"]);
});
