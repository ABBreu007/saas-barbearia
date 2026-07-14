import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ phone: z.string().min(8).max(20) });

// POST público — o próprio cliente final cancela um agendamento (logo após
// marcar, ou depois via busca por telefone). Exige o telefone usado no
// agendamento como credencial; nunca cancela só com base no id da URL.
// TODO produção: rate limiting (mesma nota de book/route.ts e reviews/route.ts).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id, barbershopId: barbershop.id, status: { in: ["PENDING", "CONFIRMED"] } },
    include: { client: true },
  });
  if (!appointment || appointment.client.phone !== parsed.data.phone) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ ok: true });
}
