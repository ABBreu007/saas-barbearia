import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { getClientPlanCredits } from "@/lib/client-plans";

// Usado pelo modal de "nova marcação" da Agenda: ao digitar o telefone,
// busca se já existe um cliente com esse número e, se tiver plano ativo,
// quantos créditos restam no ciclo — pra mostrar a opção de usar crédito
// antes mesmo de submeter o agendamento.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { barbershopId_phone: { barbershopId: staff.barbershopId, phone } },
  });
  if (!client) {
    return NextResponse.json({ client: null, clientPlan: null });
  }

  const clientPlan = await prisma.clientPlan.findFirst({
    where: { clientId: client.id, status: "ACTIVE" },
    include: { plan: true },
  });
  if (!clientPlan) {
    return NextResponse.json({ client, clientPlan: null });
  }

  const credits = await getClientPlanCredits(clientPlan);
  return NextResponse.json({ client, clientPlan: { ...clientPlan, ...credits } });
}
