import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EquipeClient } from "./equipe-client";
import styles from "./equipe.module.css";

export default async function EquipePage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  // Só o dono gerencia a equipe — um barbeiro comum não tem motivo pra
  // acessar esta tela (a API já bloqueia de qualquer forma, isto aqui evita
  // a pessoa nem chegar a ver o formulário).
  if (staff.role !== "OWNER") {
    redirect("/conta");
  }

  const allStaff = await prisma.staff.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/conta" className={styles.backBtn} aria-label="Voltar">
          ‹
        </Link>
        <h1 className={styles.title}>Equipe</h1>
      </div>

      <EquipeClient
        staff={allStaff.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          avatarUrl: s.avatarUrl,
        }))}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
