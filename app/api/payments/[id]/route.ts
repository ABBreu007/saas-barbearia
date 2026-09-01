import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { refundPaymentNow } from "@/lib/data/payments";

const bodySchema = z.object({ action: z.enum(["refund", "deny"]) });

// Resolve uma pendência de reembolso (REFUND_PENDING) — só o dono decide.
// "refund" chama o estorno de verdade na SDK do Mercado Pago; "deny" só
// marca que o valor fica retido (ex.: cliente cancelou em cima da hora e o
// dono decidiu não devolver), sem nenhuma chamada externa.
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
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const payment = await prisma.payment.findFirst({
    where: { id, barbershopId: staff.barbershopId, status: "REFUND_PENDING" },
  });
  if (!payment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (parsed.data.action === "deny") {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUND_DENIED" },
    });
    return NextResponse.json({ payment: updated });
  }

  try {
    await refundPaymentNow(payment.id, payment.mpPaymentId);
  } catch {
    return NextResponse.json({ error: "refund_failed" }, { status: 502 });
  }
  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  return NextResponse.json({ payment: updated });
}
