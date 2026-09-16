const origins = new Set([
  "https://millia3675.github.io", "http://127.0.0.1:5173", "http://127.0.0.1:4173",
]);
const messages = {
  AUTH_REQUIRED: "로그인이 만료됐어요. 다시 로그인한 뒤 시도해주세요.",
  INVALID_REQUEST: "현재 비밀번호와 ‘계정 삭제’ 확인 문구를 입력해주세요.",
  PASSWORD_INCORRECT: "현재 비밀번호가 맞지 않아요. 다시 확인해주세요.",
  TRY_LATER: "지금은 본인 확인을 마칠 수 없어요. 잠시 후 다시 시도해주세요.",
  DELETION_PENDING: "삭제를 시작했지만 아직 마치지 못했어요. 계정 접근은 차단되었으며 일부 자료가 삭제됐을 수 있어요. 잠시 후 삭제를 다시 진행해주세요.",
};
export function createDeleteAccountHandler({ admin, createAuthClient }) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const headers = {
      "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...(origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    };
    const respond = (status, code, extra = {}) => new Response(JSON.stringify({
      code, ...(messages[code] ? { message: messages[code] } : {}), ...extra,
    }), { status, headers });
    if (origin && !origins.has(origin)) return respond(403, "FORBIDDEN_ORIGIN");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return respond(405, "METHOD_NOT_ALLOWED");
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return respond(401, "AUTH_REQUIRED");
    let started = false;
    try {
      // getUser checks the actual Auth user; trusting decoded JWT claims alone is insufficient.
      const { data, error } = await admin.auth.getUser(token);
      const user = data?.user;
      if (error || !user?.id || !user.email) return respond(401, "AUTH_REQUIRED");
      if (Number(request.headers.get("content-length")) > 8192) return respond(400, "INVALID_REQUEST");
      const text = await request.text();
      if (text.length > 8192) return respond(400, "INVALID_REQUEST");
      let body;
      try { body = JSON.parse(text); } catch { return respond(400, "INVALID_REQUEST"); }
      if (!body || Object.keys(body).some(key => !["password", "confirmation", "expected_user_id"].includes(key)) ||
          body.expected_user_id !== user.id ||
          body.confirmation !== "계정 삭제" || typeof body.password !== "string" ||
          !body.password || body.password.length > 4096) return respond(400, "INVALID_REQUEST");
      // A separate short-lived client avoids replacing the browser session or the admin context.
      const auth = createAuthClient();
      let verified;
      try {
        verified = await auth.auth.signInWithPassword({ email: user.email, password: body.password });
      } finally {
        body.password = "";
      }
      if (verified.error || verified.data?.user?.id !== user.id) {
        return respond(verified.error?.status === 429 ? 429 : 403,
          verified.error?.code === "invalid_credentials" ? "PASSWORD_INCORRECT" : "TRY_LATER");
      }
      await auth.auth.signOut({ scope: "local" });
      const check = (result) => { if (result.error) throw new Error("DELETION_STEP_FAILED"); return result.data; };
      check(await admin.rpc("begin_account_deletion", { p_user_id: user.id }));
      started = true;
      // List from Storage metadata, including uploads that failed before media_assets registration.
      // Always fetch from the beginning after removing a batch, so pagination cannot skip objects.
      for (let batch = 0; ; batch++) {
        const objects = check(await admin.rpc("account_deletion_objects", { p_user_id: user.id }));
        if (!objects.length) break;
        if (batch >= 50) throw new Error("CONTINUE_DELETION");
        const buckets = new Map();
        for (const object of objects) {
          if (!buckets.has(object.bucket_id)) buckets.set(object.bucket_id, []);
          buckets.get(object.bucket_id).push(object.object_path);
        }
        for (const [bucket, paths] of buckets) check(await admin.storage.from(bucket).remove(paths));
      }
      check(await admin.rpc("finish_account_deletion", { p_user_id: user.id }));
      check(await admin.auth.admin.deleteUser(user.id));
      return respond(200, "ACCOUNT_DELETED", { deleted: true });
    } catch {
      // Never log passwords, tokens or user data. Pending jobs are retained for a safe retry.
      return respond(503, started ? "DELETION_PENDING" : "TRY_LATER");
    }
  };
}
