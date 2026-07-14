import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para uso no browser (componentes "use client").
// Usa a chave anônima — respeita as policies de RLS do usuário autenticado.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
