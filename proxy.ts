import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Mantém o cookie de sessão do Supabase Auth atualizado a cada requisição.
// (Next.js 16 renomeou "middleware" para "proxy" — mesma API.)
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Atualiza o token de sessão se estiver expirado.
  await supabase.auth.getUser();

  return response;
}

// Só roda nas rotas que exigem sessão de barbeiro (grupo (app) + suas APIs).
// Antes rodava em TODA requisição (inclusive a página pública de agendamento,
// /login, /signup e /api/public/**), o que somava um round-trip de rede ao
// Supabase Auth (supabase.auth.getUser()) em cada requisição desse tráfego
// público sem nenhum benefício — nada ali usa sessão de barbeiro. Isso era
// uma das causas reais de lentidão percebida. As rotas privadas continuam
// validando a sessão de novo em requireStaff() (lib/auth.ts) — este proxy só
// mantém o cookie de sessão fresco entre navegações, não substitui aquela
// checagem.
export const config = {
  matcher: [
    "/",
    "/agenda/:path*",
    "/servicos/:path*",
    "/painel/:path*",
    "/conta/:path*",
    "/clientes/:path*",
    "/api/appointments/:path*",
    "/api/services/:path*",
    "/api/metrics/:path*",
    "/api/business-hours/:path*",
    "/api/time-off/:path*",
    "/api/barbershop/:path*",
    "/api/upload/:path*",
  ],
};
