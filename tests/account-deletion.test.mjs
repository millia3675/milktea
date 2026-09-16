import test from "node:test";
import assert from "node:assert/strict";
import { createDeleteAccountHandler } from "../supabase/functions/delete-account/handler.js";

function fixture({ tokenError, passwordError, passwordUser = "self", storageError, finishError } = {}) {
  const calls = [];
  let files = [{ bucket_id: "stickers", object_path: "self/one.webp" },
    { bucket_id: "fonts", object_path: "self/font.woff2" }];
  const ok = data => ({ data, error: null });
  const handler = createDeleteAccountHandler({
    admin: {
      auth: {
        getUser: async () => tokenError ? { error: tokenError } : ok({ user: { id: "self", email: "self@example.invalid" } }),
        admin: { deleteUser: async id => { calls.push(["deleteUser", id]); return ok({}); } },
      },
      rpc: async (name, args) => {
        calls.push([name, args.p_user_id]);
        if (name === "account_deletion_objects") return ok(files);
        if (name === "finish_account_deletion" && finishError) return { error: finishError };
        return ok(null);
      },
      storage: { from: bucket => ({ remove: async paths => {
        calls.push(["remove", bucket, paths]);
        if (storageError) return { error: storageError };
        files = files.filter(f => f.bucket_id !== bucket || !paths.includes(f.object_path));
        return ok([]);
      } }) },
    },
    createAuthClient: () => ({ auth: {
      signInWithPassword: async args => { calls.push(["password", args.email]); return passwordError ? { error: passwordError } : ok({ user: { id: passwordUser } }); },
      signOut: async () => { calls.push(["signOut"]); return ok({}); },
    } }),
  });
  const send = (body = { password: "current-password", confirmation: "계정 삭제", expected_user_id: "self" }, headers = {}, method = "POST") => handler(new Request("https://example.invalid/delete-account", {
    method, headers: { authorization: "Bearer example", origin: "https://millia3675.github.io", ...headers },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  }));
  return { calls, send };
}
test("계정 삭제: 비로그인·만료된 토큰은 아무것도 변경하지 않는다", async () => {
  const missing = fixture();
  assert.equal((await missing.send(undefined, { authorization: "" })).status, 401);
  assert.deepEqual(missing.calls, []);
  const f = fixture({ tokenError: { status: 401 } });
  assert.equal((await f.send()).status, 401); assert.deepEqual(f.calls, []);
});
test("계정 삭제: 타인 ID·이메일·누락된 확인·잘못된 JSON을 거부한다", async () => {
  for (const body of [{ password: "pw", confirmation: "계정 삭제", expected_user_id: "self", user_id: "friend" },
    { password: "pw", confirmation: "계정 삭제", email: "friend@example.invalid" },
    { password: "pw", confirmation: "계정 삭제", expected_user_id: "friend" },
    { password: "pw", confirmation: "삭제" }, "{bad json", null]) {
    const f = fixture(); assert.equal((await f.send(body)).status, 400); assert.deepEqual(f.calls, []);
  }
});
test("계정 삭제: 잘못된 비밀번호와 다른 인증 계정은 삭제를 시작하지 않는다", async () => {
  for (const options of [{ passwordError: { code: "invalid_credentials", status: 400 } }, { passwordUser: "friend" }]) {
    const f = fixture(options); assert.equal((await f.send()).status, 403);
    assert(!f.calls.some(([name]) => name === "begin_account_deletion"));
  }
});
test("계정 삭제: 외부 출처·GET을 거부하고 사전 요청은 변경 없이 허용한다", async () => {
  const f = fixture();
  assert.equal((await f.send(undefined, { origin: "https://evil.invalid" })).status, 403);
  assert.equal((await f.send(undefined, {}, "GET")).status, 405);
  const res = await f.send(undefined, {}, "OPTIONS"); assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://millia3675.github.io");
  assert.deepEqual(f.calls, []);
});
test("계정 삭제: 본인 확인 → 접근 차단 → 모든 파일 → 기록 → Auth 순서로 처리한다", async () => {
  const f = fixture(); const res = await f.send(); assert.equal(res.status, 200);
  assert.equal((await res.json()).deleted, true);
  assert.deepEqual(f.calls.map(([name]) => name), ["password", "signOut", "begin_account_deletion", "account_deletion_objects", "remove", "remove", "account_deletion_objects", "finish_account_deletion", "deleteUser"]);
  assert.equal(f.calls.at(-1)[1], "self");
});
test("계정 삭제: 파일 처리 실패에는 로그인 계정을 남겨 재시도할 수 있다", async () => {
  const f = fixture({ storageError: {} }); const res = await f.send();
  assert.equal(res.status, 503); assert.equal((await res.json()).code, "DELETION_PENDING");
  assert(!f.calls.some(([name]) => ["finish_account_deletion", "deleteUser"].includes(name)));
});
test("계정 삭제: DB 정리 실패에는 Auth를 먼저 삭제하지 않는다", async () => {
  const f = fixture({ finishError: {} }); const res = await f.send();
  assert.equal(res.status, 503); assert.equal((await res.json()).code, "DELETION_PENDING");
  assert(!f.calls.some(([name]) => name === "deleteUser"));
});
