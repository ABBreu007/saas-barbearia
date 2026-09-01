import { prisma } from "@/lib/prisma";
import { periodRange, type Period } from "./metrics";

// staffId presente = relatório de UM profissional (o que um BARBER sempre
// vê, forçado pela API — ver app/api/commissions/route.ts). staffId ausente
// = visão "todo mundo", só faz sentido pro OWNER; nesse caso `byStaff` vem
// preenchido com o total de cada profissional no período.
export async function getCommissions(barbershopId: string, period: Period, staffId?: string) {
  const { start, end } = periodRange(period);

  const commissions = await prisma.commission.findMany({
    where: {
      barbershopId,
      createdAt: { gte: start, lte: end },
      ...(staffId ? { staffId } : {}),
    },
    include: {
      staff: { select: { id: true, name: true } },
      orderItem: { select: { name: true, kind: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalCents = commissions.reduce((sum, c) => sum + c.amountCents, 0);

  const items = commissions.map((c) => ({
    id: c.id,
    name: c.orderItem.name,
    kind: c.orderItem.kind,
    rateBps: c.rateBps,
    amountCents: c.amountCents,
    createdAt: c.createdAt,
    staffId: c.staff.id,
    staffName: c.staff.name,
  }));

  let byStaff: { staffId: string; staffName: string; totalCents: number; count: number }[] = [];
  if (!staffId) {
    const grouped = new Map<string, { staffId: string; staffName: string; totalCents: number; count: number }>();
    for (const c of commissions) {
      const entry = grouped.get(c.staff.id) ?? {
        staffId: c.staff.id,
        staffName: c.staff.name,
        totalCents: 0,
        count: 0,
      };
      entry.totalCents += c.amountCents;
      entry.count += 1;
      grouped.set(c.staff.id, entry);
    }
    byStaff = Array.from(grouped.values()).sort((a, b) => b.totalCents - a.totalCents);
  }

  return { totalCents, items, byStaff };
}
