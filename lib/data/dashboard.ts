import { prisma } from "@/lib/prisma";
import { brazilDayBounds } from "@/lib/timezone";

// Dados da tela Início: faturamento realizado x esperado hoje, contagens e
// próximos horários. Consulta o Prisma diretamente (Server Component) — não
// precisa passar pela API HTTP própria, já que roda no mesmo processo server-side.
export async function getDashboardData(barbershopId: string) {
  const now = new Date();
  const { start: dayStart, end: dayEnd } = brazilDayBounds(now);

  const todayAppointments = await prisma.appointment.findMany({
    where: {
      barbershopId,
      startTime: { gte: dayStart, lte: dayEnd },
      status: { not: "CANCELLED" },
    },
    include: { client: true, service: true },
    orderBy: { startTime: "asc" },
  });

  const realizedCents = todayAppointments
    .filter((a) => a.status === "CONFIRMED" || a.status === "COMPLETED")
    .reduce((sum, a) => sum + a.priceCents, 0);

  const expectedCents = todayAppointments.reduce((sum, a) => sum + a.priceCents, 0);

  const noShows = todayAppointments.filter((a) => a.status === "NO_SHOW").length;

  const upcoming = todayAppointments
    .filter((a) => a.startTime >= now && a.status !== "NO_SHOW")
    .slice(0, 3);

  return {
    realizedCents,
    expectedCents,
    scheduledCount: todayAppointments.length,
    noShows,
    upcoming,
  };
}
