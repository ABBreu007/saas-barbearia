import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsBRL, formatDateShort, initials } from "@/lib/format";
import styles from "./clientes.module.css";

const COUNTED = ["CONFIRMED", "COMPLETED"] as const;

export default async function ClientesPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const clients = await prisma.client.findMany({
    where: { barbershopId: staff.barbershopId },
    include: {
      appointments: {
        where: { status: { in: [...COUNTED] } },
        select: { startTime: true, priceCents: true },
      },
    },
  });

  const rows = clients
    .map((c) => {
      const visits = c.appointments.length;
      const totalCents = c.appointments.reduce((sum, a) => sum + a.priceCents, 0);
      const lastVisit = c.appointments.reduce<Date | null>(
        (latest, a) => (!latest || a.startTime > latest ? a.startTime : latest),
        null
      );
      return { id: c.id, name: c.name, phone: c.phone, visits, totalCents, lastVisit };
    })
    .sort((a, b) => (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Clientes</h1>
      <div className={styles.hint}>{rows.length} cliente{rows.length === 1 ? "" : "s"} cadastrado{rows.length === 1 ? "" : "s"}</div>

      <div className={styles.tableHeader}>
        <span>Cliente</span>
        <span>Telefone</span>
        <span>Visitas</span>
        <span>Última visita</span>
        <span>Total gasto</span>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>Nenhum cliente ainda — aparecem aqui assim que alguém agendar.</div>
      ) : (
        <div className={styles.list}>
          {rows.map((r) => (
            <div key={r.id} className={styles.card}>
              <div className={styles.cardClient}>
                <div className={styles.avatar}>{initials(r.name)}</div>
                <span className={styles.cardName}>{r.name}</span>
              </div>
              <div className={styles.cardCell} data-label="Telefone">{r.phone ?? "—"}</div>
              <div className={styles.cardCell} data-label="Visitas">{r.visits}</div>
              <div className={styles.cardCell} data-label="Última visita">
                {r.lastVisit ? formatDateShort(r.lastVisit) : "—"}
              </div>
              <div className={styles.cardCell} data-label="Total gasto">{formatCentsBRL(r.totalCents)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
