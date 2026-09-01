"use client";

import { useState } from "react";
import { formatDateShort, formatTime } from "@/lib/format";
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
const BREAK_DURATION_STEP = 15;
const MIN_BREAK_DURATION = 15;
const MAX_BREAK_DURATION = 240;

type Day = {
  weekday: number;
  isOpen: boolean;
  openMinutes: number;
  closeMinutes: number;
  breakStartMinutes: number | null;
  breakDurationMin: number | null;
};

type TimeOffEntry = { id: string; date: string; reason: string | null };
type TimeBlockEntry = { id: string; staffId: string | null; startTime: string; endTime: string; reason: string | null };
type StaffOption = { id: string; name: string };

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
        breakStartMinutes: null,
        breakDurationMin: null,
      }
    );
  });
}

export function ScheduleForm({
  initialDays,
  initialTimeOff,
  initialTimeBlocks = [],
  staffOptions = [],
}: {
  initialDays: Day[];
  initialTimeOff: TimeOffEntry[];
  initialTimeBlocks?: TimeBlockEntry[];
  staffOptions?: StaffOption[];
}) {
  const [days, setDays] = useState<Day[]>(buildInitialDays(initialDays));
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [newFolgaDate, setNewFolgaDate] = useState("");
  const [addingFolga, setAddingFolga] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [timeBlocks, setTimeBlocks] = useState(initialTimeBlocks);
  const [newBlockStaffId, setNewBlockStaffId] = useState(""); // "" = barbearia inteira
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockStart, setNewBlockStart] = useState("14:00");
  const [newBlockEnd, setNewBlockEnd] = useState("15:00");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

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

  function toggleBreak(weekday: number, day: Day) {
    if (day.breakStartMinutes != null) {
      updateDay(weekday, { breakStartMinutes: null, breakDurationMin: null });
      return;
    }
    // Sugere meio-dia (ou o início do expediente, se abrir depois disso)
    // com 1h de duração — ponto de partida razoável, o barbeiro ajusta.
    const suggestedStart = Math.max(day.openMinutes, Math.min(12 * 60, day.closeMinutes - 60));
    updateDay(weekday, { breakStartMinutes: suggestedStart, breakDurationMin: 60 });
  }

  function decBreakStart(weekday: number, day: Day) {
    if (day.breakStartMinutes == null) return;
    const next = Math.max(day.openMinutes, day.breakStartMinutes - STEP);
    updateDay(weekday, { breakStartMinutes: next });
  }
  function incBreakStart(weekday: number, day: Day) {
    if (day.breakStartMinutes == null || day.breakDurationMin == null) return;
    const next = Math.min(day.closeMinutes - day.breakDurationMin, day.breakStartMinutes + STEP);
    updateDay(weekday, { breakStartMinutes: next });
  }
  function decBreakDuration(weekday: number, day: Day) {
    if (day.breakDurationMin == null) return;
    const next = Math.max(MIN_BREAK_DURATION, day.breakDurationMin - BREAK_DURATION_STEP);
    updateDay(weekday, { breakDurationMin: next });
  }
  function incBreakDuration(weekday: number, day: Day) {
    if (day.breakStartMinutes == null || day.breakDurationMin == null) return;
    const maxByClose = day.closeMinutes - day.breakStartMinutes;
    const next = Math.min(MAX_BREAK_DURATION, maxByClose, day.breakDurationMin + BREAK_DURATION_STEP);
    updateDay(weekday, { breakDurationMin: next });
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

  async function addTimeBlock() {
    if (!newBlockDate) return;
    setAddingBlock(true);
    setBlockError(null);
    // Mesma conversão data+hora local (Brasil) → instante UTC já usada pra
    // criar agendamento manual (ver new-appointment-modal.tsx).
    const startTime = new Date(`${newBlockDate}T${newBlockStart}:00-03:00`).toISOString();
    const endTime = new Date(`${newBlockDate}T${newBlockEnd}:00-03:00`).toISOString();
    const res = await fetch("/api/time-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId: newBlockStaffId || undefined,
        startTime,
        endTime,
        reason: newBlockReason || undefined,
      }),
    });
    setAddingBlock(false);
    if (!res.ok) {
      setBlockError("Não foi possível criar o bloqueio — confira se o fim é depois do início.");
      return;
    }
    const { timeBlock } = await res.json();
    setTimeBlocks((prev) => [...prev, timeBlock].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    setNewBlockReason("");
  }

  async function removeTimeBlock(id: string) {
    setTimeBlocks((prev) => prev.filter((b) => b.id !== id));
    await fetch(`/api/time-blocks?id=${id}`, { method: "DELETE" });
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

            {editingDay === day.weekday && day.isOpen && (
              <div className={styles.breakRow}>
                <label className={styles.breakToggleLabel}>
                  <button
                    type="button"
                    className={styles.switch}
                    data-on={day.breakStartMinutes != null}
                    onClick={() => toggleBreak(day.weekday, day)}
                    aria-label={day.breakStartMinutes != null ? "Remover pausa" : "Adicionar pausa (almoço)"}
                  >
                    <span className={styles.switchKnob} />
                  </button>
                  Pausa (almoço)
                </label>

                {day.breakStartMinutes != null && day.breakDurationMin != null && (
                  <div className={styles.editorRow}>
                    <div className={styles.stepperBox}>
                      <div className={styles.stepperLabel}>Início</div>
                      <div className={styles.stepperControls}>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() => decBreakStart(day.weekday, day)}
                        >
                          −
                        </button>
                        <span className={styles.stepperValue}>{minutesLabel(day.breakStartMinutes)}</span>
                        <button
                          type="button"
                          className={styles.stepperBtnAccent}
                          onClick={() => incBreakStart(day.weekday, day)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className={styles.stepperBox}>
                      <div className={styles.stepperLabel}>Duração</div>
                      <div className={styles.stepperControls}>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() => decBreakDuration(day.weekday, day)}
                        >
                          −
                        </button>
                        <span className={styles.stepperValue}>{day.breakDurationMin}min</span>
                        <button
                          type="button"
                          className={styles.stepperBtnAccent}
                          onClick={() => incBreakDuration(day.weekday, day)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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

      <div className={styles.folgasHeader} style={{ marginTop: 28 }}>
        <h2 className={styles.sectionTitle}>Bloqueios pontuais</h2>
        <span className={styles.hint}>
          Intervalos avulsos (ex.: 14h–15h hoje), além da pausa de almoço e das folgas — dá pra travar só um
          profissional ou a barbearia inteira.
        </span>
      </div>

      <div className={styles.folgasList} style={{ flexDirection: "column", alignItems: "stretch" }}>
        {timeBlocks.map((b) => (
          <div key={b.id} className={styles.blockRow}>
            <div>
              <div className={styles.blockRange}>
                {formatDateShort(new Date(b.startTime))} · {formatTime(new Date(b.startTime))}–
                {formatTime(new Date(b.endTime))}
              </div>
              <div className={styles.blockMeta}>
                {b.staffId ? staffOptions.find((s) => s.id === b.staffId)?.name ?? "Profissional" : "Barbearia inteira"}
                {b.reason ? ` · ${b.reason}` : ""}
              </div>
            </div>
            <button type="button" onClick={() => removeTimeBlock(b.id)} aria-label="Remover bloqueio">
              ✕
            </button>
          </div>
        ))}

        <div className={styles.addBlockForm}>
          {blockError && <div className={styles.blockError}>{blockError}</div>}
          {staffOptions.length > 1 && (
            <select
              className={styles.dateInput}
              value={newBlockStaffId}
              onChange={(e) => setNewBlockStaffId(e.target.value)}
            >
              <option value="">Barbearia inteira</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className={styles.addBlockRow}>
            <input
              type="date"
              className={styles.dateInput}
              value={newBlockDate}
              onChange={(e) => setNewBlockDate(e.target.value)}
            />
            <input
              type="time"
              className={styles.dateInput}
              value={newBlockStart}
              onChange={(e) => setNewBlockStart(e.target.value)}
            />
            <input
              type="time"
              className={styles.dateInput}
              value={newBlockEnd}
              onChange={(e) => setNewBlockEnd(e.target.value)}
            />
          </div>
          <input
            type="text"
            className={styles.dateInput}
            placeholder="Motivo (opcional)"
            value={newBlockReason}
            onChange={(e) => setNewBlockReason(e.target.value)}
          />
          <button type="button" className={styles.addFolgaBtn} onClick={addTimeBlock} disabled={addingBlock}>
            + Adicionar bloqueio
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
