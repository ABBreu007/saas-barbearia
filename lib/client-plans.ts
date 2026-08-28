// Lógica de ciclo mensal de créditos dos planos de assinatura do CLIENTE
// (pacote de cortes/mês) — não confundir com lib/plans.ts, que é a
// assinatura da BARBEARIA com o SaaS.
//
// Créditos restantes não são armazenados como contador — são calculados sob
// demanda contando Appointments vinculados ao ClientPlan dentro do ciclo
// atual (getClientPlanCredits abaixo). Isso evita precisar de um job de
// reset mensal: o "ciclo atual" é sempre recalculado a partir de
// `cycleStart` (a data da matrícula).
import { prisma } from "@/lib/prisma";

// Soma `months` a `date` preservando dia-do-mês e hora, com clamp pro
// último dia do mês de destino quando ele for mais curto (ex.: matrícula
// dia 31 de janeiro + 1 mês = 28/29 de fevereiro, não "3 de março").
function addMonthsClamped(date: Date, months: number): Date {
  const targetIndex = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = ((targetIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), daysInTargetMonth);
  return new Date(
    Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
  );
}

// Início do ciclo mensal vigente — anda mês a mês a partir de `cycleStart`
// até achar o último início de ciclo que já começou (<= reference).
export function currentCycleStart(cycleStart: Date, reference: Date = new Date()): Date {
  let candidate = cycleStart;
  let next = addMonthsClamped(candidate, 1);
  while (next <= reference) {
    candidate = next;
    next = addMonthsClamped(candidate, 1);
  }
  return candidate;
}

const COUNTED_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

// Quantos créditos já foram usados e quantos restam no ciclo vigente de um
// ClientPlan. Usado tanto pra validar antes de aplicar um crédito quanto
// pra exibir "2/4 usados" nas telas de Clientes e Agenda.
export async function getClientPlanCredits(clientPlan: {
  id: string;
  cycleStart: Date;
  plan: { visitsPerMonth: number };
}) {
  const cycleStart = currentCycleStart(clientPlan.cycleStart);
  const used = await prisma.appointment.count({
    where: {
      clientPlanId: clientPlan.id,
      status: { in: [...COUNTED_STATUSES] },
      startTime: { gte: cycleStart },
    },
  });
  return { cycleStart, used, remaining: Math.max(0, clientPlan.plan.visitsPerMonth - used) };
}
