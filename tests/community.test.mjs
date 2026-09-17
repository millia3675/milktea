import test from "node:test";
import assert from "node:assert/strict";
import { dailyQuestion, dailyQuestionCount, validQuestion } from "../src/daily-question.js";
import { today, addDays } from "../src/dates.js";
import { decorationSnapshot, applyDecoration } from "../src/template-data.js";
import { createAdminInviteHandler } from "../supabase/functions/admin-invite/handler.js";
test("오늘의 질문은 한국 날짜를 공유하고, 사용자가 제공한 질문을 중복 없이 순환한다", () => {
  const midnight = today(new Date("2026-09-16T15:00:00Z"));
  assert.equal(midnight, "2026-09-17");
  assert.notEqual(dailyQuestion(midnight).text, dailyQuestion(addDays(midnight, -1)).text);
  assert(dailyQuestionCount > 170);
  assert.equal(dailyQuestion(midnight).text, "오늘 하루 CCTV를 돌려봤을 때 제일 남에게 보여주기 싫은 장면은?");
  assert.equal(new Set(Array.from({ length: dailyQuestionCount }, (_, n) => dailyQuestion(addDays(midnight, n)).text)).size, dailyQuestionCount);
  assert.deepEqual(dailyQuestion(midnight), dailyQuestion(midnight));
  assert.throws(() => dailyQuestion("2026-02-30"));
  assert.equal(validQuestion({ date: midnight, text: "" }), false);
  assert.equal(validQuestion(null), true);
});
test("서식은 장식과 절대 배치만 복사하고 개인 내용·사진·질문·음악을 제외한다", () => {
  const doc = { version: 1, paper: "cream", font: "handwriting", stickers: [{ id: "old", asset_id: "asset", x: .5, y: .2, scale: 1.2, rotation: 12, z: 2 }],
    layout: { version: 1, width: 800, height: 900, blocks: { private: 400 } },
    blocks: [{ text: "개인 기록" }], music: { title: "음악" }, habits: [1], question: dailyQuestion(), extra: "비공개" };
  const decoration = decorationSnapshot(doc);
  for (const key of ["blocks", "music", "habits", "question", "extra"]) assert(!Object.hasOwn(decoration, key));
  assert(!Object.hasOwn(decoration.layout, "blocks"));
  const blank = { blocks: [{ id: "new-text", type: "text", text: "" }], habits: [], music: null };
  const next = applyDecoration(blank, decoration, () => "new-sticker");
  assert.deepEqual(next.blocks, blank.blocks);
  assert.equal(next.stickers[0].id, "new-sticker");
  assert.equal(next.stickers[0].y * next.layout.height, 180);
  next.stickers[0].y = .9;
  assert.equal(decoration.stickers[0].y, .2);
  assert.equal(doc.layout.blocks.private, 400);
});
function fixture({ authorized = true, validToken = true, existing = null, allowed = true, badDestination = false, failApproval = false } = {}) {
  const calls = [];
  const email = "milktea-test@example.invalid", projectURL = "https://example.supabase.co";
  const admin = {
    auth: { getUser: async token => { calls.push(["auth", token]); return validToken ? { data: { user: { id: "admin-id" } } } : { error: new Error("expired") }; }, admin: {
      listUsers: async () => { calls.push(["list"]); return { data: { users: existing ? [{ id: "recipient", email, ...existing }] : [] } }; },
      generateLink: async args => { calls.push(["generate", args]); return { data: { user: { id: "recipient", email, ...existing }, properties: {
        hashed_token: "a".repeat(64), action_link: `${badDestination ? "https://evil.example" : projectURL}/auth/v1/verify?${new URLSearchParams({ redirect_to: args.options.redirectTo, type: args.type })}`,
      } } }; },
    } },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "is_milktea_admin") return { data: authorized };
      if (name === "invitation_allowed") return { data: allowed };
      if (name === "approve_invited_member") return failApproval ? { error: new Error("denied") } : { data: null };
      throw new Error("Unexpected RPC");
    },
  };
  const handler = createAdminInviteHandler({ admin, projectURL });
  const send = (body = { email }, options = {}) => handler(new Request("https://function.example/admin-invite", { method: options.method || "POST", headers: { authorization: "Bearer token", origin: "https://millia3675.github.io", ...options.headers }, ...(options.method === "GET" || options.method === "OPTIONS" ? {} : { body: JSON.stringify(body) }) }));
  return { calls, send, email };
}
test("초대: 서버 권한 없는 계정·만료 토큰·외부 출처는 사용자 조회 전에 거부한다", async () => {
  for (const [options, status] of [[{ authorized: false }, 403], [{ validToken: false }, 401]]) {
    const f = fixture(options); assert.equal((await f.send()).status, status); assert(!f.calls.some(c => c[0] === "list"));
  }
  const f = fixture();
  assert.equal((await f.send(undefined, { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await f.send(undefined, { headers: { authorization: "" } })).status, 401);
  assert.equal((await f.send(undefined, { method: "GET" })).status, 405);
  assert.equal((await f.send(undefined, { method: "OPTIONS" })).status, 204);
  assert.equal(f.calls.length, 0);
});
test("초대: 잘못된 주소·대리 권한·과대 요청을 거부한다", async () => {
  for (const body of [{ email: "bad" }, { email: "a@b.co", role: "admin" }, { email: "a".repeat(3000) }, { email: "a@b.co", recovery: "yes" }, null]) {
    const f = fixture(); assert.equal((await f.send(body)).status, 400); assert(!f.calls.some(c => c[0] === "generate"));
  }
});
test("초대: 승인 후 수동 확인 링크를 반환하며 링크를 소비하거나 메일을 발송하지 않는다", async () => {
  const f = fixture(); const response = await f.send(); assert.equal(response.status, 200);
  const result = await response.json(); const url = new URL(result.invitationLink);
  assert.equal(url.origin, "https://millia3675.github.io"); assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("email"), f.email);
  assert.deepEqual(f.calls.map(c => c[0]), ["auth", "is_milktea_admin", "list", "generate", "approve_invited_member"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("초대: 가입 완료자는 자동 재설정하지 않고, 명시한 재설정만 만든다", async () => {
  const f = fixture({ existing: { email_confirmed_at: "2026-09-16" } });
  assert.equal((await (await f.send()).json()).invitationLink, null);
  assert(!f.calls.some(c => c[0] === "generate"));
  const result = await (await f.send({ email: f.email, recovery: true })).json();
  assert.equal(result.type, "recovery");
});
test("초대: 삭제·이용중지 계정, 잘못된 응답 주소, 승인 실패에는 링크를 반환하지 않는다", async () => {
  for (const [options, status] of [[{ existing: {}, allowed: false }, 409], [{ badDestination: true }, 503], [{ failApproval: true }, 503]]) {
    const f = fixture(options); const response = await f.send(); assert.equal(response.status, status);
    assert(!(await response.json()).invitationLink);
  }
});
