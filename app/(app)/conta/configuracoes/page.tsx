import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConfiguracoesClient } from "./configuracoes-client";
import styles from "./configuracoes.module.css";

export default async function ConfiguracoesPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  // Só o dono configura comissão/sinal — mesmo padrão de app/(app)/conta/equipe.
  if (staff.role !== "OWNER") {
    redirect("/conta");
  }

  const settings = await prisma.barbershopSettings.findUnique({
    where: { barbershopId: staff.barbershopId },
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/conta" className={styles.backBtn} aria-label="Voltar">
          ‹
        </Link>
        <h1 className={styles.title}>Comissão &amp; sinal</h1>
      </div>

      <ConfiguracoesClient
        initialSettings={{
          depositRequired: settings?.depositRequired ?? false,
          depositType: settings?.depositType ?? null,
          depositValue: settings?.depositValue ?? null,
          cancellationHoursForFullRefund: settings?.cancellationHoursForFullRefund ?? 24,
          defaultServiceCommissionBps: settings?.defaultServiceCommissionBps ?? 0,
          defaultProductCommissionBps: settings?.defaultProductCommissionBps ?? 0,
        }}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
