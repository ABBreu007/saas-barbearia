import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
  startTime: z.string().datetime(),
});

// POST público — o próprio cliente final remarca um agendamento pra outro
// horário, sem precisar cancelar e marcar de novo do zero. Mesmo nível de
// confiança do cancel/route.ts irmão: telefone usado no agendamento como
// credencial. Nunca confia em duração/preço vindos do client — recalcula
// tudo a partir do Service já salvo no agendamento, igual book/route.ts.
// TODO produção: rate limiting (mesma nota de book/route.ts).
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
    include: { client: true, service: true },
  });
  if (!appointment || appointment.client.phone !== parsed.data.phone) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const start = new Date(parsed.data.startTime);
  const end = new Date(start.getTime() + appointment.service.durationMin * 60_000);

  const conflict = await prisma.appointment.findFirst({
    where: {
      id: { not: id },
      barbershopId: barbershop.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(appointment.staffId ? { staffId: appointment.staffId } : {}),
    },
  });
  if (conflict) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { startTime: start, endTime: end },
  });

  return NextResponse.json({ appointment: updated });
}
