"use client";

import { useState } from "react";
import { formatCentsBRL, formatDateShort, formatTime } from "@/lib/format";
import styles from "./caixa.module.css";

type Movement = {
  id: string;
  type: "SALE" | "EXPENSE" | "WITHDRAWAL" | "ADJUSTMENT";
  amountCents: number;
  description: string | null;
  createdAt: string | Date;
};

type CashRegister = {
  id: string;
  date: string | Date;
  status: "OPEN" | "CLOSED";
  openingBalanceCents: number;
  closedAt: string | Date | null;
  countedClosingBalanceCents: number | null;
  expectedClosingBalanceCents: number | null;
  movements: Movement[];
};

type RecentRegister = Omit<CashRegister, "movements">;

type RefundPending = {
  id: string;
  amountCents: number;
  refundReason: string | null;
  appointment: {
    startTime: string | Date;
    client: { name: string };
    service: { name: string };
  };
};

const MOVEMENT_LABEL: Record<Movement["type"], string> = {
  SALE: "Venda (comanda)",
  EXPENSE: "Despesa",
  WITHDRAWAL: "Sangria",
  ADJUSTMENT: "Ajuste",
};

const REFUND_REASON_LABEL: Record<string, string> = {
  late_cancellation: "Cancelado em cima da hora",
  auto_refund_failed: "Estorno automático falhou",
};

