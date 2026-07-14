import Link from "next/link";
import type { AgendaAppointment } from "@/lib/data/agenda";
import { brazilDateString, brazilMinutesSinceMidnight, todayBrazilDateString } from "@/lib/timezone";
import styles from "./agenda.module.css";

const RANGE_START_MIN = 8 * 60;
const RANGE_END_MIN = 20 * 60;
const PX_PER_MIN = 0.7;

const WEEKDAY_FULL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dateStrFromOffset(weekStart: Date, offset: number) {
  const d = new Date(weekStart.getTime() + offset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function WeekView({
  weekStart,
  appointments,
}: {
  weekStart: Date;
  appointments: AgendaAppointment[];
}) {
  const today = todayBrazilDateString();
  const days = Array.from({ length: 7 }, (_, i) => dateStrFromOffset(weekStart, i));

  const byDay = days.map((d) => {
    const dayAppointments = appointments.filter(
      (a) => brazilDateString(a.startTime) === d
    );
    const hasNoShow = dayAppointments.some((a) => a.status === "NO_SHOW");
    return { date: d, appointments: dayAppointments, hasNoShow };
  });

  const hourMarks = [];
  for (let m = RANGE_START_MIN; m <= RANGE_END_MIN; m += 60) hourMarks.push(m);

  return (
    <div>
      {/* Mobile: lista de dias */}
      <div className={styles.weekList}>
        {byDay.map(({ date, appointments: dayAppts, hasNoShow }) => {
          const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
          const dayNum = Number(date.slice(8, 10));
          const isToday = date === today;
          const dotColor = dayAppts.length === 0 ? "#dcd6c8" : hasNoShow ? "#f5b83d" : "#37d67a";
          return (
            <Link
              key={date}
              href={`/agenda?view=dia&date=${date}`}
              className={styles.weekListRow}
              data-today={isToday}
            >
              <div className={styles.weekListDate}>
                {WEEKDAY_FULL[weekday]} {dayNum}
              </div>
              <div className={styles.weekListCount}>
                {isToday ? "Hoje · " : ""}
                {dayAppts.length} agendamento{dayAppts.length === 1 ? "" : "s"}
              </div>
              <span className={styles.weekListDot} style={{ background: dotColor }} />
            </Link>
          );
        })}
      </div>

      {/* Desktop: grade com colunas de hora */}
      <div className={styles.weekGrid}>
        <div className={styles.weekGridHeader}>
          <div className={styles.weekGridHourCol} />
          {byDay.map(({ date }) => {
            const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
            const dayNum = Number(date.slice(8, 10));
            return (
              <div key={date} className={styles.weekGridDayHeader} data-today={date === today}>
                {WEEKDAY_FULL[weekday]} {dayNum}
              </div>
            );
          })}
        </div>
        <div className={styles.weekGridBody}>
          <div className={styles.weekGridHourCol}>
            {hourMarks.map((m) => (
              <div
                key={m}
                className={styles.weekGridHourLabel}
                style={{ top: (m - RANGE_START_MIN) * PX_PER_MIN }}
              >
                {String(Math.floor(m / 60)).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {byDay.map(({ date, appointments: dayAppts }) => (
            <div
              key={date}
              className={styles.weekGridDayCol}
              data-today={date === today}
              style={{ height: (RANGE_END_MIN - RANGE_START_MIN) * PX_PER_MIN }}
            >
              {dayAppts.map((a) => {
                const startMin = Math.max(RANGE_START_MIN, brazilMinutesSinceMidnight(a.startTime));
                const endMin = Math.min(RANGE_END_MIN, brazilMinutesSinceMidnight(a.endTime));
                if (endMin <= startMin) return null;
                return (
                  <div
                    key={a.id}
                    className={styles.weekGridBlock}
                    data-status={a.status}
                    style={{
                      top: (startMin - RANGE_START_MIN) * PX_PER_MIN,
                      height: Math.max(18, (endMin - startMin) * PX_PER_MIN),
                    }}
                    title={`${a.client.name} · ${a.service.name}`}
                  >
                    {a.client.name}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
