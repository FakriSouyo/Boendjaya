import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);
// This POS currently has no authentication screen. Disable persisted sessions so
// a stale browser JWT cannot override the anon key and cause REST 401 responses.
export const supabase = isSupabaseConfigured ? createClient(url!, key!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  // Explicitly supply the anon JWT for every REST/RPC request. This avoids the
  // default auth client substituting an expired browser session token.
  accessToken: async () => key!,
}) : null;
