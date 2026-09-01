import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { cancelAppointmentAndSettlePayment } from "@/lib/data/payments";

const updateAppointmentSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "NO_SHOW", "COMPLETED"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateAppointmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Cancelamento passa pela mesma rotina de acerto de sinal usada no
  // cancelamento público (reembolso automático dentro do prazo, ou
  // REFUND_PENDING pro dono decidir) — nunca só troca o status direto quando
  // pode haver um Payment PAID vinculado.
  if (parsed.data.status === "CANCELLED") {
    const existing = await prisma.appointment.findFirst({
      where: { id, barbershopId: staff.barbershopId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await cancelAppointmentAndSettlePayment(id);
  } else {
    const { count } = await prisma.appointment.updateMany({
      where: { id, barbershopId: staff.barbershopId },
      data: { status: parsed.data.status },
    });
    if (count === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  return NextResponse.json({ appointment });
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
  const { count } = await prisma.appointment.deleteMany({
    where: { id, barbershopId: staff.barbershopId },
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
