"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCentsBRL } from "@/lib/format";

// Compartilhado entre Início (meta do dia) e Painel (meta do mês) — mesmo
// componente, só troca o campo salvo e o texto. Recebe `styles` de fora
// porque CSS Modules são isolados por arquivo; cada tela já tem as classes
// .goalEdit/.goalInput/etc. definidas no próprio módulo (mesmo nome, visual
// igual, pensado pro fundo escuro do card de faturamento das duas telas).
export function GoalEditor({
  goalCents,
  revenueCents,
  field,
  label,
  styles,
}: {
  goalCents: number | null;
  revenueCents: number;
  field: "monthlyGoalCents" | "dailyGoalCents";
  label: string;
  styles: Record<string, string>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goalCents ? String(Math.round(goalCents / 100)) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const cents = Math.round(Number(value) * 100);
    if (!cents || cents <= 0) return;
    setSaving(true);
    await fetch("/api/barbershop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: cents }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className={styles.goalEdit}>
        <input
          type="number"
          min={1}
          className={styles.goalInput}
          placeholder="Meta em R$"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button type="button" className={styles.goalSaveBtn} onClick={save} disabled={saving}>
          {saving ? "..." : "Salvar"}
        </button>
      </div>
    );
  }

  if (!goalCents) {
    return (
      <button type="button" className={styles.goalSetBtn} onClick={() => setEditing(true)}>
        + Definir {label}
      </button>
    );
  }

  const pct = Math.min(100, Math.round((revenueCents / goalCents) * 100));
  const remaining = Math.max(0, goalCents - revenueCents);

  return (
    <div className={styles.goalBlock}>
      <div className={styles.goalTrack}>
        <div className={styles.goalFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.goalCaption}>
        <span>
          {remaining === 0
            ? `Meta de ${formatCentsBRL(goalCents)} batida! 🎉`
            : `Faltam ${formatCentsBRL(remaining)} para bater a ${label} de ${formatCentsBRL(goalCents)}`}
        </span>
        <button type="button" className={styles.goalEditLink} onClick={() => setEditing(true)}>
          Editar
        </button>
      </div>
    </div>
  );
}
