import Link from "next/link";
import styles from "./agenda.module.css";

const VIEWS = [
  { key: "dia", label: "Dia" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
] as const;

// Estado da view/data vive na URL (?view=&date=) — sem client state. Trocar
// de view/dia é só navegação; o Server Component (page.tsx) refaz a query.
export function ViewSwitcher({ view, dateStr }: { view: string; dateStr: string }) {
  return (
    <div className={styles.segmented}>
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={`/agenda?view=${v.key}&date=${dateStr}`}
          className={styles.segmentedItem}
          data-active={view === v.key}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
