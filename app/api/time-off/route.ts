import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const createSchema = z.object({
  date: z.string().date(),
  reason: z.string().max(140).optional(),
});

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const timeOff = await prisma.timeOff.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ timeOff });
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

  const entry = await prisma.timeOff.create({
    data: {
      barbershopId: staff.barbershopId,
      date: new Date(parsed.data.date),
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ timeOff: entry }, { status: 201 });
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

  const { count } = await prisma.timeOff.deleteMany({
    where: { id, barbershopId: staff.barbershopId },
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
