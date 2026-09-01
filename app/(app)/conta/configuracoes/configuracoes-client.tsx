"use client";

import { useState } from "react";
import styles from "./configuracoes.module.css";

type Settings = {
  depositRequired: boolean;
  depositType: "FIXED" | "PERCENT" | null;
  depositValue: number | null;
  cancellationHoursForFullRefund: number;
  defaultServiceCommissionBps: number;
  defaultProductCommissionBps: number;
};

// bps <-> % de exibição (4000 bps = 40%).
const bpsToPct = (bps: number) => bps / 100;
const pctToBps = (pct: number) => Math.round(pct * 100);

export function ConfiguracoesClient({ initialSettings }: { initialSettings: Settings }) {
  const [servicePct, setServicePct] = useState(bpsToPct(initialSettings.defaultServiceCommissionBps));
  const [productPct, setProductPct] = useState(bpsToPct(initialSettings.defaultProductCommissionBps));
  const [depositRequired, setDepositRequired] = useState(initialSettings.depositRequired);
  const [depositType, setDepositType] = useState<"FIXED" | "PERCENT">(initialSettings.depositType ?? "PERCENT");
  const [depositValue, setDepositValue] = useState(initialSettings.depositValue ?? 30);
  const [cancellationHours, setCancellationHours] = useState(initialSettings.cancellationHoursForFullRefund);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultServiceCommissionBps: pctToBps(servicePct),
        defaultProductCommissionBps: pctToBps(productPct),
        depositRequired,
        depositType,
        depositValue: depositRequired ? Math.round(depositValue * (depositType === "FIXED" ? 100 : 1)) : null,
        cancellationHoursForFullRefund: cancellationHours,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Não foi possível salvar as configurações.");
      return;
    }
    setSaved(true);
  }

  return (
    <div>
      <div className={styles.sectionLabel}>Comissão padrão</div>
      <div className={styles.hint}>
        Aplicada em toda venda de serviço/produto na comanda. Mesma taxa pra todos os profissionais por
        enquanto — comissão por profissional é uma evolução futura.
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Serviço (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className={styles.input}
            value={servicePct}
            onChange={(e) => setServicePct(Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Produto (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className={styles.input}
            value={productPct}
            onChange={(e) => setProductPct(Number(e.target.value))}
          />
        </div>
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 24 }}>
        Sinal antecipado
      </div>
      <div className={styles.hint}>
        Com o sinal ativado, o cliente paga pelo Mercado Pago na hora de agendar pela página pública — o
        horário só é confirmado depois do pagamento. Enquanto a barbearia não estiver conectada ao Mercado
        Pago (em breve), o valor cai na conta da Nexo e o repasse pro seu banco é combinado por fora.
      </div>
      <label className={styles.toggleRow}>
        <span>Exigir sinal para confirmar</span>
        <input
          type="checkbox"
          checked={depositRequired}
          onChange={(e) => setDepositRequired(e.target.checked)}
        />
      </label>
      {depositRequired && (
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Tipo</label>
            <select
              className={styles.input}
              value={depositType}
              onChange={(e) => setDepositType(e.target.value as "FIXED" | "PERCENT")}
            >
              <option value="PERCENT">% do serviço</option>
              <option value="FIXED">Valor fixo (R$)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{depositType === "FIXED" ? "Valor (R$)" : "Percentual (%)"}</label>
            <input
              type="number"
              min={0}
              className={styles.input}
              value={depositValue}
              onChange={(e) => setDepositValue(Number(e.target.value))}
            />
          </div>
        </div>
      )}
      <div className={styles.field} style={{ marginTop: 14 }}>
        <label className={styles.label}>Reembolso total se cancelar com mais de (horas)</label>
        <input
          type="number"
          min={0}
          className={styles.input}
          value={cancellationHours}
          onChange={(e) => setCancellationHours(Number(e.target.value))}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {saved && <div className={styles.success}>Configurações salvas.</div>}
      <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}
