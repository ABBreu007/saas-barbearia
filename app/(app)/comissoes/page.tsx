import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCommissions } from "@/lib/data/commissions";
import type { Period } from "@/lib/data/metrics";
import { formatCentsBRL, formatDateShort, formatTime } from "@/lib/format";
import { PeriodSwitcher } from "./period-switcher";
import styles from "./comissoes.module.css";

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; staffId?: string }>;
}) {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const params = await searchParams;
  const period: Period = (["dia", "semana", "mes"] as const).includes(params.period as Period)
    ? (params.period as Period)
    : "mes";
  // BARBER nunca enxerga a comissão de outro colega, mesmo brincando com a
  // URL — o staffId da query só tem efeito pro OWNER (mesma regra da API).
  const staffId = staff.role === "OWNER" ? params.staffId || undefined : staff.id;

  const { totalCents, items, byStaff } = await getCommissions(staff.barbershopId, period, staffId);
  const filteredStaffName = staffId ? byStaff.find((s) => s.staffId === staffId)?.staffName ?? items[0]?.staffName : null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Comissões</h1>
      <PeriodSwitcher period={period} staffId={params.staffId} />

      {staff.role === "OWNER" && staffId && (
        <div className={styles.filterBanner}>
          Mostrando comissão de <strong>{filteredStaffName ?? "profissional"}</strong>
          <Link href={`/comissoes?period=${period}`} className={styles.filterClear}>
            Limpar filtro
          </Link>
        </div>
      )}

      <div className={styles.totalCard}>
        <div className={styles.totalLabel}>
          {staff.role === "OWNER" && !staffId ? "TOTAL DA EQUIPE" : "TOTAL"}
        </div>
        <div className={styles.totalValue}>{formatCentsBRL(totalCents)}</div>
      </div>

      {staff.role === "OWNER" && !staffId && byStaff.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Por profissional</h2>
          <div className={styles.staffList}>
            {byStaff.map((s) => (
              <Link key={s.staffId} href={`/comissoes?period=${period}&staffId=${s.staffId}`} className={styles.staffRow}>
                <span>
                  {s.staffName} <span className={styles.staffCount}>· {s.count} venda{s.count === 1 ? "" : "s"}</span>
                </span>
                <span className={styles.staffValue}>{formatCentsBRL(s.totalCents)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Detalhamento</h2>
        {items.length === 0 ? (
          <div className={styles.empty}>Nenhuma comissão neste período ainda.</div>
        ) : (
          <div className={styles.itemList}>
            {items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <div>
                  <div className={styles.itemName}>{item.name}</div>
                  <div className={styles.itemMeta}>
                    {staff.role === "OWNER" && !staffId ? `${item.staffName} · ` : ""}
                    {formatDateShort(new Date(item.createdAt))} · {formatTime(new Date(item.createdAt))} ·{" "}
                    {(item.rateBps / 100).toString().replace(".", ",")}%
                  </div>
                </div>
                <div className={styles.itemValue}>{formatCentsBRL(item.amountCents)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ height: 24 }} />
    </div>
  );
}
