import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const dayHoursSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  openMinutes: z.number().int().min(0).max(1410).multipleOf(30),
  closeMinutes: z.number().int().min(0).max(1410).multipleOf(30),
  breakStartMinutes: z.number().int().min(0).max(1410).multipleOf(30).nullable().optional(),
  breakDurationMin: z.number().int().min(15).max(240).multipleOf(15).nullable().optional(),
});

const putSchema = z.object({ days: z.array(dayHoursSchema).length(7) });

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const days = await prisma.businessHour.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { weekday: "asc" },
  });

  return NextResponse.json({ days });
}

// Substitui todos os 7 dias de uma vez (é assim que a tela "Horários" salva).
export async function PUT(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  for (const day of parsed.data.days) {
    if (day.isOpen && day.openMinutes > day.closeMinutes - 30) {
      return NextResponse.json(
        { error: "invalid_hours", detail: `weekday ${day.weekday}: abre deve ser <= fecha - 30min` },
        { status: 400 }
      );
    }
    if (day.breakStartMinutes != null && day.breakDurationMin != null) {
      const breakEnd = day.breakStartMinutes + day.breakDurationMin;
      if (day.breakStartMinutes < day.openMinutes || breakEnd > day.closeMinutes) {
        return NextResponse.json(
          { error: "invalid_break", detail: `weekday ${day.weekday}: pausa precisa caber dentro do expediente` },
          { status: 400 }
        );
      }
    }
  }

  await prisma.$transaction(
    parsed.data.days.map((day) =>
      prisma.businessHour.upsert({
        where: {
          barbershopId_weekday: {
            barbershopId: staff.barbershopId,
            weekday: day.weekday,
          },
        },
        create: { ...day, barbershopId: staff.barbershopId },
        update: day,
      })
    )
  );

  return NextResponse.json({ ok: true });
}
