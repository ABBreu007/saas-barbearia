"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./conta.module.css";

export function ModeSwitcher({ mode }: { mode: "DONO" | "AUTONOMO" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setMode(newMode: "DONO" | "AUTONOMO") {
    if (newMode === mode || loading) return;
    setLoading(true);
    await fetch("/api/barbershop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className={styles.segmented}>
      <button
        type="button"
        className={styles.segmentedItem}
        data-active={mode === "DONO"}
        onClick={() => setMode("DONO")}
      >
        Dono da barbearia
      </button>
      <button
        type="button"
        className={styles.segmentedItem}
        data-active={mode === "AUTONOMO"}
        onClick={() => setMode("AUTONOMO")}
      >
        Autônomo
      </button>
    </div>
  );
}
