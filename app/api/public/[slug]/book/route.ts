import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bookSchema = z.object({
  serviceId: z.string().min(1),
  startTime: z.string().datetime(),
  clientName: z.string().min(1).max(80),
  clientPhone: z.string().min(8).max(20),
  staffId: z.string().min(1).optional(),
});

// Rota PÚBLICA de criação de agendamento pelo cliente final (botão
// "Confirmar agendamento" da página pública). Sem autenticação — por isso
// valida tudo contra o banco (nunca confia em preço/duração vindos do client)
// e recalcula o fim do horário a partir da duração real do serviço.
// TODO produção: aplicar rate limiting por IP/telefone (ver Segurança no plano).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const parsed = bookSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const { serviceId, startTime, clientName, clientPhone, staffId } = parsed.data;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, barbershopId: barbershop.id, active: true },
  });
  if (!service) {
    return NextResponse.json({ error: "service_not_found" }, { status: 404 });
  }

  if (staffId) {
    const staffExists = await prisma.staff.findFirst({
      where: { id: staffId, barbershopId: barbershop.id },
      select: { id: true },
    });
    if (!staffExists) {
      return NextResponse.json({ error: "staff_not_found" }, { status: 404 });
    }
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  // Mesma regra de escopo usada em computeAvailableSlots: com barbeiro
  // escolhido, só conflita com agendamentos daquele barbeiro; sem escolha,
  // conflita com qualquer agendamento da barbearia. Precisa bater com o que
  // a lista de horários disponíveis mostrou, senão o cliente vê um horário
  // "livre" que na hora de confirmar é rejeitado.
  const conflict = await prisma.appointment.findFirst({
    where: {
      barbershopId: barbershop.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(staffId ? { staffId } : {}),
    },
  });
  if (conflict) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  const client = await prisma.client.upsert({
    where: {
      // combinação usada como identidade "de fato" do cliente final nesta barbearia
      barbershopId_phone: { barbershopId: barbershop.id, phone: clientPhone },
    },
    create: { barbershopId: barbershop.id, name: clientName, phone: clientPhone },
    update: { name: clientName },
  });

  const appointment = await prisma.appointment.create({
    data: {
      barbershopId: barbershop.id,
      clientId: client.id,
      serviceId: service.id,
      staffId: staffId ?? null,
      startTime: start,
      endTime: end,
      priceCents: service.priceCents,
      status: "CONFIRMED",
    },
  });

  return NextResponse.json({ appointment }, { status: 201 });
}
