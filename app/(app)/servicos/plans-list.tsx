"use client";

import { useState } from "react";
import { formatCentsBRL } from "@/lib/format";
import styles from "./servicos.module.css";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  visitsPerMonth: number;
  active: boolean;
};

const PRICE_STEP = 500; // R$5, em centavos

export function PlansList({ initialPlans }: { initialPlans: Plan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editName, setEditName] = useState("");
  const [editVisits, setEditVisits] = useState(4);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  function startEdit(p: Plan) {
    setEditingId(p.id);
    setEditPrice(p.priceCents);
    setEditName(p.name);
    setEditVisits(p.visitsPerMonth);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceCents: editPrice, name: editName, visitsPerMonth: editVisits }),
    });
    if (res.ok) {
      const { plan } = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === id ? plan : p)));
    }
    setEditingId(null);
  }

  async function remove(id: string) {
    setListError(null);
    const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setListError("Não foi possível remover o plano.");
      return;
    }
    const body = await res.json();
    if (body.deactivated) {
      setPlans((prev) => prev.map((p) => (p.id === id ? body.plan : p)));
      setListError(
        "Esse plano já tem clientes matriculados no histórico, então foi desativado em vez de removido — ele não aparece mais pra novas matrículas, mas quem já tem continua com o crédito funcionando."
      );
      return;
    }
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  async function reactivate(id: string) {
    setListError(null);
    const res = await fetch(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) {
      setListError("Não foi possível reativar o plano.");
      return;
    }
    const { plan } = await res.json();
    setPlans((prev) => prev.map((p) => (p.id === id ? plan : p)));
  }

  return (
    <div>
      <div className={styles.hint}>
        Pacote mensal de cortes que o cliente assina (ex.: "R$120/mês = 4 cortes"). A cobrança em si
        continua por fora — o app só controla quantos créditos já foram usados no mês.
      </div>
      {listError && <div className={styles.formError}>{listError}</div>}

      {plans.length === 0 && !creating ? (
        <div className={styles.empty}>Nenhum plano cadastrado ainda.</div>
      ) : (
        <div className={styles.tableHeader}>
          <span>Plano</span>
          <span>Cortes/mês</span>
          <span>Preço</span>
          <span>Ações</span>
        </div>
      )}

      <div className={styles.list}>
        {plans.map((p) =>
          editingId === p.id ? (
            <div key={p.id} className={styles.cardEditing}>
              <div className={styles.cardEditingHeader}>
                <span className={styles.badge}>EDITANDO</span>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Nome</label>
                  <input
                    className={styles.input}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className={styles.field} style={{ maxWidth: 110 }}>
                  <label className={styles.label}>Cortes/mês</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={styles.input}
                    value={editVisits}
                    onChange={(e) => setEditVisits(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className={styles.stepperRow}>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setEditPrice((v) => Math.max(0, v - PRICE_STEP))}
                >
                  −
                </button>
                <div className={styles.stepperValue}>{formatCentsBRL(editPrice)}</div>
                <button
                  type="button"
                  className={styles.stepperBtnAccent}
                  onClick={() => setEditPrice((v) => v + PRICE_STEP)}
                >
                  +
                </button>
              </div>
              <div className={styles.editActions}>
                <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={() => saveEdit(p.id)}
                  disabled={!editName.trim() || editVisits <= 0}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <div key={p.id} className={styles.card} data-inactive={!p.active}>
              <div className={styles.cardMain}>
                <div className={styles.cardName}>
                  {p.name}
                  {!p.active && <span className={styles.inactiveBadge}>INATIVO</span>}
                </div>
                <div className={styles.cardDuration}>{p.visitsPerMonth} corte{p.visitsPerMonth === 1 ? "" : "s"}/mês</div>
              </div>
              <div className={styles.cardActions}>
                <div className={styles.cardPrice}>{formatCentsBRL(p.priceCents)}</div>
                <button type="button" className={styles.editLink} onClick={() => startEdit(p)}>
                  Editar
                </button>
                {p.active ? (
                  <button
                    type="button"
                    className={styles.removeLink}
                    onClick={() => remove(p.id)}
                    aria-label={`Remover ${p.name}`}
                  >
                    ✕
                  </button>
                ) : (
                  <button type="button" className={styles.editLink} onClick={() => reactivate(p.id)}>
                    Reativar
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <NewPlanForm
          onCancel={() => setCreating(false)}
          onCreated={(plan) => {
            setPlans((prev) => [...prev, plan]);
            setCreating(false);
          }}
        />
      ) : (
        <button type="button" className={styles.newButton} onClick={() => setCreating(true)}>
          + Novo plano
        </button>
      )}
    </div>
  );
}

function NewPlanForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (plan: Plan) => void;
}) {
  const [name, setName] = useState("");
  const [visitsPerMonth, setVisitsPerMonth] = useState(4);
  const [priceReais, setPriceReais] = useState(120);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        visitsPerMonth,
        priceCents: Math.round(priceReais * 100),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Não foi possível criar o plano.");
      return;
    }
    const { plan } = await res.json();
    onCreated(plan);
  }

  return (
    <form className={styles.newForm} onSubmit={handleSubmit}>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.field}>
        <label className={styles.label}>Nome</label>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Plano Corte 4x"
          required
        />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Cortes/mês</label>
          <input
            type="number"
            min={1}
            step={1}
            className={styles.input}
            value={visitsPerMonth}
            onChange={(e) => setVisitsPerMonth(Number(e.target.value))}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Preço (R$/mês)</label>
          <input
            type="number"
            min={0}
            step={5}
            className={styles.input}
            value={priceReais}
            onChange={(e) => setPriceReais(Number(e.target.value))}
            required
          />
        </div>
      </div>
      <div className={styles.editActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.saveBtn} disabled={loading}>
          {loading ? "Criando..." : "Criar plano"}
        </button>
      </div>
    </form>
  );
}
