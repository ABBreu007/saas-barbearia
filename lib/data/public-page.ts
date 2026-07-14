import { prisma } from "@/lib/prisma";
import { brazilDateStringBounds } from "@/lib/timezone";

const SLOT_STEP_MIN = 30;

// Reaproveitado por /api/public/[slug] (consumo client-side, quando o
// usuário troca de data ou de barbeiro) e diretamente pela Server Component
// da página pública (carga inicial, sem round-trip HTTP).
export async function getPublicBarbershopData(slug: string, date?: string, staffId?: string) {
  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      bannerUrl: true,
      avatarUrl: true,
      address: true,
      instagramUrl: true,
      whatsappUrl: true,
      mode: true,
      services: { where: { active: true }, orderBy: { priceCents: "asc" } },
      reviews: { orderBy: { createdAt: "desc" }, take: 20 },
      businessHours: true,
      staff: { select: { id: true, name: true, avatarUrl: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!barbershop) return null;

  const ratingCount = barbershop.reviews.length;
  const ratingAvg =
    ratingCount === 0 ? null : barbershop.reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount;

  const availableSlots = date ? await computeAvailableSlots(barbershop.id, date, staffId) : null;

  return {
    barbershop: {
      slug: barbershop.slug,
      name: barbershop.name,
      description: barbershop.description,
      bannerUrl: barbershop.bannerUrl,
      avatarUrl: barbershop.avatarUrl,
      address: barbershop.address,
      instagramUrl: barbershop.instagramUrl,
      whatsappUrl: barbershop.whatsappUrl,
      mode: barbershop.mode,
    },
    services: barbershop.services,
    reviews: barbershop.reviews,
    ratingAvg,
    ratingCount,
    businessHours: barbershop.businessHours,
    availableSlots,
    staff: barbershop.staff,
  };
}

export type PublicBarbershopData = NonNullable<Awaited<ReturnType<typeof getPublicBarbershopData>>>;

// `staffId` restringe a checagem de conflito aos agendamentos daquele
// barbeiro específico — cada barbeiro tem disponibilidade independente.
// Sem `staffId` (barbearia autônoma, ou cliente sem preferência), a checagem
// continua bloqueando por qualquer agendamento da barbearia inteira, como
// antes.
export async function computeAvailableSlots(barbershopId: string, dateStr: string, staffId?: string) {
  const { start: dayStart, end: dayEnd, weekday } = brazilDateStringBounds(dateStr);

  const hours = await prisma.businessHour.findFirst({ where: { barbershopId, weekday } });
  if (!hours || !hours.isOpen) return [];

  const timeOff = await prisma.timeOff.findFirst({ where: { barbershopId, date: dayStart } });
  if (timeOff) return [];

  // Checagem de sobreposição de intervalo de verdade (startTime < dayEnd E
  // endTime > dayStart) — não só "startTime dentro do dia". Um agendamento
  // que começa 23:25 e termina 00:10 do dia seguinte tem startTime no dia
  // anterior, mas ainda ocupa os primeiros minutos deste dia; filtrar só
  // por startTime perdia esse caso e deixava a rota de booking (que faz a
  // checagem de conflito correta) rejeitar um horário que a lista de
  // disponíveis tinha mostrado como livre.
  const existing = await prisma.appointment.findMany({
    where: {
      barbershopId,
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
      status: { in: ["PENDING", "CONFIRMED"] },
      ...(staffId ? { staffId } : {}),
    },
    select: { startTime: true, endTime: true },
  });

  const slots: string[] = [];
  for (let minutes = hours.openMinutes; minutes + SLOT_STEP_MIN <= hours.closeMinutes; minutes += SLOT_STEP_MIN) {
    const slotStart = new Date(dayStart.getTime() + minutes * 60_000);
    const slotEnd = new Date(slotStart.getTime() + SLOT_STEP_MIN * 60_000);
    const overlaps = existing.some((a) => slotStart < a.endTime && slotEnd > a.startTime);
    if (!overlaps) {
      slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    }
  }
  return slots;
}
