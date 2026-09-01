import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

// Lançamento manual (sangria, despesa, ajuste) — vendas (SALE) são criadas
// automaticamente ao fechar uma comanda (ver app/api/orders/route.ts), não
// por aqui.
const movementSchema = z.object({
  type: z.enum(["EXPENSE", "WITHDRAWAL", "ADJUSTMENT"]),
  amountCents: z.number().int(),
  description: z.string().max(140).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = movementSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const cashRegister = await prisma.cashRegister.findFirst({
    where: { id, barbershopId: staff.barbershopId, status: "OPEN" },
  });
  if (!cashRegister) {
    return NextResponse.json({ error: "not_found_or_closed" }, { status: 404 });
  }

  // Saídas (despesa/sangria) sempre negativas no ledger, mesmo que o barbeiro
  // digite um valor positivo no formulário — normaliza aqui pra somar direto
  // no fechamento sem depender de disciplina do client.
  const signedAmountCents =
    parsed.data.type === "ADJUSTMENT" ? parsed.data.amountCents : -Math.abs(parsed.data.amountCents);

  const movement = await prisma.cashMovement.create({
    data: {
      barbershopId: staff.barbershopId,
      cashRegisterId: id,
      type: parsed.data.type,
      amountCents: signedAmountCents,
      description: parsed.data.description,
      createdByStaffId: staff.id,
    },
  });

  return NextResponse.json({ movement }, { status: 201 });
}
