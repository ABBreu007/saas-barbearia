"use client";

import { useState } from "react";
import { formatCentsBRL } from "@/lib/format";
import styles from "./servicos.module.css";

type Service = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  active: boolean;
};

const PRICE_STEP = 500; // R$5, em centavos

export function ServicesList({ initialServices }: { initialServices: Service[] }) {
  const [services, setServices] = useState(initialServices);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditPrice(s.priceCents);
    setEditName(s.name);
    setEditDuration(s.durationMin);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceCents: editPrice, name: editName, durationMin: editDuration }),
    });
    if (res.ok) {
      const { service } = await res.json();
      setServices((prev) => prev.map((s) => (s.id === id ? service : s)));
    }
    setEditingId(null);
  }

  async function remove(id: string) {
    setListError(null);
    const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setListError("Não foi possível remover o serviço.");
      return;
    }
    const body = await res.json();
    if (body.deactivated) {
      setServices((prev) => prev.map((s) => (s.id === id ? body.service : s)));
      setListError(
        "Esse serviço já tem agendamentos no histórico, então foi desativado em vez de removido — ele não aparece mais pra novos agendamentos, mas o histórico continua no Painel."
      );
      return;
    }
    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  async function reactivate(id: string) {
    setListError(null);
    const res = await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) {
      setListError("Não foi possível reativar o serviço.");
      return;
    }
    const { service } = await res.json();
    setServices((prev) => prev.map((s) => (s.id === id ? service : s)));
  }

  return (
    <div>
      <div className={styles.hint}>Toque em &quot;Editar&quot; para mudar o preço</div>
      {listError && <div className={styles.formError}>{listError}</div>}

      {services.length === 0 && !creating ? (
        <div className={styles.empty}>
          Nenhum serviço cadastrado ainda — crie o primeiro pra começar a receber agendamentos.
        </div>
      ) : (
        <div className={styles.tableHeader}>
          <span>Serviço</span>
          <span>Duração</span>
          <span>Preço</span>
          <span>Ações</span>
        </div>
      )}

      <div className={styles.list}>
        {services.map((s) =>
          editingId === s.id ? (
            <div key={s.id} className={styles.cardEditing}>
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
                  <label className={styles.label}>Duração (min)</label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    className={styles.input}
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className={styles.stepperRow}>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setEditPrice((p) => Math.max(0, p - PRICE_STEP))}
                >
                  −
                </button>
                <div className={styles.stepperValue}>{formatCentsBRL(editPrice)}</div>
                <button
                  type="button"
                  className={styles.stepperBtnAccent}
                  onClick={() => setEditPrice((p) => p + PRICE_STEP)}
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
                  onClick={() => saveEdit(s.id)}
                  disabled={!editName.trim() || editDuration <= 0}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <div key={s.id} className={styles.card} data-inactive={!s.active}>
              <div className={styles.cardMain}>
                <div className={styles.cardName}>
                  {s.name}
                  {!s.active && <span className={styles.inactiveBadge}>INATIVO</span>}
                </div>
                <div className={styles.cardDuration}>{s.durationMin} min</div>
              </div>
              <div className={styles.cardActions}>
                <div className={styles.cardPrice}>{formatCentsBRL(s.priceCents)}</div>
                <button type="button" className={styles.editLink} onClick={() => startEdit(s)}>
                  Editar
                </button>
                {s.active ? (
                  <button
                    type="button"
                    className={styles.removeLink}
                    onClick={() => remove(s.id)}
                    aria-label={`Remover ${s.name}`}
                  >
                    ✕
                  </button>
                ) : (
                  <button type="button" className={styles.editLink} onClick={() => reactivate(s.id)}>
                    Reativar
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <NewServiceForm
          onCancel={() => setCreating(false)}
          onCreated={(service) => {
            setServices((prev) => [...prev, service]);
            setCreating(false);
          }}
        />
      ) : (
        <button type="button" className={styles.newButton} onClick={() => setCreating(true)}>
          + Novo serviço
        </button>
      )}
    </div>
  );
}

function NewServiceForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (service: Service) => void;
}) {
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [priceReais, setPriceReais] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        durationMin,
        priceCents: Math.round(priceReais * 100),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Não foi possível criar o serviço.");
      return;
    }
    const { service } = await res.json();
    onCreated(service);
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
          required
        />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Duração (min)</label>
          <input
            type="number"
            min={5}
            step={5}
            className={styles.input}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Preço (R$)</label>
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
          {loading ? "Criando..." : "Criar serviço"}
        </button>
      </div>
    </form>
  );
}
