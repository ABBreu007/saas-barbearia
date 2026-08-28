import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsBRL, formatDateShort, initials } from "@/lib/format";
import { daysSince } from "@/lib/timezone";
import { whatsappUrl } from "@/lib/whatsapp";
import { getClientPlanCredits } from "@/lib/client-plans";
import { PlanCell } from "./plan-cell";
import styles from "./clientes.module.css";

const COUNTED = ["CONFIRMED", "COMPLETED"] as const;

// Mesmos limiares usados pra sinalizar cliente "sumindo": 15 dias vira
// alerta (amarelo), 30 dias vira crítico (vermelho) — abaixo disso é normal.
function daysAwayLevel(days: number): "vermelho" | "amarelo" | "neutro" {
  if (days >= 30) return "vermelho";
  if (days >= 15) return "amarelo";
  return "neutro";
}

function followUpMessage(clientName: string, barbershopName: string, days: number | null) {
  const firstName = clientName.split(" ")[0];
  if (days === null) {
    return `Olá, ${firstName}! Aqui é da ${barbershopName}. Que tal agendar seu primeiro horário com a gente?`;
  }
  return `Olá, ${firstName}! Aqui é da ${barbershopName}. Já faz ${days} dia${days === 1 ? "" : "s"} desde sua última visita — que tal agendar um novo horário?`;
}

export default async function ClientesPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const [clients, availablePlans] = await Promise.all([
    prisma.client.findMany({
      where: { barbershopId: staff.barbershopId },
      include: {
        appointments: {
          where: { status: { in: [...COUNTED] } },
          select: { startTime: true, priceCents: true },
        },
        clientPlans: {
          where: { status: { in: ["PENDING", "ACTIVE"] } },
          include: { plan: true },
          take: 1,
        },
      },
    }),
    prisma.barbershopPlan.findMany({
      where: { barbershopId: staff.barbershopId, active: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rows = await Promise.all(
    clients.map(async (c) => {
      const visits = c.appointments.length;
      const totalCents = c.appointments.reduce((sum, a) => sum + a.priceCents, 0);
      const lastVisit = c.appointments.reduce<Date | null>(
        (latest, a) => (!latest || a.startTime > latest ? a.startTime : latest),
        null
      );
      const daysAway = lastVisit ? daysSince(lastVisit) : null;
      const clientPlanRow = c.clientPlans[0] ?? null;
      const credits =
        clientPlanRow && clientPlanRow.status === "ACTIVE" ? await getClientPlanCredits(clientPlanRow) : null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        visits,
        totalCents,
        lastVisit,
        daysAway,
        clientPlan: clientPlanRow
          ? {
              status: clientPlanRow.status as "PENDING" | "ACTIVE",
              planName: clientPlanRow.plan.name,
              used: credits?.used ?? 0,
              visitsPerMonth: clientPlanRow.plan.visitsPerMonth,
            }
          : null,
      };
    })
  );
  rows.sort((a, b) => (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Clientes</h1>
      <div className={styles.hint}>{rows.length} cliente{rows.length === 1 ? "" : "s"} cadastrado{rows.length === 1 ? "" : "s"}</div>

      <div className={styles.tableHeader}>
        <span>Cliente</span>
        <span>Telefone</span>
        <span>Visitas</span>
        <span>Última visita</span>
        <span>Sem cortar</span>
        <span>Total gasto</span>
        <span>Plano</span>
        <span>Follow up</span>
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
              <div className={styles.cardCell} data-label="Sem cortar">
                {r.daysAway === null ? (
                  "—"
                ) : (
                  <span className={styles.daysAwayBadge} data-level={daysAwayLevel(r.daysAway)}>
                    {r.daysAway} dia{r.daysAway === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className={styles.cardCell} data-label="Total gasto">{formatCentsBRL(r.totalCents)}</div>
              <div className={styles.cardCell} data-label="Plano">
                <PlanCell clientId={r.id} clientPlan={r.clientPlan} availablePlans={availablePlans} />
              </div>
              <div className={styles.cardCell} data-label="Follow up">
                {r.phone ? (
                  <a
                    href={whatsappUrl(r.phone, followUpMessage(r.name, staff.barbershop.name, r.daysAway))}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.followUpButton}
                  >
                    Chamar no WhatsApp
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
