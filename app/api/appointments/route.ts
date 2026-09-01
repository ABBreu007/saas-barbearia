import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { getClientPlanCredits } from "@/lib/client-plans";
import { validateAppointmentAvailability } from "@/lib/data/public-page";
import { brazilDateString } from "@/lib/timezone";

// O barbeiro pode agendar para um cliente já cadastrado (clientId) ou criar
// um cliente novo na hora (nome+telefone) — comum no balcão, quando o
// cliente nunca agendou antes. Mesmo padrão de upsert por (barbershopId,
// phone) usado em /api/public/[slug]/book.
const baseFields = {
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  startTime: z.string().datetime(),
  // Se true, consome 1 crédito do plano de assinatura ATIVO do cliente em
  // vez de cobrar avulso — validado server-side (nunca confia em "tem
  // crédito" vindo do client).
  useClientPlan: z.boolean().optional(),
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

  const { serviceId, staffId, startTime, useClientPlan } = parsed.data;

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

  const appointmentStaffId = staffId ?? staff.id;
  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const scheduleDayKey = `${staff.barbershopId}:barbershop:${brazilDateString(start)}`;
      const staffDayKey = `${staff.barbershopId}:${appointmentStaffId}:${brazilDateString(start)}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scheduleDayKey}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${staffDayKey}))`;

      const availability = await validateAppointmentAvailability({
        barbershopId: staff.barbershopId,
        start,
        end,
        staffId: appointmentStaffId,
        db: tx,
      });
      if (!availability.ok) throw new Error(availability.error);

      let clientPlanId: string | undefined;
      if (useClientPlan) {
        const clientPlan = await tx.clientPlan.findFirst({
          where: { clientId: client.id, status: "ACTIVE" },
          include: { plan: true },
        });
        if (!clientPlan) throw new Error("no_active_plan");

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientPlan.id}))`;
        const { remaining } = await getClientPlanCredits(clientPlan, tx);
        if (remaining <= 0) throw new Error("no_credits_left");
        clientPlanId = clientPlan.id;
      }

      return tx.appointment.create({
        data: {
          barbershopId: staff.barbershopId,
          clientId: client.id,
          serviceId,
          // Sem staffId explícito, assume quem está criando o agendamento —
          // é o caso comum (o próprio barbeiro lançando o cliente na agenda).
          // Sem isso, "Faturamento por barbeiro" no Painel ficava com receita
          // "sem dono", o que não faz sentido pro caso de uso real.
          staffId: appointmentStaffId,
          startTime: start,
          endTime: end,
          priceCents: service.priceCents,
          status: "CONFIRMED",
          clientPlanId,
        },
      });
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["no_active_plan", "no_credits_left"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && ["outside_business_hours", "time_off", "break_time", "time_blocked"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "slot_unavailable") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
