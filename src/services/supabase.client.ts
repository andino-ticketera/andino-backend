import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

function ensureSupabaseConfig(): void {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
    throw new AppError(
      500,
      "AUTH_CONFIG_INVALID",
      "Faltan variables de entorno de Supabase",
    );
  }
}

let supabaseAnonClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAnonClient(): SupabaseClient {
  ensureSupabaseConfig();

  if (!supabaseAnonClient) {
    supabaseAnonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseAnonClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  ensureSupabaseConfig();

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      env.supabaseUrl,
      env.supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  return supabaseAdminClient;
}
