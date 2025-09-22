import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ServerSupabaseClient = SupabaseClient<unknown, "public", unknown>;

let cachedClient: ServerSupabaseClient | null = null;

export function getSupabaseServerClient(): ServerSupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
