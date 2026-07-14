import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const createServiceSchema = z.object({
  name: z.string().min(1).max(80),
  durationMin: z.number().int().positive().max(480),
  priceCents: z.number().int().nonnegative(),
});

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const services = await prisma.service.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ services });
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createServiceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const service = await prisma.service.create({
    data: { ...parsed.data, barbershopId: staff.barbershopId },
  });

  return NextResponse.json({ service }, { status: 201 });
}
