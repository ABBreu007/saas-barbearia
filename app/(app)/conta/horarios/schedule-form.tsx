"use client";

import { useState } from "react";
import styles from "./horarios.module.css";

const WEEKDAY_NAMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const STEP = 30;
const MIN_MINUTES = 0;
const MAX_MINUTES = 23 * 60 + 30;

type Day = {
  weekday: number;
  isOpen: boolean;
  openMinutes: number;
  closeMinutes: number;
};

type TimeOffEntry = { id: string; date: string; reason: string | null };

function minutesLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function buildInitialDays(existing: Day[]): Day[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const found = existing.find((d) => d.weekday === weekday);
    return (
      found ?? {
        weekday,
        isOpen: false,
        openMinutes: 9 * 60,
        closeMinutes: 18 * 60,
      }
    );
  });
}

export function ScheduleForm({
  initialDays,
  initialTimeOff,
}: {
  initialDays: Day[];
  initialTimeOff: TimeOffEntry[];
}) {
  const [days, setDays] = useState<Day[]>(buildInitialDays(initialDays));
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [newFolgaDate, setNewFolgaDate] = useState("");
  const [addingFolga, setAddingFolga] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateDay(weekday: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  function toggleDay(weekday: number) {
    updateDay(weekday, { isOpen: !days.find((d) => d.weekday === weekday)?.isOpen });
    setEditingDay(null);
  }

  function decOpen(weekday: number, day: Day) {
    const next = Math.max(MIN_MINUTES, day.openMinutes - STEP);
    if (next > day.closeMinutes - STEP) return;
    updateDay(weekday, { openMinutes: next });
  }
  function incOpen(weekday: number, day: Day) {
    const next = Math.min(MAX_MINUTES, day.openMinutes + STEP);
    if (next > day.closeMinutes - STEP) return;
    updateDay(weekday, { openMinutes: next });
  }
  function decClose(weekday: number, day: Day) {
    const next = Math.max(MIN_MINUTES, day.closeMinutes - STEP);
    if (next < day.openMinutes + STEP) return;
    updateDay(weekday, { closeMinutes: next });
  }
  function incClose(weekday: number, day: Day) {
    const next = Math.min(MAX_MINUTES, day.closeMinutes + STEP);
    updateDay(weekday, { closeMinutes: next });
  }

  async function addFolga() {
    if (!newFolgaDate) return;
    setAddingFolga(true);
    const res = await fetch("/api/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newFolgaDate }),
    });
    setAddingFolga(false);
    if (res.ok) {
      const { timeOff: entry } = await res.json();
      setTimeOff((prev) => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
      setNewFolgaDate("");
    }
  }

  async function removeFolga(id: string) {
    setTimeOff((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/time-off?id=${id}`, { method: "DELETE" });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/business-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    setSaving(false);
    setMessage(res.ok ? "Horários salvos!" : "Não foi possível salvar.");
  }

  return (
    <div>
      <div className={styles.list}>
        {days.map((day) => (
          <div key={day.weekday} className={styles.dayRow}>
            <div className={styles.dayMain}>
              <button
                type="button"
                className={styles.switch}
                data-on={day.isOpen}
                onClick={() => toggleDay(day.weekday)}
                aria-label={`${day.isOpen ? "Fechar" : "Abrir"} ${WEEKDAY_NAMES[day.weekday]}`}
              >
                <span className={styles.switchKnob} />
              </button>
              <span className={styles.dayName}>{WEEKDAY_NAMES[day.weekday]}</span>
              {day.isOpen ? (
                <button
                  type="button"
                  className={styles.hoursBtn}
                  onClick={() => setEditingDay(editingDay === day.weekday ? null : day.weekday)}
                >
                  {minutesLabel(day.openMinutes)}–{minutesLabel(day.closeMinutes)}
                </button>
              ) : (
                <span className={styles.closedLabel}>Fechado</span>
              )}
            </div>

            {editingDay === day.weekday && day.isOpen && (
              <div className={styles.editorRow}>
                <div className={styles.stepperBox}>
                  <div className={styles.stepperLabel}>Abre</div>
                  <div className={styles.stepperControls}>
                    <button type="button" className={styles.stepperBtn} onClick={() => decOpen(day.weekday, day)}>
                      −
                    </button>
                    <span className={styles.stepperValue}>{minutesLabel(day.openMinutes)}</span>
                    <button
                      type="button"
                      className={styles.stepperBtnAccent}
                      onClick={() => incOpen(day.weekday, day)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className={styles.stepperBox}>
                  <div className={styles.stepperLabel}>Fecha</div>
                  <div className={styles.stepperControls}>
                    <button type="button" className={styles.stepperBtn} onClick={() => decClose(day.weekday, day)}>
                      −
                    </button>
                    <span className={styles.stepperValue}>{minutesLabel(day.closeMinutes)}</span>
                    <button
                      type="button"
                      className={styles.stepperBtnAccent}
                      onClick={() => incClose(day.weekday, day)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.folgasHeader}>
        <h2 className={styles.sectionTitle}>Folgas e ausências</h2>
        <span className={styles.hint}>Dias em que você não vai atender</span>
      </div>

      <div className={styles.folgasList}>
        {timeOff.map((t) => (
          <div key={t.id} className={styles.folgaChip}>
            <span>
              {new Date(`${t.date}T12:00:00Z`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
            <button type="button" onClick={() => removeFolga(t.id)} aria-label="Remover folga">
              ✕
            </button>
          </div>
        ))}
        <div className={styles.addFolga}>
          <input
            type="date"
            className={styles.dateInput}
            value={newFolgaDate}
            onChange={(e) => setNewFolgaDate(e.target.value)}
          />
          <button type="button" className={styles.addFolgaBtn} onClick={addFolga} disabled={addingFolga}>
            + Adicionar
          </button>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar horários"}
      </button>
    </div>
  );
}
