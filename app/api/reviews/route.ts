import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const createReviewSchema = z.object({
  barbershopSlug: z.string().min(1),
  clientName: z.string().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

// GET — lista as avaliações da barbearia autenticada (uso interno, ex.: futura tela de gestão de avaliações).
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reviews = await prisma.review.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reviews });
}

// POST — endpoint PÚBLICO usado pela página de agendamento do cliente final.
// TODO produção: aplicar rate limiting (ex.: Upstash Redis, por IP) antes de aceitar,
// para evitar spam/avaliações falsas — ver seção de Segurança do plano de arquitetura.
export async function POST(request: NextRequest) {
  const parsed = createReviewSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { barbershopSlug, clientName, rating, comment } = parsed.data;

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug: barbershopSlug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const review = await prisma.review.create({
    data: { barbershopId: barbershop.id, clientName, rating, comment },
  });

  return NextResponse.json({ review }, { status: 201 });
}
