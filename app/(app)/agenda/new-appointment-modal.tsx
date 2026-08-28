"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./agenda.module.css";

// Campos de data/hora com máscara própria (dd/mm/aaaa e hh:mm 24h), em vez
// de <input type="date"/"time"> nativos — o navegador exibe esses inputs
// nativos no formato do idioma/SO da máquina do usuário (podendo virar
// mm/dd/aaaa ou AM/PM), o que não dá pra controlar via CSS/JS. Mantendo o
// valor interno em ISO (yyyy-mm-dd / HH:mm, o que a API espera) e só a
// exibição com máscara, garantimos o mesmo formato em qualquer navegador.
function DateField({
  value,
  onChange,
  className,
}: {
  value: string; // yyyy-mm-dd
  onChange: (isoDate: string) => void;
  className: string;
}) {
  const [display, setDisplay] = useState(() => isoDateToDisplay(value));

  useEffect(() => {
    setDisplay(isoDateToDisplay(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    setDisplay(maskDate(digits));
    if (digits.length === 8) {
      const day = Number(digits.slice(0, 2));
      const month = Number(digits.slice(2, 4));
      const year = Number(digits.slice(4, 8));
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
        onChange(`${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`);
      }
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      className={className}
      value={display}
      onChange={handleChange}
      required
    />
  );
}

function TimeField({
  value,
  onChange,
  className,
}: {
  value: string; // HH:mm
  onChange: (time: string) => void;
  className: string;
}) {
  const [display, setDisplay] = useState(() => maskTime(value.replace(/\D/g, "")));

  useEffect(() => {
    setDisplay(maskTime(value.replace(/\D/g, "")));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    setDisplay(maskTime(digits));
    if (digits.length === 4) {
      const hh = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        onChange(`${digits.slice(0, 2)}:${digits.slice(2, 4)}`);
      }
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="hh:mm"
      maxLength={5}
      className={className}
      value={display}
      onChange={handleChange}
      required
    />
  );
}

function isoDateToDisplay(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function maskDate(digits: string): string {
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

function maskTime(digits: string): string {
  if (digits.length > 2) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return digits;
}

type ServiceOption = { id: string; name: string; durationMin: number; priceCents: number };
type StaffOption = { id: string; name: string };

export function NewAppointmentButton({
  services,
  staffOptions,
  defaultStaffId,
  defaultDate,
}: {
  services: ServiceOption[];
  staffOptions: StaffOption[];
  defaultStaffId: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [staffId, setStaffId] = useState(defaultStaffId);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientPlan, setClientPlan] = useState<{ planName: string; remaining: number } | null>(null);
  const [useClientPlan, setUseClientPlan] = useState(false);

  // Ao sair do campo de telefone, busca se esse número já tem plano de
  // assinatura ativo — pra oferecer a opção de usar 1 crédito em vez de
  // cobrar avulso. Se o cliente ainda não existir ou não tiver plano, some
  // a opção silenciosamente (comportamento normal, não é erro).
  async function lookupPhone() {
    setClientPlan(null);
    setUseClientPlan(false);
    if (clientPhone.trim().length < 8) return;
    const res = await fetch(`/api/clients/lookup?phone=${encodeURIComponent(clientPhone.trim())}`);
    if (!res.ok) return;
    const body = await res.json();
    if (body.clientPlan) {
      setClientPlan({ planName: body.clientPlan.plan.name, remaining: body.clientPlan.remaining });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // "-03:00" fixo: América/São Paulo não tem mais horário de verão desde
    // 2019, então a data+hora escolhidas pelo barbeiro sempre são nesse
    // offset, independente do fuso do navegador de quem está digitando.
    const startTime = new Date(`${date}T${time}:00-03:00`).toISOString();

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        clientPhone,
        serviceId,
        staffId,
        startTime,
        useClientPlan: useClientPlan || undefined,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "slot_unavailable"
          ? "Já existe um agendamento nesse horário."
          : body?.error === "no_credits_left"
            ? "Esse cliente já usou todos os créditos do plano neste mês."
            : "Não foi possível criar o agendamento."
      );
      return;
    }

    setOpen(false);
    setClientName("");
    setClientPhone("");
    setClientPlan(null);
    setUseClientPlan(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className={styles.newButton} onClick={() => setOpen(true)} type="button">
        + Novo agendamento
      </button>
    );
  }

  return (
    <div className={styles.modalOverlay} onClick={() => setOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Novo agendamento</h2>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          {error && <div className={styles.modalError}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Cliente</label>
            <input
              className={styles.input}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Telefone</label>
            <input
              className={styles.input}
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              onBlur={lookupPhone}
              placeholder="11999998888"
              required
            />
          </div>

          {clientPlan && (
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={useClientPlan}
                onChange={(e) => setUseClientPlan(e.target.checked)}
                disabled={clientPlan.remaining <= 0}
              />
              {clientPlan.remaining > 0
                ? `Usar crédito do plano "${clientPlan.planName}" (${clientPlan.remaining} restante${clientPlan.remaining === 1 ? "" : "s"})`
                : `Cliente sem créditos restantes no plano "${clientPlan.planName}" este mês`}
            </label>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Serviço</label>
            <select
              className={styles.input}
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin}min
                </option>
              ))}
            </select>
          </div>

          {staffOptions.length > 1 && (
            <div className={styles.field}>
              <label className={styles.label}>Barbeiro</label>
              <select
                className={styles.input}
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
              >
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Data</label>
              <DateField value={date} onChange={setDate} className={styles.input} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Hora</label>
              <TimeField value={time} onChange={setTime} className={styles.input} />
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalSave} disabled={loading}>
              {loading ? "Criando..." : "Criar agendamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
