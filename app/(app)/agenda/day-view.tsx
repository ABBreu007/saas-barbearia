import Link from "next/link";
import type { AgendaAppointment } from "@/lib/data/agenda";
import { brazilMinutesSinceMidnight } from "@/lib/timezone";
import { formatCentsBRL } from "@/lib/format";
import { AppointmentBlock } from "./appointment-action-modal";
import styles from "./agenda.module.css";

// Faixa fixa 08:00–20:00 para a timeline — simplificação da MVP; não lê o
// horário de funcionamento real da barbearia (isso já é usado na
// disponibilidade da página pública, mas aqui manter fixo evita uma tela em
// branco/quebrada para barbearias que ainda não configuraram horários).
const RANGE_START_MIN = 8 * 60;
const RANGE_END_MIN = 20 * 60;
const PX_PER_MIN = 1;

const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function minutesLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function DayView({
  dateStr,
  weekDates,
  appointments,
}: {
  dateStr: string;
  weekDates: string[];
  appointments: AgendaAppointment[];
}) {
  const hourMarks = [];
  for (let m = RANGE_START_MIN; m <= RANGE_END_MIN; m += 60) hourMarks.push(m);

  return (
    <div>
      <div className={styles.weekStrip}>
        {weekDates.map((d) => {
          const day = Number(d.slice(8, 10));
          const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
          return (
            <Link
              key={d}
              href={`/agenda?view=dia&date=${d}`}
              className={styles.weekStripDay}
              data-active={d === dateStr}
            >
              <span className={styles.weekStripLabel}>{WEEKDAY_LABELS[weekday]}</span>
              <span className={styles.weekStripNum}>{day}</span>
            </Link>
          );
        })}
      </div>

      {appointments.length === 0 && (
        <div className={styles.emptyDay}>Nenhum agendamento neste dia ainda.</div>
      )}

      <div className={styles.timeline} style={{ height: (RANGE_END_MIN - RANGE_START_MIN) * PX_PER_MIN }}>
        {hourMarks.map((m) => (
          <div
            key={m}
            className={styles.timelineRow}
            style={{ top: (m - RANGE_START_MIN) * PX_PER_MIN }}
          >
            <span className={styles.timelineHour}>{minutesLabel(m)}</span>
          </div>
        ))}

        {appointments.map((a) => {
          const startMin = Math.max(RANGE_START_MIN, brazilMinutesSinceMidnight(a.startTime));
          const endMin = Math.min(RANGE_END_MIN, brazilMinutesSinceMidnight(a.endTime));
          if (endMin <= startMin) return null;
          return (
            <AppointmentBlock
              key={a.id}
              appointment={a}
              className={styles.timelineBlock}
              style={{
                top: (startMin - RANGE_START_MIN) * PX_PER_MIN,
                height: Math.max(28, (endMin - startMin) * PX_PER_MIN),
              }}
            >
              <div className={styles.timelineBlockName}>{a.client.name}</div>
              <div className={styles.timelineBlockService}>
                {a.service.name} · {formatCentsBRL(a.priceCents)}
              </div>
            </AppointmentBlock>
          );
        })}
      </div>
    </div>
  );
}
