import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getMetrics, type Period } from "@/lib/data/metrics";
import { formatCentsBRL, initials } from "@/lib/format";
import { PeriodSwitcher } from "./period-switcher";
import { GoalEditor } from "./goal-editor";
import { ServiceBar } from "./metric-bar";
import styles from "./painel.module.css";

function periodLabel(period: Period): string {
  if (period === "dia") return "FATURAMENTO · HOJE";
  if (period === "semana") return "FATURAMENTO · SEMANA";
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return `FATURAMENTO · ${month.toUpperCase()}`;
}

function periodCompareLabel(period: Period): string {
  if (period === "dia") return "vs ontem";
  if (period === "semana") return "vs semana passada";
  return "vs mês passado";
}

function formatDelta(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(pct).toString().replace(".", ",")}%`;
}

function formatRating(avg: number | null): string {
  return avg === null ? "—" : avg.toFixed(1).replace(".", ",");
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const params = await searchParams;
  const period: Period = (["dia", "semana", "mes"] as const).includes(params.period as Period)
    ? (params.period as Period)
    : "mes";

  const m = await getMetrics(staff.barbershopId, period);
  const showByStaff = staff.barbershop.mode === "DONO" && m.revenueByStaff.length > 0;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Métricas</h1>
      <PeriodSwitcher period={period} />

      {!m.hasData ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>Ainda sem dados neste período</div>
          <div className={styles.emptyDesc}>
            Assim que os primeiros agendamentos forem concluídos, o faturamento, os clientes
            atendidos e as avaliações aparecem aqui.
          </div>
        </div>
      ) : (
        <>
          <div className={styles.revenueCard}>
            <div className={styles.revenueLabel}>{periodLabel(period)}</div>
            <div className={styles.revenueValue}>{formatCentsBRL(m.revenueCents)}</div>
            <div className={styles.revenueDeltaRow}>
              <span
                className={styles.deltaBadge}
                data-sign={m.deltaPct === null ? undefined : m.deltaPct >= 0 ? "positive" : "negative"}
              >
                {formatDelta(m.deltaPct)}
              </span>
              <span>{periodCompareLabel(period)}</span>
            </div>
            <div className={styles.revenueExpected}>
              Esperado no período · {formatCentsBRL(m.expectedCents)}
            </div>
            <div className={styles.revenueFaltas} data-alert={m.noShows > 0}>
              {m.noShows === 0 ? "Nenhuma falta no período" : `${m.noShows} falta${m.noShows === 1 ? "" : "s"}/desmarcação no período`}
            </div>
            {period === "mes" && (
              <GoalEditor goalCents={staff.barbershop.monthlyGoalCents} revenueCents={m.revenueCents} />
            )}
          </div>

          {m.highlights.length > 0 && (
            <div className={styles.highlights}>
              {m.highlights.map((h, i) => (
                <div key={i} className={styles.highlight} data-type={h.type}>
                  {h.type === "positive" ? "✓" : "⚠"} {h.text}
                </div>
              ))}
            </div>
          )}

          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Clientes atendidos</div>
              <div className={styles.kpiValue}>{m.clientsServed}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Avaliação média</div>
              <div className={styles.kpiRatingRow}>
                <span className={styles.kpiValue}>{formatRating(m.ratingAvg)}</span>
                <span className={styles.kpiStars}>★★★★★</span>
              </div>
              {m.ratingDeltaAbs !== null && m.ratingDeltaAbs !== 0 && (
                <div className={styles.kpiTrend} data-sign={m.ratingDeltaAbs > 0 ? "positive" : "negative"}>
                  {m.ratingDeltaAbs > 0 ? "↑" : "↓"} {periodCompareLabel(period)}
                </div>
              )}
            </div>
          </div>

          {m.topServices.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Serviços mais vendidos</h2>
              <div className={styles.bars}>
                {m.topServices.map((s) => {
                  const max = m.topServices[0].count || 1;
                  const pct = Math.round((s.count / max) * 100);
                  return (
                    <ServiceBar
                      key={s.serviceId}
                      name={s.name}
                      count={s.count}
                      revenueCents={s.revenueCents}
                      pct={pct}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {showByStaff && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Faturamento por barbeiro</h2>
              <div className={styles.bars}>
                {m.revenueByStaff.map((s, i) => {
                  const max = m.revenueByStaff[0].revenueCents || 1;
                  const pct = Math.round((s.revenueCents / max) * 100);
                  const row = (
                    <>
                      <div className={styles.staffAvatar} data-first={i === 0}>
                        {initials(s.name)}
                      </div>
                      <div className={styles.barRow} style={{ flex: 1 }}>
                        <div className={styles.barHeader}>
                          <span>
                            {s.name}
                            <span className={styles.staffCount}> · {s.count} atendimento{s.count === 1 ? "" : "s"}</span>
                          </span>
                          <span className={styles.barValue}>{formatCentsBRL(s.revenueCents)}</span>
                        </div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </>
                  );
                  return s.staffId ? (
                    <Link
                      key={s.staffId}
                      href={`/agenda?view=semana&staffId=${s.staffId}`}
                      className={styles.staffRowLink}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key="sem-barbeiro" className={styles.staffRow}>
                      {row}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Comparativo com o mês anterior</h2>
            <div className={styles.growthCard}>
              <div className={styles.growthLabel}>TAXA DE CRESCIMENTO DA LOJA</div>
              <div
                className={styles.growthValue}
                data-sign={
                  m.monthComparison.growthPct === null
                    ? undefined
                    : m.monthComparison.growthPct >= 0
                      ? "positive"
                      : "negative"
                }
              >
                {formatDelta(m.monthComparison.growthPct)}
              </div>
              <div className={styles.growthLabel}>Mês atual vs mês anterior</div>
            </div>
            <div className={styles.prevMonthHeader}>Números do mês anterior</div>
            <div className={styles.prevMonthList}>
              <div className={styles.prevMonthRow}>
                <span>Faturamento</span>
                <span className={styles.prevMonthValue}>
                  {formatCentsBRL(m.monthComparison.previousMonth.revenueCents)}
                </span>
              </div>
              <div className={styles.prevMonthRow}>
                <span>Clientes atendidos</span>
                <span className={styles.prevMonthValue}>{m.monthComparison.previousMonth.clientsServed}</span>
              </div>
              <div className={styles.prevMonthRow}>
                <span>Faltas / desmarcações</span>
                <span className={styles.prevMonthValue}>{m.monthComparison.previousMonth.noShows}</span>
              </div>
              <div className={styles.prevMonthRow}>
                <span>Avaliação média</span>
                <span className={styles.prevMonthValue}>
                  {formatRating(m.monthComparison.previousMonth.ratingAvg)}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
