import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientPlanCredits } from "@/lib/client-plans";

const querySchema = z.object({ phone: z.string().min(8).max(20) });

// GET público — o cliente final busca os próprios agendamentos futuros por
// telefone. Não há login de cliente nesta MVP: o telefone funciona como
// credencial informal, com o mesmo nível de confiança do botão "Cancelar"
// mostrado logo após o agendamento (ver book/route.ts). Documentado como
// limitação conhecida no README.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ phone: searchParams.get("phone") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      barbershopId: barbershop.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      endTime: { gte: new Date() },
      client: { phone: parsed.data.phone },
    },
    include: { service: true },
    orderBy: { startTime: "asc" },
  });

  // Plano de assinatura desse telefone, se houver (PENDING ou ACTIVE) —
  // a página pública usa isso pra mostrar "aguardando aprovação" ou
  // "N créditos restantes", sem precisar de uma segunda rota.
  const client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId: barbershop.id, phone: parsed.data.phone } },
  });
  const rawClientPlan = client
    ? await prisma.clientPlan.findFirst({
        where: { clientId: client.id, status: { in: ["PENDING", "ACTIVE"] } },
        include: { plan: true },
      })
    : null;
  const clientPlan =
    rawClientPlan && rawClientPlan.status === "ACTIVE"
      ? { ...rawClientPlan, ...(await getClientPlanCredits(rawClientPlan)) }
      : rawClientPlan;

  return NextResponse.json({ appointments, clientPlan, client: client ? { name: client.name } : null });
}
