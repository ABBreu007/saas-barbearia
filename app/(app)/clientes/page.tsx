import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsBRL, formatDateShort, initials } from "@/lib/format";
import { daysSince } from "@/lib/timezone";
import { whatsappUrl } from "@/lib/whatsapp";
import { getClientPlanCredits } from "@/lib/client-plans";
import { PlanCell } from "./plan-cell";
import styles from "./clientes.module.css";

const COUNTED = ["CONFIRMED", "COMPLETED"] as const;

type AvailablePlan = { id: string; name: string; visitsPerMonth: number };
type Row = {
  id: string;
  name: string;
  phone: string | null;
  visits: number;
  totalCents: number;
  lastVisit: Date | null;
  daysAway: number | null;
  clientPlan: { status: "PENDING" | "ACTIVE"; planName: string; used: number; visitsPerMonth: number } | null;
};

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

function ClientRow({
  r,
  barbershopName,
  availablePlans,
}: {
  r: Row;
  barbershopName: string;
  availablePlans: AvailablePlan[];
}) {
  return (
    <div className={styles.card}>
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
            href={whatsappUrl(r.phone, followUpMessage(r.name, barbershopName, r.daysAway))}
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
  );
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

  const now = new Date();

  const rows = await Promise.all(
    clients.map(async (c) => {
      const visits = c.appointments.length;
      const totalCents = c.appointments.reduce((sum, a) => sum + a.priceCents, 0);
      // "Última visita" e "sem cortar" só fazem sentido pra visitas que já
      // ACONTECERAM — um agendamento futuro confirmado não é uma "última
      // visita" (e contá-lo como tal fazia "sem cortar" dar dias negativos
      // pra quem já tem o próximo corte marcado).
      const lastVisit = c.appointments.reduce<Date | null>(
        (latest, a) => (a.startTime <= now && (!latest || a.startTime > latest) ? a.startTime : latest),
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

  const subscriberRows = rows.filter((r) => r.clientPlan !== null);
  const normalRows = rows.filter((r) => r.clientPlan === null);

  const tableHeader = (
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
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Clientes</h1>
      <div className={styles.hint}>{rows.length} cliente{rows.length === 1 ? "" : "s"} cadastrado{rows.length === 1 ? "" : "s"}</div>

      {rows.length === 0 ? (
        <div className={styles.empty}>Nenhum cliente ainda — aparecem aqui assim que alguém agendar.</div>
      ) : (
        <>
          {subscriberRows.length > 0 && (
            <>
              <h2 className={styles.groupTitle}>
                Assinantes <span className={styles.groupCount}>({subscriberRows.length})</span>
              </h2>
              {tableHeader}
              <div className={styles.list}>
                {subscriberRows.map((r) => (
                  <ClientRow key={r.id} r={r} barbershopName={staff.barbershop.name} availablePlans={availablePlans} />
                ))}
              </div>
            </>
          )}

          <h2 className={styles.groupTitle}>
            Clientes <span className={styles.groupCount}>({normalRows.length})</span>
          </h2>
          {normalRows.length === 0 ? (
            <div className={styles.empty}>Nenhum cliente sem assinatura.</div>
          ) : (
            <>
              {tableHeader}
              <div className={styles.list}>
                {normalRows.map((r) => (
                  <ClientRow key={r.id} r={r} barbershopName={staff.barbershop.name} availablePlans={availablePlans} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
