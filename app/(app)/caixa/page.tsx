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

  const [today, recent] = await Promise.all([
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
  ]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Caixa</h1>
      <CaixaClient
        initialToday={today}
        initialRecent={recent.filter((r) => r.id !== today?.id)}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
