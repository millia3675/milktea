import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createAdminInviteHandler } from "./handler.js";
const projectURL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(projectURL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
Deno.serve(createAdminInviteHandler({ admin, projectURL }));
