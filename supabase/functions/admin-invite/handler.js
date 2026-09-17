const callback = "https://millia3675.github.io/milktea/auth-callback.html";
const origins = new Set(["https://millia3675.github.io", "http://127.0.0.1:5173", "http://127.0.0.1:4173"]);
export function createAdminInviteHandler({ admin, projectURL }) {
  return async request => {
    const origin = request.headers.get("origin");
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
    if (origins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.has(origin)) return reply(403, { message: "밀크티 관리자 화면에서 다시 시도해주세요." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { message: "지원하지 않는 요청이에요." });
    const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401, { message: "다시 로그인해주세요." });
    try {
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      if (authError || !auth?.user) return reply(401, { message: "다시 로그인해주세요." });
      const permission = await admin.rpc("is_milktea_admin", { p_user_id: auth.user.id });
      if (permission.error) throw permission.error;
      if (permission.data !== true) return reply(403, { message: "관리자만 초대 링크를 만들 수 있어요." });
      const raw = await request.text();
      if (raw.length > 2048) return reply(400, { message: "이메일 주소를 확인해주세요." });
      let body;
      try { body = JSON.parse(raw); } catch { return reply(400, { message: "이메일 주소를 확인해주세요." }); }
      if (!body || Array.isArray(body) || typeof body.email !== "string" ||
          Object.keys(body).some(k => !["email", "recovery"].includes(k)) ||
          (body.recovery !== undefined && typeof body.recovery !== "boolean"))
        return reply(400, { message: "이메일 주소를 확인해주세요." });
      const email = body.email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return reply(400, { message: "올바른 이메일 주소를 입력해주세요." });
      let user;
      for (let page = 1; page <= 100; page++) {
        const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (result.error) throw result.error;
        user = result.data.users.find(u => u.email?.toLowerCase() === email);
        if (user || result.data.users.length < 100) break;
        if (page === 100) throw new Error("INVITE_LOOKUP_LIMIT");
      }
      if (user) {
        const allowed = await admin.rpc("invitation_allowed", { p_user_id: user.id });
        if (allowed.error) throw allowed.error;
        if (!allowed.data) return reply(409, { message: "이용이 중지되었거나 삭제 중인 계정이에요." });
      }
      if (user?.email_confirmed_at && !body.recovery)
        return reply(200, { email, alreadyRegistered: true, invitationLink: null });
      const type = user?.email_confirmed_at ? "recovery" : "invite";
      const result = await admin.auth.admin.generateLink({ type, email, options: { redirectTo: callback } });
      if (result.error) throw result.error;
      user = result.data.user;
      const props = result.data.properties;
      const action = new URL(props.action_link);
      if (user?.email?.toLowerCase() !== email || !user.id || action.origin !== projectURL ||
          action.pathname !== "/auth/v1/verify" || action.searchParams.get("redirect_to") !== callback ||
          action.searchParams.get("type") !== type || !/^[a-f0-9]{40,128}$/i.test(props.hashed_token))
        throw new Error("INVALID_INVITATION_RESPONSE");
      const membership = await admin.rpc("approve_invited_member", { p_user_id: user.id });
      if (membership.error) throw membership.error;
      // Do not fetch this URL. Verification happens only on password submission.
      const invitationLink = `${callback}#${new URLSearchParams({ token_hash: props.hashed_token, type, email })}`;
      return reply(200, { email, alreadyRegistered: !!user.email_confirmed_at, invitationLink, type });
    } catch {
      return reply(503, { message: "초대 링크를 만들지 못했어요. 잠시 후 다시 시도해주세요." });
    }
  };
}
