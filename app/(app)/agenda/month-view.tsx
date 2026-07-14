import Link from "next/link";
import type { AgendaAppointment } from "@/lib/data/agenda";
import { brazilDateString, todayBrazilDateString } from "@/lib/timezone";
import styles from "./agenda.module.css";

const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];

function dateStrFromOffset(gridStart: Date, offset: number) {
  const d = new Date(gridStart.getTime() + offset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function MonthView({
  gridStart,
  currentMonth,
  appointments,
}: {
  gridStart: Date;
  currentMonth: number; // 1-12, mês sendo exibido — usado só para "esmaecer" dias de fora do mês
  appointments: AgendaAppointment[];
}) {
  const today = todayBrazilDateString();
  const cells = Array.from({ length: 42 }, (_, i) => dateStrFromOffset(gridStart, i));

  const countByDay = new Map<string, number>();
  for (const a of appointments) {
    const key = brazilDateString(a.startTime);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  return (
    <div className={styles.monthWrap}>
      <div className={styles.monthHeader}>
        {WEEKDAY_LETTERS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {cells.map((date) => {
          const dayNum = Number(date.slice(8, 10));
          const month = Number(date.slice(5, 7));
          const isCurrentMonth = month === currentMonth;
          const isToday = date === today;
          const count = countByDay.get(date) ?? 0;
          return (
            <Link
              key={date}
              href={`/agenda?view=dia&date=${date}`}
              className={styles.monthCell}
              data-muted={!isCurrentMonth}
              data-today={isToday}
            >
              <span className={styles.monthCellNum}>{dayNum}</span>
              {count > 0 && <span className={styles.monthCellDot} />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
