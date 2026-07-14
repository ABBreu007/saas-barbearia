import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase com a service role key — ignora RLS.
// Usar SOMENTE em API routes de servidor, nunca importar em código de cliente,
// e sempre filtrar manualmente por barbershopId ao consultar dados com este cliente.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
