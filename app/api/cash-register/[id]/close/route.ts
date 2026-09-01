import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const closeSchema = z.object({
  countedClosingBalanceCents: z.number().int().nonnegative(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = closeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const cashRegister = await prisma.cashRegister.findFirst({
    where: { id, barbershopId: staff.barbershopId },
  });
  if (!cashRegister) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (cashRegister.status === "CLOSED") {
    return NextResponse.json({ error: "already_closed" }, { status: 409 });
  }

  // Esperado = saldo inicial + soma de todos os lançamentos (entradas
  // positivas, saídas negativas) — calculado no fechamento, não mantido
  // incrementalmente, pra sempre bater com o que está em CashMovement.
  const { _sum } = await prisma.cashMovement.aggregate({
    where: { cashRegisterId: id },
    _sum: { amountCents: true },
  });
  const expectedClosingBalanceCents = cashRegister.openingBalanceCents + (_sum.amountCents ?? 0);

  const updated = await prisma.cashRegister.update({
    where: { id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedByStaffId: staff.id,
      countedClosingBalanceCents: parsed.data.countedClosingBalanceCents,
      expectedClosingBalanceCents,
    },
  });

  return NextResponse.json({ cashRegister: updated });
}
