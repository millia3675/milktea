import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createDeleteAccountHandler } from "./handler.js";

const url = Deno.env.get("SUPABASE_URL")!;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, options);
Deno.serve(createDeleteAccountHandler({
  admin,
  createAuthClient: () => createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, options),
}));
