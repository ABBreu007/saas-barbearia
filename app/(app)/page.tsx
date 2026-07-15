import Link from "next/link";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { formatCentsBRL, formatDateLong, formatTime, greeting, initials } from "@/lib/format";
import { getMetricStatus, metricStatusSymbol } from "@/lib/metric-status";
import { GoalEditor } from "./goal-editor";
import { ShareLinkButton } from "./conta/share-link";
import styles from "./inicio.module.css";

export default async function InicioPage() {
  // requireStaff() já rodou no layout — cache() garante que isto não gera
  // uma segunda consulta ao banco (ver comentário em lib/auth.ts).
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona; isto só ajuda o TypeScript

  const data = await getDashboardData(staff.barbershopId);

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const publicUrl = `${protocol}://${host}/${staff.barbershop.slug}`;

  const firstName = staff.name.split(" ")[0];
  const today = formatDateLong(new Date());

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div
            className={styles.avatar}
            style={
              staff.barbershop.avatarUrl
                ? { backgroundImage: `url(${staff.barbershop.avatarUrl})` }
                : undefined
            }
          >
            {!staff.barbershop.avatarUrl && initials(staff.barbershop.name)}
          </div>
          <div>
            <div className={styles.brandLabel}>BARBEARIA</div>
            <div className={styles.brandName}>{staff.barbershop.name}</div>
          </div>
        </div>
      </header>

      <div className={styles.dateLabel}>{today}</div>
      <h1 className={styles.greeting}>
        {greeting()}, <br />
        {firstName}.
      </h1>

      {/* Início = operação de hoje/agora ("o que eu preciso fazer/saber
          agora"); Painel = análise histórica ("como meu negócio está indo ao
          longo do tempo"). Por isso o card abaixo mostra só o realizado de
          HOJE vs uma meta DIÁRIA que o barbeiro define (não o "esperado",
          que é a soma do que já está agendado — informativo, não é meta). */}
      <div className={styles.revenueCard}>
        <div className={styles.revenueLabel}>FATURAMENTO HOJE</div>
        <div className={styles.revenueValueRow}>
          <div className={styles.revenueValue}>{formatCentsBRL(data.realizedCents)}</div>
          {(() => {
            const status = getMetricStatus({ valor: data.realizedCents, meta: staff.barbershop.dailyGoalCents });
            return status !== "neutro" ? (
              <span className={styles.statusDot} data-status={status}>
                {metricStatusSymbol(status)}
              </span>
            ) : null;
          })()}
        </div>
        <GoalEditor
          goalCents={staff.barbershop.dailyGoalCents}
          revenueCents={data.realizedCents}
          field="dailyGoalCents"
          label="meta do dia"
          styles={styles}
        />
        {data.expectedCents > data.realizedCents && (
          <div className={styles.expected}>Esperado hoje (agendado) · {formatCentsBRL(data.expectedCents)}</div>
        )}
      </div>

      <div className={styles.quadrants}>
        <div className={styles.quadrant}>
          <div className={styles.quadrantValue}>{data.scheduledCount}</div>
          <div className={styles.quadrantLabel}>Agendados hoje</div>
        </div>
        <div className={styles.quadrant}>
          <div className={styles.quadrantValueAccent}>{data.noShows}</div>
          <div className={styles.quadrantLabel}>Faltas hoje</div>
        </div>
      </div>

      {data.pendingConfirmation.length > 0 && (
        <Link href="/agenda" className={styles.pendingAlert}>
          <span>
            ⚠ {data.pendingConfirmation.length} agendamento{data.pendingConfirmation.length === 1 ? "" : "s"} aguardando
            confirmação
          </span>
          <span className={styles.pendingAlertAction}>Ver ›</span>
        </Link>
      )}

      <div className={styles.freeSlotsRow}>
        {data.freeSlotsToday > 0
          ? `${data.freeSlotsToday} horário${data.freeSlotsToday === 1 ? "" : "s"} livre${data.freeSlotsToday === 1 ? "" : "s"} hoje`
          : "Sem horários livres hoje"}
      </div>

      <div className={styles.upcomingHeader}>
        <span className={styles.upcomingTitle}>Próximos</span>
        <Link href="/agenda" className={styles.upcomingLink}>
          Ver agenda →
        </Link>
      </div>

      {data.upcoming.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>
            {data.isNewAccount ? "Vamos começar!" : "Nenhum agendamento pendente hoje."}
          </div>
          <div className={styles.emptyStateDesc}>
            {data.isNewAccount
              ? "Compartilhe o link de agendamento com seus clientes ou crie o primeiro agendamento manualmente."
              : "Compartilhe seu link de agendamento ou crie um agendamento manual."}
          </div>
          <div className={styles.emptyStateActions}>
            <ShareLinkButton url={publicUrl} />
            <Link href="/agenda" className={styles.emptyStateSecondary}>
              + Novo agendamento
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.upcomingList}>
          {data.upcoming.map((a, i) => (
            <div key={a.id} className={styles.upcomingItem} data-featured={i === 0}>
              <div className={styles.upcomingTime}>{formatTime(a.startTime)}</div>
              <div className={styles.upcomingInfo}>
                <div className={styles.upcomingClient}>{a.client.name}</div>
                <div className={styles.upcomingService}>{a.service.name}</div>
              </div>
              <div className={styles.upcomingPrice}>{formatCentsBRL(a.priceCents)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
