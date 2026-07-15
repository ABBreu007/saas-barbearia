import { prisma } from "@/lib/prisma";
import { brazilDayBounds, todayBrazilDateString } from "@/lib/timezone";
import { computeAvailableSlots } from "@/lib/data/public-page";

// Dados da tela Início: faturamento realizado x esperado hoje, contagens e
// próximos horários. Consulta o Prisma diretamente (Server Component) — não
// precisa passar pela API HTTP própria, já que roda no mesmo processo server-side.
export async function getDashboardData(barbershopId: string) {
  const now = new Date();
  const { start: dayStart, end: dayEnd } = brazilDayBounds(now);

  const [todayAppointments, totalAppointmentsEver, availableSlotsToday] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barbershopId,
        startTime: { gte: dayStart, lte: dayEnd },
        status: { not: "CANCELLED" },
      },
      include: { client: true, service: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.appointment.count({ where: { barbershopId } }),
    computeAvailableSlots(barbershopId, todayBrazilDateString()),
  ]);

  const realizedCents = todayAppointments
    .filter((a) => a.status === "CONFIRMED" || a.status === "COMPLETED")
    .reduce((sum, a) => sum + a.priceCents, 0);

  const expectedCents = todayAppointments.reduce((sum, a) => sum + a.priceCents, 0);

  const noShows = todayAppointments.filter((a) => a.status === "NO_SHOW").length;

  const upcoming = todayAppointments
    .filter((a) => a.startTime >= now && a.status !== "NO_SHOW")
    .slice(0, 3);

  // Agendamentos criados manualmente (Agenda) já nascem CONFIRMED; só os
  // vindos da página pública nascem PENDING antes de o barbeiro confirmar —
  // é essa fila que precisa de ação preventiva (evita virar falta).
  const pendingConfirmation = todayAppointments.filter((a) => a.status === "PENDING");

  return {
    realizedCents,
    expectedCents,
    scheduledCount: todayAppointments.length,
    noShows,
    upcoming,
    // Zero agendamento em toda a história da barbearia (não só hoje) — sinal
    // de conta recém-criada, usado pra trocar o estado vazio por um call-to-
    // action de ativação em vez de "nenhum agendamento hoje" seco.
    isNewAccount: totalAppointmentsEver === 0,
    pendingConfirmation,
    freeSlotsToday: availableSlotsToday.length,
  };
}
