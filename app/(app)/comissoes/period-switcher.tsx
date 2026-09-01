import Link from "next/link";
import styles from "./comissoes.module.css";

const PERIODS = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
] as const;

// Mesmo padrão de app/(app)/painel/period-switcher.tsx, só preservando o
// staffId (filtro do OWNER) ao trocar de período.
export function PeriodSwitcher({ period, staffId }: { period: string; staffId?: string }) {
  return (
    <div className={styles.segmented}>
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`/comissoes?period=${p.key}${staffId ? `&staffId=${staffId}` : ""}`}
          className={styles.segmentedItem}
          data-active={period === p.key}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
