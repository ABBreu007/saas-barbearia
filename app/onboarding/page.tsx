import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trialDaysLeft } from "@/lib/plans";
import { OnboardingClient } from "./onboarding-client";

// Fora do grupo (app) de propósito — não tem sidebar/tab bar, é um
// assistente de tela cheia que roda uma vez só, antes do barbeiro ver
// Início/Agenda/Painel pela primeira vez.
export default async function OnboardingPage() {
  const staff = await requireStaff();
  if (!staff) redirect("/login");
  if (staff.barbershop.onboardedAt) redirect("/");

  const subscription = await prisma.subscription.findUnique({
    where: { barbershopId: staff.barbershopId },
  });

  return (
    <OnboardingClient
      barbershopName={staff.barbershop.name}
      initialMode={staff.barbershop.mode}
      trialDays={trialDaysLeft(subscription?.trialEndsAt ?? null)}
    />
  );
}
