"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./clientes.module.css";

type AvailablePlan = { id: string; name: string; visitsPerMonth: number };
type CurrentPlan = { status: "PENDING" | "ACTIVE"; planName: string; used: number; visitsPerMonth: number } | null;

export function PlanCell({
  clientId,
  clientPlan,
  availablePlans,
}: {
  clientId: string;
  clientPlan: CurrentPlan;
  availablePlans: AvailablePlan[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);

  async function enroll(planId: string) {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    setLoading(false);
    setPicking(false);
    if (res.ok) router.refresh();
  }

  async function approve() {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/plan`, { method: "PATCH" });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  async function cancel() {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/plan`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  if (clientPlan?.status === "PENDING") {
    return (
      <div className={styles.planCell}>
        <span className={styles.planPendingBadge}>Pedido: {clientPlan.planName}</span>
        <button type="button" className={styles.planApproveLink} onClick={approve} disabled={loading}>
          Aprovar
        </button>
        <button type="button" className={styles.planCancelLink} onClick={cancel} disabled={loading}>
          Recusar
        </button>
      </div>
    );
  }

  if (clientPlan?.status === "ACTIVE") {
    return (
      <div className={styles.planCell}>
        <span className={styles.planBadge}>
          {clientPlan.planName} · {clientPlan.used}/{clientPlan.visitsPerMonth}
        </span>
        <button type="button" className={styles.planCancelLink} onClick={cancel} disabled={loading}>
          Cancelar
        </button>
      </div>
    );
  }

  if (picking) {
    if (availablePlans.length === 0) {
      return <span>Nenhum plano ativo</span>;
    }
    return (
      <select
        className={styles.planSelect}
        disabled={loading}
        defaultValue=""
        onChange={(e) => e.target.value && enroll(e.target.value)}
        onBlur={() => setPicking(false)}
        autoFocus
      >
        <option value="" disabled>
          Escolher plano...
        </option>
        {availablePlans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button type="button" className={styles.followUpButton} onClick={() => setPicking(true)}>
      Assinar
    </button>
  );
}
