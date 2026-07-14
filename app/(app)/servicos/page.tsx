import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ServicesList } from "./services-list";
import styles from "./servicos.module.css";

export default async function ServicosPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const services = await prisma.service.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Serviços</h1>
      <ServicesList initialServices={services} />
      <div style={{ height: 24 }} />
    </div>
  );
}
