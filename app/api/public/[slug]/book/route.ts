import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientPlanCredits } from "@/lib/client-plans";
import { validateAppointmentAvailability } from "@/lib/data/public-page";
import { depositAmountCents, createDepositPreference } from "@/lib/data/payments";
import { brazilDateString } from "@/lib/timezone";

const bookSchema = z.object({
  serviceId: z.string().min(1),
  startTime: z.string().datetime(),
  clientName: z.string().min(1).max(80),
  clientPhone: z.string().min(8).max(20),
  staffId: z.string().min(1).optional(),
  // Cliente marca "sou assinante, usar meu crédito" — mesma identidade por
  // telefone já usada pra cancelar/ver os próprios agendamentos nesta rota
  // pública; validado contra o ClientPlan real, nunca confia em créditos
  // informados pelo client.
  useClientPlan: z.boolean().optional(),
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

  const { serviceId, startTime, clientName, clientPhone, staffId, useClientPlan } = parsed.data;

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
  const client = await prisma.client.upsert({
    where: {
      // combinação usada como identidade "de fato" do cliente final nesta barbearia
      barbershopId_phone: { barbershopId: barbershop.id, phone: clientPhone },
    },
    create: { barbershopId: barbershop.id, name: clientName, phone: clientPhone },
    update: { name: clientName },
  });

  try {
    const { appointment, payment } = await prisma.$transaction(async (tx) => {
      const scheduleDayKey = `${barbershop.id}:barbershop:${brazilDateString(start)}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scheduleDayKey}))`;
      if (staffId) {
        const staffDayKey = `${barbershop.id}:${staffId}:${brazilDateString(start)}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${staffDayKey}))`;
      }

      const availability = await validateAppointmentAvailability({
        barbershopId: barbershop.id,
        start,
        end,
        staffId,
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

      // Sinal só entra em jogo pro fluxo comum (não faz sentido cobrar sinal
      // de quem já está pagando com crédito de plano). Enquanto não existe
      // Marketplace, esse Payment cai na conta MP da própria Nexo — ver nota
      // em lib/data/payments.ts.
      const settings = !useClientPlan
        ? await tx.barbershopSettings.findUnique({ where: { barbershopId: barbershop.id } })
        : null;
      const needsDeposit = !useClientPlan && !!settings?.depositRequired;

      const appointment = await tx.appointment.create({
        data: {
          barbershopId: barbershop.id,
          clientId: client.id,
          serviceId: service.id,
          staffId: staffId ?? null,
          startTime: start,
          endTime: end,
          priceCents: service.priceCents,
          status: needsDeposit ? "PENDING" : "CONFIRMED",
          clientPlanId,
        },
      });

      if (!needsDeposit || !settings) return { appointment, payment: null };

      const payment = await tx.payment.create({
        data: {
          barbershopId: barbershop.id,
          appointmentId: appointment.id,
          amountCents: depositAmountCents(settings, service.priceCents),
          status: "PENDING",
        },
      });
      return { appointment, payment };
    });

    if (!payment) {
      return NextResponse.json({ appointment }, { status: 201 });
    }

    try {
      const { preferenceId, checkoutUrl } = await createDepositPreference({
        paymentId: payment.id,
        serviceName: service.name,
        amountCents: payment.amountCents,
        origin: request.nextUrl.origin,
        slug,
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { mpPreferenceId: preferenceId } });
      return NextResponse.json({ appointment, payment: { id: payment.id, checkoutUrl } }, { status: 201 });
    } catch {
      // Não deixa um horário PENDING preso sem cobrança nenhuma associada
      // se o checkout nem pôde ser criado.
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELLED" } });
      return NextResponse.json({ error: "payment_setup_failed" }, { status: 502 });
    }
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
