import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ScheduleForm } from "./schedule-form";
import styles from "./horarios.module.css";

export default async function HorariosPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const [days, timeOff, timeBlocks, staffList] = await Promise.all([
    prisma.businessHour.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { weekday: "asc" },
    }),
    prisma.timeOff.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { date: "asc" },
    }),
    prisma.staffTimeBlock.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { startTime: "asc" },
    }),
    prisma.staff.findMany({
      where: { barbershopId: staff.barbershopId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/conta" className={styles.backBtn} aria-label="Voltar">
          ‹
        </Link>
        <h1 className={styles.title}>Horários</h1>
      </div>
      <p className={styles.hint}>Toque no dia para abrir/fechar · toque no horário para editar</p>

      <ScheduleForm
        initialDays={days}
        initialTimeOff={timeOff.map((t) => ({
          id: t.id,
          date: t.date.toISOString().slice(0, 10),
          reason: t.reason,
        }))}
        initialTimeBlocks={timeBlocks.map((b) => ({
          id: b.id,
          staffId: b.staffId,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          reason: b.reason,
        }))}
        staffOptions={staffList}
      />
      <div style={{ height: 24 }} />
    </div>
  );
}
