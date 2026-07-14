import Link from "next/link";
import styles from "./painel.module.css";

const PERIODS = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
] as const;

export function PeriodSwitcher({ period }: { period: string }) {
  return (
    <div className={styles.segmented}>
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`/painel?period=${p.key}`}
          className={styles.segmentedItem}
          data-active={period === p.key}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
