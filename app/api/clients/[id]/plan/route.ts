import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const enrollSchema = z.object({
  planId: z.string().min(1),
});

// Matricula o cliente `id` num BarbershopPlan — cria um ClientPlan novo com
// cycleStart agora. Só permite se o cliente não tiver já um ClientPlan
// ACTIVE (evita duas assinaturas concorrentes pro mesmo cliente).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  const parsed = enrollSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, barbershopId: staff.barbershopId },
  });
  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const plan = await prisma.barbershopPlan.findFirst({
    where: { id: parsed.data.planId, barbershopId: staff.barbershopId, active: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const existingActive = await prisma.clientPlan.findFirst({
    where: { clientId, status: { in: ["PENDING", "ACTIVE"] } },
  });
  if (existingActive) {
    return NextResponse.json({ error: "already_enrolled" }, { status: 409 });
  }

  // Matrícula direta pelo barbeiro (ex.: cliente pagou pessoalmente, sem
  // passar pelo pedido da página pública) já nasce ACTIVE — diferente do
  // pedido público, que nasce PENDING e precisa de PATCH pra aprovar.
  const clientPlan = await prisma.clientPlan.create({
    data: {
      barbershopId: staff.barbershopId,
      clientId,
      planId: plan.id,
      cycleStart: new Date(),
      status: "ACTIVE",
    },
    include: { plan: true },
  });

  return NextResponse.json({ clientPlan }, { status: 201 });
}

// Aprova a solicitação PENDING do cliente `id` (feita pela página
// pública) — vira ACTIVE e o cycleStart é resetado pro momento da
// aprovação, não o do pedido, pra não descontar dias de espera do
// primeiro ciclo de créditos do cliente.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  const { count } = await prisma.clientPlan.updateMany({
    where: { clientId, barbershopId: staff.barbershopId, status: "PENDING" },
    data: { status: "ACTIVE", cycleStart: new Date() },
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// Cancela o ClientPlan ACTIVE do cliente `id`, ou recusa um PENDING —
// mesma ação nos dois casos (mantém a linha, só muda o status; histórico
// de agendamentos que usaram crédito dele continua válido).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: clientId } = await params;
  const client = await prisma.client.findFirst({
    where: { id: clientId, barbershopId: staff.barbershopId },
  });
  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { count } = await prisma.clientPlan.updateMany({
    where: { clientId, barbershopId: staff.barbershopId, status: { in: ["PENDING", "ACTIVE"] } },
    data: { status: "CANCELED" },
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