export function CaixaClient({
  initialToday,
  initialRecent,
  heldDepositsCents,
  initialRefundPending,
}: {
  initialToday: CashRegister | null;
  initialRecent: RecentRegister[];
  heldDepositsCents: number;
  initialRefundPending: RefundPending[];
}) {
  const [today, setToday] = useState(initialToday);
  const [recent] = useState(initialRecent);
  const [refundPending, setRefundPending] = useState(initialRefundPending);

  const currentBalanceCents =
    today ? today.openingBalanceCents + today.movements.reduce((sum, m) => sum + m.amountCents, 0) : 0;

  const heldDepositsBanner = heldDepositsCents > 0 && (
    <div className={styles.depositAlert}>
      {formatCentsBRL(heldDepositsCents)} em sinais de clientes estão na conta Mercado Pago da Nexo, ainda sem
      repasse automático pro seu banco. Fale com o suporte pra combinar o repasse.
    </div>
  );

  const refundPendingSection = refundPending.length > 0 && (
    <>
      <div className={styles.sectionLabel}>Reembolsos pendentes</div>
      <div className={styles.refundList}>
        {refundPending.map((p) => (
          <RefundRow
            key={p.id}
            payment={p}
            onResolved={(id) => setRefundPending((prev) => prev.filter((r) => r.id !== id))}
          />
        ))}
      </div>
    </>
  );

  if (!today) {
    return (
      <>
        {heldDepositsBanner}
        {refundPendingSection}
        <OpenForm
          onOpened={(cashRegister) => setToday({ ...cashRegister, movements: [] })}
        />
      </>
    );
  }

  return (
    <div>
      {heldDepositsBanner}
      {refundPendingSection}
      <div className={styles.summaryCard} data-status={today.status}>
        <div className={styles.summaryRow}>
          <span>Status</span>
          <span className={styles.summaryStatus}>{today.status === "OPEN" ? "Aberto" : "Fechado"}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Saldo inicial</span>
          <span>{formatCentsBRL(today.openingBalanceCents)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>{today.status === "OPEN" ? "Saldo atual" : "Esperado"}</span>
          <span className={styles.summaryBig}>
            {formatCentsBRL(today.status === "OPEN" ? currentBalanceCents : today.expectedClosingBalanceCents ?? 0)}
          </span>
        </div>
        {today.status === "CLOSED" && (
          <>
            <div className={styles.summaryRow}>
              <span>Contado</span>
              <span>{formatCentsBRL(today.countedClosingBalanceCents ?? 0)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Diferença</span>
              <span
                className={styles.summaryDiff}
                data-negative={(today.countedClosingBalanceCents ?? 0) - (today.expectedClosingBalanceCents ?? 0) < 0}
              >
                {formatCentsBRL((today.countedClosingBalanceCents ?? 0) - (today.expectedClosingBalanceCents ?? 0))}
              </span>
            </div>
          </>
        )}
      </div>

      <div className={styles.sectionLabel}>Movimentos de hoje</div>
      {today.movements.length === 0 ? (
        <div className={styles.empty}>Nenhum movimento ainda.</div>
      ) : (
        <div className={styles.movementList}>
          {today.movements.map((m) => (
            <div key={m.id} className={styles.movementRow}>
              <div>
                <div className={styles.movementType}>{MOVEMENT_LABEL[m.type]}</div>
                {m.description && <div className={styles.movementDesc}>{m.description}</div>}
                <div className={styles.movementTime}>{formatTime(new Date(m.createdAt))}</div>
              </div>
              <div className={styles.movementAmount} data-negative={m.amountCents < 0}>
                {m.amountCents >= 0 ? "+" : ""}
                {formatCentsBRL(m.amountCents)}
              </div>
            </div>
          ))}
        </div>
      )}

      {today.status === "OPEN" && (
        <>
          <AddMovementForm
            cashRegisterId={today.id}
            onAdded={(movement) =>
              setToday((prev) => (prev ? { ...prev, movements: [...prev.movements, movement] } : prev))
            }
          />
          <CloseForm
            cashRegisterId={today.id}
            onClosed={(cashRegister) =>
              setToday((prev) => (prev ? { ...prev, ...cashRegister } : prev))
            }
          />
        </>
      )}

      {recent.length > 0 && (
        <>
          <div className={styles.sectionLabel} style={{ marginTop: 28 }}>
            Histórico
          </div>
          <div className={styles.historyList}>
            {recent.map((r) => (
              <div key={r.id} className={styles.historyRow}>
                <span>{formatDateShort(new Date(r.date))}</span>
                <span className={styles.historyStatus} data-status={r.status}>
                  {r.status === "OPEN" ? "Aberto" : "Fechado"}
                </span>
                <span>
                  {r.status === "CLOSED" ? formatCentsBRL(r.expectedClosingBalanceCents ?? 0) : "—"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RefundRow({
  payment,
  onResolved,
}: {
  payment: RefundPending;
  onResolved: (id: string) => void;
}) {
  const [loading, setLoading] = useState<"refund" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "refund" | "deny") {
    setLoading(action);
    setError(null);
    const res = await fetch(`/api/payments/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    if (!res.ok) {
      setError(action === "refund" ? "Não foi possível estornar." : "Não foi possível salvar.");
      return;
    }
    onResolved(payment.id);
  }

  return (
    <div className={styles.refundRow}>
      <div>
        <div className={styles.movementType}>
          {payment.appointment.client.name} · {payment.appointment.service.name}
        </div>
        <div className={styles.movementDesc}>
          {formatDateShort(new Date(payment.appointment.startTime))} ·{" "}
          {REFUND_REASON_LABEL[payment.refundReason ?? ""] ?? payment.refundReason}
        </div>
      </div>
      <div className={styles.refundRowActions}>
        <div className={styles.movementAmount}>{formatCentsBRL(payment.amountCents)}</div>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.editActions}>
          <button
            type="button"
            className={styles.cancelBtn}
            disabled={loading !== null}
            onClick={() => resolve("deny")}
          >
            {loading === "deny" ? "Salvando..." : "Manter valor"}
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={loading !== null}
            onClick={() => resolve("refund")}
          >
            {loading === "refund" ? "Estornando..." : "Reembolsar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OpenForm({ onOpened }: { onOpened: (cashRegister: CashRegister) => void }) {
  const [openingReais, setOpeningReais] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/cash-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingBalanceCents: Math.round(openingReais * 100) }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Não foi possível abrir o caixa.");
      return;
    }
    const { cashRegister } = await res.json();
    onOpened(cashRegister);
  }

  return (
    <form className={styles.openForm} onSubmit={handleSubmit}>
      <div className={styles.empty}>Caixa ainda não foi aberto hoje.</div>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.field}>
        <label className={styles.label}>Saldo inicial (R$)</label>
        <input
          type="number"
          min={0}
          step={5}
          className={styles.input}
          value={openingReais}
          onChange={(e) => setOpeningReais(Number(e.target.value))}
        />
      </div>
      <button type="submit" className={styles.primaryBtn} disabled={loading}>
        {loading ? "Abrindo..." : "Abrir caixa"}
      </button>
    </form>
  );
}

function AddMovementForm({
  cashRegisterId,
  onAdded,
}: {
  cashRegisterId: string;
  onAdded: (movement: Movement) => void;
}) {
  const [type, setType] = useState<"EXPENSE" | "WITHDRAWAL" | "ADJUSTMENT">("EXPENSE");
  const [amountReais, setAmountReais] = useState(0);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/cash-register/${cashRegisterId}/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        amountCents: Math.round(amountReais * 100),
        description: description || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Não foi possível lançar o movimento.");
      return;
    }
    const { movement } = await res.json();
    onAdded(movement);
    setAmountReais(0);
    setDescription("");
  }

  return (
    <form className={styles.movementForm} onSubmit={handleSubmit}>
      <div className={styles.sectionLabel}>Lançar despesa/sangria/ajuste</div>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Tipo</label>
          <select className={styles.input} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="EXPENSE">Despesa</option>
            <option value="WITHDRAWAL">Sangria</option>
            <option value="ADJUSTMENT">Ajuste (+/-)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Valor (R$)</label>
          <input
            type="number"
            step={1}
            className={styles.input}
            value={amountReais}
            onChange={(e) => setAmountReais(Number(e.target.value))}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Descrição (opcional)</label>
        <input className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button type="submit" className={styles.secondaryBtn} disabled={loading || amountReais === 0}>
        {loading ? "Lançando..." : "Lançar"}
      </button>
    </form>
  );
}

function CloseForm({
  cashRegisterId,
  onClosed,
}: {
  cashRegisterId: string;
  onClosed: (cashRegister: Partial<CashRegister>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [countedReais, setCountedReais] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/cash-register/${cashRegisterId}/close`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countedClosingBalanceCents: Math.round(countedReais * 100) }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Não foi possível fechar o caixa.");
      return;
    }
    const { cashRegister } = await res.json();
    onClosed(cashRegister);
  }

  if (!open) {
    return (
      <button type="button" className={styles.closeBtn} onClick={() => setOpen(true)}>
        Fechar caixa
      </button>
    );
  }

  return (
    <form className={styles.movementForm} onSubmit={handleSubmit}>
      <div className={styles.sectionLabel}>Contagem do fechamento</div>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.field}>
        <label className={styles.label}>Valor contado (R$)</label>
        <input
          type="number"
          min={0}
          step={1}
          className={styles.input}
          value={countedReais}
          onChange={(e) => setCountedReais(Number(e.target.value))}
        />
      </div>
      <div className={styles.editActions}>
        <button type="button" className={styles.cancelBtn} onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className={styles.saveBtn} disabled={loading}>
          {loading ? "Fechando..." : "Confirmar fechamento"}
        </button>
      </div>
    </form>
  );
}
