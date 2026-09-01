import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

// Bloqueio de horário pontual — complementa BusinessHour (semanal, pausa de
// almoço) e TimeOff (dia inteiro): aqui é um intervalo livre (ex.: "14h às
// 15h hoje"), opcionalmente restrito a um profissional. Mesmo molde de
// app/api/time-off/route.ts (GET/POST/DELETE?id= num único arquivo).
const createSchema = z
  .object({
    staffId: z.string().min(1).optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    reason: z.string().max(140).optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "endTime deve ser depois de startTime",
    path: ["endTime"],
  });

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const timeBlocks = await prisma.staffTimeBlock.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ timeBlocks });
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  if (parsed.data.staffId) {
    const targetStaff = await prisma.staff.findFirst({
      where: { id: parsed.data.staffId, barbershopId: staff.barbershopId },
    });
    if (!targetStaff) {
      return NextResponse.json({ error: "staff_not_found" }, { status: 404 });
    }
  }

  const timeBlock = await prisma.staffTimeBlock.create({
    data: {
      barbershopId: staff.barbershopId,
      staffId: parsed.data.staffId,
      startTime: new Date(parsed.data.startTime),
      endTime: new Date(parsed.data.endTime),
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ timeBlock }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const { count } = await prisma.staffTimeBlock.deleteMany({
    where: { id, barbershopId: staff.barbershopId },
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
