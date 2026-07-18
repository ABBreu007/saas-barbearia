import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppointmentsInRange } from "@/lib/data/agenda";
import { brazilDateStringBounds, todayBrazilDateString } from "@/lib/timezone";
import { ViewSwitcher } from "./view-switcher";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { MonthView } from "./month-view";
import { NewAppointmentButton } from "./new-appointment-modal";
import styles from "./agenda.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

type View = "dia" | "semana" | "mes";

function weekDatesFor(dateStr: string): string[] {
  const { start, weekday } = brazilDateStringBounds(dateStr);
  const weekStart = new Date(start.getTime() - weekday * DAY_MS);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getTime() + i * DAY_MS).toISOString().slice(0, 10)
  );
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; staffId?: string }>;
}) {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const params = await searchParams;
  const view: View = (["dia", "semana", "mes"] as const).includes(params.view as View)
    ? (params.view as View)
    : "dia";
  const dateStr = params.date ?? todayBrazilDateString();
  const staffId = params.staffId || undefined;

  const [services, filterStaff, allStaff] = await Promise.all([
    prisma.service.findMany({
      where: { barbershopId: staff.barbershopId, active: true },
      orderBy: { name: "asc" },
    }),
    staffId
      ? prisma.staff.findFirst({ where: { id: staffId, barbershopId: staff.barbershopId } })
      : null,
    prisma.staff.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  let content;

  if (view === "dia") {
    const { start, end } = brazilDateStringBounds(dateStr);
    const appointments = await getAppointmentsInRange(staff.barbershopId, start, end, staffId);
    content = (
      <DayView dateStr={dateStr} weekDates={weekDatesFor(dateStr)} appointments={appointments} />
    );
  } else if (view === "semana") {
    const { start: dayStart, weekday } = brazilDateStringBounds(dateStr);
    const weekStart = new Date(dayStart.getTime() - weekday * DAY_MS);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);
    const appointments = await getAppointmentsInRange(staff.barbershopId, weekStart, weekEnd, staffId);
    content = <WeekView weekStart={weekStart} appointments={appointments} />;
  } else {
    const [year, month] = dateStr.split("-").map(Number);
    const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const { start: monthStart, weekday: monthStartWeekday } = brazilDateStringBounds(monthStartStr);
    const gridStart = new Date(monthStart.getTime() - monthStartWeekday * DAY_MS);
    const gridEnd = new Date(gridStart.getTime() + 42 * DAY_MS - 1);
    const appointments = await getAppointmentsInRange(staff.barbershopId, gridStart, gridEnd, staffId);
    content = (
      <MonthView gridStart={gridStart} currentMonth={month} appointments={appointments} />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Agenda</h1>
        <NewAppointmentButton
          services={services}
          staffOptions={allStaff}
          defaultStaffId={staff.id}
          defaultDate={dateStr}
        />
      </div>
      {filterStaff && (
        <div className={styles.filterBanner}>
          Mostrando agenda de <strong>{filterStaff.name}</strong>
          <Link href={`/agenda?view=${view}&date=${dateStr}`} className={styles.filterClear}>
            Limpar filtro
          </Link>
        </div>
      )}
      <ViewSwitcher view={view} dateStr={dateStr} />
      {content}
      <div style={{ height: 24 }} />
    </div>
  );
}
