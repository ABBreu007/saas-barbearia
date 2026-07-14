import { prisma } from "@/lib/prisma";

export async function getAppointmentsInRange(
  barbershopId: string,
  start: Date,
  end: Date,
  staffId?: string
) {
  return prisma.appointment.findMany({
    where: {
      barbershopId,
      startTime: { gte: start, lte: end },
      status: { not: "CANCELLED" },
      ...(staffId ? { staffId } : {}),
    },
    include: { client: true, service: true, staff: true },
    orderBy: { startTime: "asc" },
  });
}

export type AgendaAppointment = Awaited<
  ReturnType<typeof getAppointmentsInRange>
>[number];
