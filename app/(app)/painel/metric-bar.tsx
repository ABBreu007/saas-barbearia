"use client";

import { useState } from "react";
import { formatCentsBRL } from "@/lib/format";
import styles from "./painel.module.css";

// Todo o detalhe do drill-down já veio junto na consulta de métricas — não
// busca nada de novo ao abrir, só reexibe em modal o que já está na página.
export function ServiceBar({
  name,
  count,
  revenueCents,
  pct,
}: {
  name: string;
  count: number;
  revenueCents: number;
  pct: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.barRowBtn} onClick={() => setOpen(true)}>
        <div className={styles.barHeader}>
          <span>
            {name}
            <span className={styles.staffCount}> · {count}x</span>
          </span>
          <span className={styles.barValue}>{formatCentsBRL(revenueCents)}</span>
        </div>
        <div className={styles.barTrack}>
          <div className={styles.barFill} style={{ width: `${pct}%` }} />
        </div>
      </button>

      {open && (
        <div className={styles.modalOverlay} onClick={() => setOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>{name}</div>
            <div className={styles.modalRow}>
              <span>Atendimentos no período</span>
              <span className={styles.modalValue}>{count}</span>
            </div>
            <div className={styles.modalRow}>
              <span>Faturamento gerado</span>
              <span className={styles.modalValue}>{formatCentsBRL(revenueCents)}</span>
            </div>
            <button type="button" className={styles.modalCloseBtn} onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
