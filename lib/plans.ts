import type { SubscriptionPlan } from "@prisma/client";

// Fonte única de verdade do preço da assinatura. Modelo definido em
// 2026-07: sem tiers por nº de barbeiros — todo mundo que assina é o mesmo
// plano PRO, só que quem entra durante a fase de piloto (as primeiras
// barbearias conquistadas pela abordagem presencial) paga um preço
// promocional por um prazo fixo, e depois migra automaticamente pro preço
// cheio. `Subscription.pilotPriceUntil` é a data-limite desse preço; é
// setado no cadastro (ver app/api/auth/signup/route.ts) e nunca precisa ser
// mexido manualmente depois — passou a data, `effectivePriceCents` já
// devolve o preço cheio sozinho.
export const TRIAL_DAYS = 14;
export const PILOT_MONTHS = 3;
export const PILOT_PRICE_CENTS = 4000; // R$40/mês
export const FULL_PRICE_CENTS = 8000; // R$80/mês

export function trialDaysLeft(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function isInPilotWindow(pilotPriceUntil: Date | null): boolean {
  return !!pilotPriceUntil && pilotPriceUntil.getTime() > Date.now();
}

export function effectivePriceCents(subscription: {
  plan: SubscriptionPlan;
  pilotPriceUntil: Date | null;
}): number {
  if (subscription.plan !== "PRO") return 0;
  return isInPilotWindow(subscription.pilotPriceUntil) ? PILOT_PRICE_CENTS : FULL_PRICE_CENTS;
}
