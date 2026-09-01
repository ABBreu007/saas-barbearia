import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { todayBrazilDateString } from "@/lib/timezone";

const openSchema = z.object({
  openingBalanceCents: z.number().int().nonnegative(),
});

// Caixa é diário: 1 linha por barbearia por data (@@unique([barbershopId, date])),
// igual TimeOff. "Caixa do mês" não existe como entidade — é a lista de
// registros do período, somada no client/relatório sob demanda.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [today, recent] = await Promise.all([
    prisma.cashRegister.findUnique({
      where: { barbershopId_date: { barbershopId: staff.barbershopId, date: new Date(todayBrazilDateString()) } },
      include: { movements: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.cashRegister.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { date: "desc" },
      take: 31,
    }),
  ]);

  return NextResponse.json({ today, recent });
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = openSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const date = new Date(todayBrazilDateString());
  const existing = await prisma.cashRegister.findUnique({
    where: { barbershopId_date: { barbershopId: staff.barbershopId, date } },
  });
  if (existing) {
    return NextResponse.json({ error: "already_open_or_closed_today" }, { status: 409 });
  }

  const cashRegister = await prisma.cashRegister.create({
    data: {
      barbershopId: staff.barbershopId,
      date,
      openingBalanceCents: parsed.data.openingBalanceCents,
      openedByStaffId: staff.id,
    },
  });

  return NextResponse.json({ cashRegister }, { status: 201 });
}
