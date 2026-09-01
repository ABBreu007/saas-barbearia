import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayBrazilDateString } from "@/lib/timezone";
import { CaixaClient } from "./caixa-client";
import styles from "./caixa.module.css";

export default async function CaixaPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  // Mesmo padrão de app/(app)/conta/equipe: só o dono acessa — a API já
  // bloqueia de qualquer forma, isto evita a pessoa nem chegar a ver a tela.
  if (staff.role !== "OWNER") {
    redirect("/");
  }

  const [today, recent, heldDeposits, refundPending] = await Promise.all([
    prisma.cashRegister.findUnique({
      where: {
        barbershopId_date: { barbershopId: staff.barbershopId, date: new Date(todayBrazilDateString()) },
      },
      include: { movements: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.cashRegister.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { date: "desc" },
      take: 31,
    }),
    // Sinais pagos que ainda estão na conta MP da Nexo (sem Marketplace,
    // ainda não existe repasse automático pro barbeiro) — o dono precisa ver
    // isso toda vez que abre o Caixa, não só no texto de Configurações.
    prisma.payment.aggregate({
      where: { barbershopId: staff.barbershopId, status: "PAID" },
      _sum: { amountCents: true },
    }),
    prisma.payment.findMany({
      where: { barbershopId: staff.barbershopId, status: "REFUND_PENDING" },
      include: {
        appointment: {
          select: { startTime: true, client: { select: { name: true } }, service: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Caixa</h1>
      <CaixaClient
        initialToday={today}
        initialRecent={recent.filter((r) => r.id !== today?.id)}
        heldDepositsCents={heldDeposits._sum.amountCents ?? 0}
        initialRefundPending={refundPending}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
