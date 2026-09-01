import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const createProductSchema = z.object({
  name: z.string().min(1).max(80),
  priceCents: z.number().int().nonnegative(),
  stockQty: z.number().int().nonnegative().optional(),
});

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createProductSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({
    data: { ...parsed.data, barbershopId: staff.barbershopId },
  });

  return NextResponse.json({ product }, { status: 201 });
}
