import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const createPlanSchema = z.object({
  name: z.string().min(1).max(80),
  priceCents: z.number().int().nonnegative(),
  visitsPerMonth: z.number().int().positive().max(60),
});

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plans = await prisma.barbershopPlan.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ plans });
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createPlanSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const plan = await prisma.barbershopPlan.create({
    data: { ...parsed.data, barbershopId: staff.barbershopId },
  });

  return NextResponse.json({ plan }, { status: 201 });
}
