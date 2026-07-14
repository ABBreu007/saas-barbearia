import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { DadosForm } from "./dados-form";
import styles from "./dados.module.css";

export default async function DadosBarbeariaPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/conta" className={styles.backBtn} aria-label="Voltar">
          ‹
        </Link>
        <h1 className={styles.title}>Dados da barbearia</h1>
      </div>

      <DadosForm
        initialAddress={staff.barbershop.address ?? ""}
        initialInstagramUrl={staff.barbershop.instagramUrl ?? ""}
        initialWhatsappUrl={staff.barbershop.whatsappUrl ?? ""}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
