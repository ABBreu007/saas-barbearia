import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { formatCentsBRL, formatDateLong, formatTime, greeting, initials } from "@/lib/format";
import styles from "./inicio.module.css";

export default async function InicioPage() {
  // requireStaff() já rodou no layout — cache() garante que isto não gera
  // uma segunda consulta ao banco (ver comentário em lib/auth.ts).
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona; isto só ajuda o TypeScript

  const data = await getDashboardData(staff.barbershopId);
  const pct =
    data.expectedCents === 0
      ? 0
      : Math.min(100, Math.round((data.realizedCents / data.expectedCents) * 100));

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

      <div className={styles.revenueCard}>
        <div className={styles.revenueLabel}>FATURAMENTO HOJE</div>
        <div className={styles.revenueValue}>{formatCentsBRL(data.realizedCents)}</div>
        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
        </div>
        <div className={styles.expected}>
          Esperado hoje · {formatCentsBRL(data.expectedCents)}
        </div>
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

      <div className={styles.upcomingHeader}>
        <span className={styles.upcomingTitle}>Próximos</span>
        <Link href="/agenda" className={styles.upcomingLink}>
          Ver agenda →
        </Link>
      </div>

      <div className={styles.upcomingList}>
        {data.upcoming.length === 0 && (
          <div className={styles.upcomingEmpty}>Nenhum agendamento pendente hoje.</div>
        )}
        {data.upcoming.map((a) => (
          <div key={a.id} className={styles.upcomingItem}>
            <div className={styles.upcomingTime}>{formatTime(a.startTime)}</div>
            <div className={styles.upcomingInfo}>
              <div className={styles.upcomingClient}>{a.client.name}</div>
              <div className={styles.upcomingService}>{a.service.name}</div>
            </div>
            <div className={styles.upcomingPrice}>{formatCentsBRL(a.priceCents)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
