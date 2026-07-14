import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ phone: z.string().min(8).max(20) });

// Rota PÚBLICA que atende o direito de exclusão do titular (LGPD Art. 18)
// pro cliente final — mesmo modelo de "telefone como credencial informal"
// já usado em cancelamento/busca de agendamento (ver nota de segurança no
// README, seção 5).
//
// Anonimiza em vez de apagar de verdade: os agendamentos concluídos
// continuam contando pro faturamento/histórico da barbearia (ela tem
// interesse legítimo/obrigação contábil de manter esse registro), mas o
// nome e telefone do cliente somem. `phone` vira null (não uma string
// vazia) porque a constraint @@unique([barbershopId, phone]) trata cada
// NULL como distinto — não colide com outro cliente anonimizado depois.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  // Não revela se o telefone existe ou não na resposta — mesmo padrão de
  // "não vazar existência de conta" já usado no cadastro e no esqueci-senha.
  await prisma.client.updateMany({
    where: { barbershopId: barbershop.id, phone: parsed.data.phone },
    data: { name: "Cliente removido", phone: null, email: null },
  });

  return NextResponse.json({ ok: true });
}
