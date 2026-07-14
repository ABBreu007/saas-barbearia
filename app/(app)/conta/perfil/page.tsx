import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { ProfileForm } from "./profile-form";
import styles from "./perfil.module.css";

export default async function PerfilPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/conta" className={styles.backBtn} aria-label="Voltar">
          ‹
        </Link>
        <h1 className={styles.title}>Personalizar</h1>
      </div>
      <p className={styles.hint}>Toque no banner ou na foto para trocar a imagem</p>

      <ProfileForm
        initialName={staff.barbershop.name}
        initialDescription={staff.barbershop.description ?? ""}
        initialBannerUrl={staff.barbershop.bannerUrl}
        initialAvatarUrl={staff.barbershop.avatarUrl}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
