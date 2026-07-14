import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

// O barbeiro pode agendar para um cliente já cadastrado (clientId) ou criar
// um cliente novo na hora (nome+telefone) — comum no balcão, quando o
// cliente nunca agendou antes. Mesmo padrão de upsert por (barbershopId,
// phone) usado em /api/public/[slug]/book.
const baseFields = {
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  startTime: z.string().datetime(),
};

const createAppointmentSchema = z.union([
  z.object({ ...baseFields, clientId: z.string().min(1) }),
  z.object({
    ...baseFields,
    clientName: z.string().min(1).max(80),
    clientPhone: z.string().min(8).max(20),
  }),
]);

// GET /api/appointments?from=ISO&to=ISO — alimenta as visões Dia/Semana/Mês da Agenda.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const appointments = await prisma.appointment.findMany({
    where: {
      barbershopId: staff.barbershopId,
      ...(from && to
        ? { startTime: { gte: new Date(from), lte: new Date(to) } }
        : {}),
    },
    include: { client: true, service: true, staff: true },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ appointments });
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createAppointmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { serviceId, staffId, startTime } = parsed.data;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, barbershopId: staff.barbershopId },
  });
  if (!service) {
    return NextResponse.json({ error: "service_not_found" }, { status: 404 });
  }

  const client =
    "clientId" in parsed.data
      ? await prisma.client.findFirst({
          where: { id: parsed.data.clientId, barbershopId: staff.barbershopId },
        })
      : await prisma.client.upsert({
          where: {
            barbershopId_phone: {
              barbershopId: staff.barbershopId,
              phone: parsed.data.clientPhone,
            },
          },
          create: {
            barbershopId: staff.barbershopId,
            name: parsed.data.clientName,
            phone: parsed.data.clientPhone,
          },
          update: { name: parsed.data.clientName },
        });

  if (!client) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.durationMin * 60_000);

  const conflict = await prisma.appointment.findFirst({
    where: {
      barbershopId: staff.barbershopId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(staffId ? { staffId } : {}),
    },
  });
  if (conflict) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  const appointment = await prisma.appointment.create({
    data: {
      barbershopId: staff.barbershopId,
      clientId: client.id,
      serviceId,
      // Sem staffId explícito, assume quem está criando o agendamento —
      // é o caso comum (o próprio barbeiro lançando o cliente na agenda).
      // Sem isso, "Faturamento por barbeiro" no Painel ficava com receita
      // "sem dono", o que não faz sentido pro caso de uso real.
      staffId: staffId ?? staff.id,
      startTime: start,
      endTime: end,
      priceCents: service.priceCents,
      status: "CONFIRMED",
    },
  });

  return NextResponse.json({ appointment }, { status: 201 });
}
