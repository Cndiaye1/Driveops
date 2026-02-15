// src/services/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  (typeof process !== "undefined" ? process.env.VITE_SUPABASE_URL : "");

const anon =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== "undefined" ? process.env.VITE_SUPABASE_ANON_KEY : "");

export const SUPABASE_ENV_OK = !!(url && anon);

if (!SUPABASE_ENV_OK) {
  // eslint-disable-next-line no-console
  console.warn("[DriveOps] Missing env vars:", {
    VITE_SUPABASE_URL: !!url,
    VITE_SUPABASE_ANON_KEY: !!anon,
  });
}

export const supabase = SUPABASE_ENV_OK
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
