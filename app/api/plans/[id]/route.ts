import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const updatePlanSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  visitsPerMonth: z.number().int().positive().max(60).optional(),
  active: z.boolean().optional(),
});

// Toda query filtra por barbershopId do staff autenticado, nunca só pelo id
// da URL — mesmo padrão de app/api/services/[id]/route.ts.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updatePlanSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { count } = await prisma.barbershopPlan.updateMany({
    where: { id, barbershopId: staff.barbershopId },
    data: parsed.data,
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const plan = await prisma.barbershopPlan.findUnique({ where: { id } });
  return NextResponse.json({ plan });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const plan = await prisma.barbershopPlan.findFirst({
    where: { id, barbershopId: staff.barbershopId },
  });
  if (!plan) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Se algum cliente já foi matriculado nesse plano (mesmo cancelado depois),
  // apagar de vez perderia o histórico de quais agendamentos usaram crédito
  // dele — desativa em vez de apagar, mesmo padrão de Service.
  const hasEnrollments = await prisma.clientPlan.findFirst({ where: { planId: id } });
  if (hasEnrollments) {
    const deactivated = await prisma.barbershopPlan.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ deactivated: true, plan: deactivated });
  }

  await prisma.barbershopPlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
