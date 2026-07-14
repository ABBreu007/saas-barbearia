import { cache } from "react";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// Resolve o Staff (barbeiro/dono) autenticado e sua barbearia a partir da
// sessão Supabase (cookie, usado pelo frontend) ou de um Bearer token
// explícito (usado por testes/clientes sem cookie, ex.: um futuro app
// mobile). Toda API route privada deve chamar isto primeiro e escopar
// TODAS as queries por staff.barbershopId — nunca confiar em um
// barbershopId vindo do corpo da requisição.
//
// Envolvido em React cache(): dentro de uma mesma requisição, o layout e a
// page chamam requireStaff() de forma independente — cache() garante que
// isso vira uma única consulta ao banco, não duas.
export const requireStaff = cache(async function requireStaff(
  request?: NextRequest
) {
  const supabase = await createClient();

  const bearerToken = request?.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  const {
    data: { user },
  } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const staff = await prisma.staff.findUnique({
    where: { authUserId: user.id },
    include: { barbershop: true },
  });

  return staff;
});
