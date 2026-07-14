import { prisma } from "@/lib/prisma";
import {
  brazilDayBounds,
  brazilWeekStart,
  brazilMonthStart,
  brazilMonthRange,
  brazilPreviousMonthRange,
} from "@/lib/timezone";

export type Period = "dia" | "semana" | "mes";
const COMPLETED = ["CONFIRMED", "COMPLETED"] as const;

function periodRange(period: Period) {
  const now = new Date();
  if (period === "dia") return { start: brazilDayBounds(now).start, end: now };
  if (period === "semana") return { start: brazilWeekStart(now), end: now };
  return { start: brazilMonthStart(now), end: now };
}

// Período anterior "cheio" (dia/semana/mês completo) — comparação
// simplificada (parcial atual vs completo anterior, não pro-rata).
function previousPeriodRange(period: Period) {
  const now = new Date();
  if (period === "dia") {
    return brazilDayBounds(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  }
  if (period === "semana") {
    const start = brazilWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }
  return brazilPreviousMonthRange(now);
}

async function revenueInRange(barbershopId: string, start: Date, end: Date) {
  const result = await prisma.appointment.aggregate({
    where: { barbershopId, status: { in: [...COMPLETED] }, startTime: { gte: start, lte: end } },
    _sum: { priceCents: true },
  });
  return result._sum.priceCents ?? 0;
}

async function noShowsInRange(barbershopId: string, start: Date, end: Date) {
  return prisma.appointment.count({
    where: { barbershopId, status: "NO_SHOW", startTime: { gte: start, lte: end } },
  });
}

async function ratingAvgInRange(barbershopId: string, start: Date, end: Date) {
  const result = await prisma.review.aggregate({
    where: { barbershopId, createdAt: { gte: start, lte: end } },
    _avg: { rating: true },
  });
  return result._avg.rating;
}

export type Highlight = { type: "positive" | "warning"; text: string };

// Leitura automática dos números do período — em vez de só mostrar dado cru,
// aponta o que mudou de forma acionável. Deliberadamente não tenta detectar
// "melhor mês desde X" (exigiria varrer um histórico arbitrário de meses);
// fica restrito a comparações contra o período imediatamente anterior, que
// já temos calculado de qualquer forma.
function buildHighlights(input: {
  deltaPct: number | null;
  noShows: number;
  previousNoShows: number;
  ratingAvg: number | null;
  previousRatingAvg: number | null;
}): Highlight[] {
  const highlights: Highlight[] = [];
  const { deltaPct, noShows, previousNoShows, ratingAvg, previousRatingAvg } = input;

  if (deltaPct !== null && deltaPct >= 10) {
    highlights.push({
      type: "positive",
      text: `Faturamento ${deltaPct.toString().replace(".", ",")}% acima do período anterior`,
    });
  } else if (deltaPct !== null && deltaPct <= -10) {
    highlights.push({
      type: "warning",
      text: `Faturamento ${Math.abs(deltaPct).toString().replace(".", ",")}% abaixo do período anterior`,
    });
  }

  if (previousNoShows > 0 && noShows > previousNoShows) {
    highlights.push({
      type: "warning",
      text: `Faltas subiram em relação ao período anterior (${previousNoShows} → ${noShows})`,
    });
  } else if (noShows === 0 && previousNoShows > 0) {
    highlights.push({ type: "positive", text: "Nenhuma falta neste período" });
  }

  if (ratingAvg !== null && previousRatingAvg !== null && ratingAvg > previousRatingAvg) {
    highlights.push({
      type: "positive",
      text: `Avaliação subiu de ${previousRatingAvg.toFixed(1).replace(".", ",")} para ${ratingAvg
        .toFixed(1)
        .replace(".", ",")}`,
    });
  }

  return highlights;
}

// Alimenta o card de faturamento, KPIs, "Serviços mais vendidos",
// "Faturamento por barbeiro" e o comparativo com o mês anterior da tela
// Painel. Usado tanto pela rota /api/metrics (para consumo externo/futuro
// app mobile) quanto diretamente pela page.tsx do Painel (Server Component
// — sem necessidade de round-trip HTTP interno).
export async function getMetrics(barbershopId: string, period: Period) {
  const { start, end } = periodRange(period);
  const prev = previousPeriodRange(period);
  const currentMonth = brazilMonthRange();
  const prevMonthRange = brazilPreviousMonthRange();

  const [
    revenue,
    expected,
    previousRevenue,
    clientsServed,
    noShows,
    previousNoShows,
    previousRatingAvg,
    byService,
    byStaff,
    rating,
    currentMonthRevenue,
    previousMonth,
  ] = await Promise.all([
    prisma.appointment.aggregate({
      where: { barbershopId, status: { in: [...COMPLETED] }, startTime: { gte: start, lte: end } },
      _sum: { priceCents: true },
    }),
    prisma.appointment.aggregate({
      where: { barbershopId, status: { not: "CANCELLED" }, startTime: { gte: start, lte: end } },
      _sum: { priceCents: true },
    }),
    revenueInRange(barbershopId, prev.start, prev.end),
    prisma.appointment.findMany({
      where: { barbershopId, status: { in: [...COMPLETED] }, startTime: { gte: start, lte: end } },
      distinct: ["clientId"],
      select: { clientId: true },
    }),
    prisma.appointment.count({
      where: { barbershopId, status: "NO_SHOW", startTime: { gte: start, lte: end } },
    }),
    noShowsInRange(barbershopId, prev.start, prev.end),
    ratingAvgInRange(barbershopId, prev.start, prev.end),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: { barbershopId, status: { in: [...COMPLETED] }, startTime: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { priceCents: true },
    }),
    prisma.appointment.groupBy({
      by: ["staffId"],
      where: { barbershopId, status: { in: [...COMPLETED] }, startTime: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { priceCents: true },
    }),
    prisma.review.aggregate({
      where: { barbershopId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    revenueInRange(barbershopId, currentMonth.start, currentMonth.end),
    (async () => {
      const [revenueCents, clients, noShowCount, reviewAgg] = await Promise.all([
        revenueInRange(barbershopId, prevMonthRange.start, prevMonthRange.end),
        prisma.appointment.findMany({
          where: { barbershopId, status: { in: [...COMPLETED] }, startTime: { gte: prevMonthRange.start, lte: prevMonthRange.end } },
          distinct: ["clientId"],
          select: { clientId: true },
        }),
        prisma.appointment.count({
          where: { barbershopId, status: "NO_SHOW", startTime: { gte: prevMonthRange.start, lte: prevMonthRange.end } },
        }),
        prisma.review.aggregate({
          where: { barbershopId, createdAt: { gte: prevMonthRange.start, lte: prevMonthRange.end } },
          _avg: { rating: true },
        }),
      ]);
      return {
        revenueCents,
        clientsServed: clients.length,
        noShows: noShowCount,
        ratingAvg: reviewAgg._avg.rating,
      };
    })(),
  ]);

  const serviceIds = byService.map((s) => s.serviceId);
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });

  const staffIds = byStaff.map((s) => s.staffId).filter((id): id is string => !!id);
  const staffMembers = await prisma.staff.findMany({ where: { id: { in: staffIds } } });

  const revenueCents = revenue._sum.priceCents ?? 0;
  const deltaPct =
    previousRevenue === 0 ? null : Math.round(((revenueCents - previousRevenue) / previousRevenue) * 1000) / 10;
  const growthPct =
    previousMonth.revenueCents === 0
      ? null
      : Math.round(((currentMonthRevenue - previousMonth.revenueCents) / previousMonth.revenueCents) * 1000) / 10;
  const ratingAvg = rating._avg.rating;
  const ratingDeltaAbs =
    ratingAvg !== null && previousRatingAvg !== null
      ? Math.round((ratingAvg - previousRatingAvg) * 10) / 10
      : null;

  // Sem faturamento nem clientes nem agendamento nenhum no período: primeiro
  // mês de uso, o Painel não deveria mostrar um dashboard zerado como se
  // fosse queda de verdade — a page.tsx troca por um estado vazio explícito.
  const hasData = revenueCents > 0 || expected._sum.priceCents !== null && (expected._sum.priceCents ?? 0) > 0 || clientsServed.length > 0;

  return {
    period,
    hasData,
    revenueCents,
    expectedCents: expected._sum.priceCents ?? 0,
    deltaPct,
    clientsServed: clientsServed.length,
    noShows,
    previousNoShows,
    ratingAvg,
    ratingCount: rating._count._all,
    ratingDeltaAbs,
    highlights: buildHighlights({ deltaPct, noShows, previousNoShows, ratingAvg, previousRatingAvg }),
    topServices: byService
      .map((s) => ({
        serviceId: s.serviceId,
        name: services.find((sv) => sv.id === s.serviceId)?.name ?? "—",
        count: s._count._all,
        revenueCents: s._sum.priceCents ?? 0,
      }))
      .sort((a, b) => b.count - a.count),
    revenueByStaff: byStaff
      .map((s) => ({
        staffId: s.staffId,
        // null acontece pra agendamentos feitos pela página pública, que
        // não pedem pro cliente escolher barbeiro — receita real, só sem
        // atribuição ainda.
        name: staffMembers.find((m) => m.id === s.staffId)?.name ?? "Sem barbeiro definido",
        revenueCents: s._sum.priceCents ?? 0,
        count: s._count._all,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    monthComparison: {
      growthPct,
      currentMonthRevenueCents: currentMonthRevenue,
      previousMonth,
    },
  };
}

export type Metrics = Awaited<ReturnType<typeof getMetrics>>;
