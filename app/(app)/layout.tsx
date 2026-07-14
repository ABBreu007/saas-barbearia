import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initials } from "@/lib/format";
import { Nav } from "./nav";
import styles from "./layout.module.css";

// Guarda de autenticação de todo o grupo (app): sem staff válido, manda para o login.
// Isso roda no servidor a cada navegação — não depende de JS no client para proteger a rota.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();

  if (!staff) {
    redirect("/login");
  }

  // Primeiro acesso: sem onboardedAt, manda pro assistente guiado antes de
  // qualquer tela do shell principal (Início/Agenda/etc. ficam confusas
  // pra quem ainda não configurou nada).
  if (!staff.barbershop.onboardedAt) {
    redirect("/onboarding");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { barbershopId: staff.barbershopId },
    select: { plan: true },
  });

  return (
    <div className={styles.shell}>
      <Nav
        barbershopName={staff.barbershop.name}
        barbershopInitials={initials(staff.barbershop.name)}
        barbershopAvatarUrl={staff.barbershop.avatarUrl}
        planLabel={subscription?.plan ?? "FREE"}
      />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
