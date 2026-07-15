import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getMetrics, type Period } from "@/lib/data/metrics";
import { formatCentsBRL, initials } from "@/lib/format";
import { getMetricStatus, metricStatusSymbol } from "@/lib/metric-status";
import { PeriodSwitcher } from "./period-switcher";
import { GoalEditor } from "../goal-editor";
import { ServiceBar } from "./metric-bar";
import styles from "./painel.module.css";

// Amostra mínima antes de tratar uma métrica como confiável o bastante pra
// mostrar com destaque visual (número grande, barra de proporção, cor de
// status). Abaixo disso, mostra o dado cru sem a "confiança" visual que ele
// ainda não tem. Ver seção 3.3 do documento de melhorias.
const MIN_RATING_SAMPLE = 3;
const MIN_SERVICE_SAMPLE = 5;

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

function formatPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toString().replace(".", ",")}%`;
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

  // Mesma meta que o card de faturamento de cada tela usa: "dia" olha a
  // meta diária (a mesma do Início), "mês" olha a meta mensal. "semana" não
  // tem meta própria ainda — fica neutro de propósito, não empresta a meta
  // errada de outro período.
  const applicableGoalCents =
    period === "mes" ? staff.barbershop.monthlyGoalCents : period === "dia" ? staff.barbershop.dailyGoalCents : null;
  const revenueStatus = getMetricStatus({ valor: m.revenueCents, meta: applicableGoalCents });

  const ratingHasSample = m.ratingCount >= MIN_RATING_SAMPLE;
  const serviceSampleTotal = m.topServices.reduce((sum, s) => sum + s.count, 0);
  const showServiceBars = serviceSampleTotal >= MIN_SERVICE_SAMPLE;

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
            <div className={styles.revenueValueRow}>
              <div className={styles.revenueValue}>{formatCentsBRL(m.revenueCents)}</div>
              {revenueStatus !== "neutro" && (
                <span className={styles.statusDot} data-status={revenueStatus}>
                  {metricStatusSymbol(revenueStatus)}
                </span>
              )}
            </div>
            <div className={styles.revenueDeltaRow}>
              <span
                className={styles.deltaBadge}
                data-sign={m.deltaPct === null ? undefined : m.deltaPct >= 0 ? "positive" : "negative"}
              >
                {formatDelta(m.deltaPct)}
              </span>
              <span>{periodCompareLabel(period)}</span>
            </div>
            {/* "Esperado" é a soma do que já está agendado (inclui pendente
                e falta) — só vale mostrar quando é MAIOR que o realizado,
                senão os dois números batem e parece um placeholder copiado
                (ver item 1.4 do documento de melhorias). */}
            {m.expectedCents > m.revenueCents && (
              <div className={styles.revenueExpected}>
                Esperado no período · {formatCentsBRL(m.expectedCents)}
              </div>
            )}
            <div className={styles.revenueFaltas} data-alert={m.noShows > 0}>
              {m.noShows === 0 ? "Nenhuma falta no período" : `${m.noShows} falta${m.noShows === 1 ? "" : "s"}/desmarcação no período`}
            </div>
            {period === "mes" && (
              <GoalEditor
                goalCents={staff.barbershop.monthlyGoalCents}
                revenueCents={m.revenueCents}
                field="monthlyGoalCents"
                label="meta mensal"
                styles={styles}
              />
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
              {ratingHasSample ? (
                <>
                  <div className={styles.kpiRatingRow}>
                    <span className={styles.kpiValue}>{formatRating(m.ratingAvg)}</span>
                    <span className={styles.kpiStars}>★★★★★</span>
                  </div>
                  {m.ratingDeltaAbs !== null && m.ratingDeltaAbs !== 0 && (
                    <div className={styles.kpiTrend} data-sign={m.ratingDeltaAbs > 0 ? "positive" : "negative"}>
                      {m.ratingDeltaAbs > 0 ? "↑" : "↓"} {periodCompareLabel(period)}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.kpiInsufficient}>
                  {m.ratingCount === 0 ? "Ainda sem avaliações" : `${m.ratingCount} avaliação${m.ratingCount === 1 ? "" : "ões"} (poucas p/ calcular média)`}
                </div>
              )}
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Retenção &amp; eficiência</h2>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.kpiLabel}>Ticket médio</div>
                <div className={styles.kpiValue}>
                  {m.ticketMedioCents === null ? "—" : formatCentsBRL(m.ticketMedioCents)}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.kpiLabel}>Taxa de ocupação</div>
                <div className={styles.kpiValue}>{formatPct(m.ocupacaoPct)}</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.kpiLabel}>Taxa de faltas</div>
                <div
                  className={styles.kpiValue}
                  data-status={m.faltasPct === null ? undefined : m.faltasPct > 15 ? "vermelho" : m.faltasPct > 5 ? "amarelo" : "verde"}
                >
                  {formatPct(m.faltasPct)}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.kpiLabel}>Retenção</div>
                <div className={styles.kpiValue}>{formatPct(m.retentionPct)}</div>
                {m.retentionPct !== null && (
                  <div className={styles.metricSub}>
                    {m.returningClientsCount} recorrente{m.returningClientsCount === 1 ? "" : "s"} · {m.newClientsCount} novo{m.newClientsCount === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </div>
          </section>

          {m.topServices.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Serviços mais vendidos</h2>
              {showServiceBars ? (
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
              ) : (
                <div className={styles.simpleList}>
                  {m.topServices.map((s) => (
                    <div key={s.serviceId} className={styles.simpleListRow}>
                      <span>{s.name}</span>
                      <span className={styles.simpleListValue}>
                        {s.count}x · {formatCentsBRL(s.revenueCents)}
                      </span>
                    </div>
                  ))}
                  <div className={styles.hint}>Poucos dados ainda pra comparar em proporção.</div>
                </div>
              )}
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
            {m.monthComparison.growthPct === null ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>Ainda sem mês anterior pra comparar</div>
                <div className={styles.emptyDesc}>
                  Esse é seu primeiro mês com dados no app — o comparativo aparece a partir do próximo mês.
                </div>
              </div>
            ) : (
              <>
                <div className={styles.growthCard}>
                  <div className={styles.growthLabel}>TAXA DE CRESCIMENTO DA LOJA</div>
                  <div
                    className={styles.growthValue}
                    data-sign={m.monthComparison.growthPct >= 0 ? "positive" : "negative"}
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
              </>
            )}
          </section>
        </>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
