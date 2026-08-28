import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ServicesList } from "./services-list";
import { PlansList } from "./plans-list";
import styles from "./servicos.module.css";

export default async function ServicosPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const [services, plans] = await Promise.all([
    prisma.service.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.barbershopPlan.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Serviços</h1>
      <ServicesList initialServices={services} />

      <h1 className={styles.title} style={{ marginTop: 40 }}>Planos de assinatura</h1>
      <PlansList initialPlans={plans} />
      <div style={{ height: 24 }} />
    </div>
  );
}
