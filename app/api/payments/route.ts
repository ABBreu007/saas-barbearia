import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

// Pendências de reembolso de sinal — só o dono decide (mesmo gate de
// /api/cash-register e /api/metrics).
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const payments = await prisma.payment.findMany({
    where: { barbershopId: staff.barbershopId, status: "REFUND_PENDING" },
    include: {
      appointment: {
        select: { startTime: true, client: { select: { name: true } }, service: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ payments });
}
