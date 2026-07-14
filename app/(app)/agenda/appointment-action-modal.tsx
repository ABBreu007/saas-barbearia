"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCentsBRL, formatDateShort, formatTime } from "@/lib/format";
import type { AgendaAppointment } from "@/lib/data/agenda";
import styles from "./agenda.module.css";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  NO_SHOW: "Falta",
  COMPLETED: "Concluído",
};

// Sem provedor de SMS/WhatsApp Business configurado no projeto (mesma
// limitação do SMTP, ver README seção 9) — lembrete "automático" de verdade
// fica pra quando essa infra existir. Por ora, o barbeiro dispara manualmente
// com um clique: abre o WhatsApp já com a mensagem pronta pro número do
// cliente, ele só confere e manda. wa.me exige o telefone em formato
// internacional sem símbolos (55 + DDD + número).
function whatsappReminderHref(phone: string, appointment: AgendaAppointment): string {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  const message =
    `Oi ${appointment.client.name}! Passando pra lembrar do seu horário de ` +
    `${appointment.service.name} ${formatDateShort(new Date(appointment.startTime))} às ` +
    `${formatTime(new Date(appointment.startTime))}. Confirma que vai dar certo? 😊`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

// Bloco de agendamento clicável — abre um modal com os detalhes e permite
// ao barbeiro mudar o status (confirmar/cancelar/marcar falta/concluir).
// Cada instância gerencia seu próprio estado de modal; day-view.tsx
// continua sendo Server Component, só este bloco é client.
export function AppointmentBlock({
  appointment,
  className,
  style,
  children,
}: {
  appointment: AgendaAppointment;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(status: string) {
    setUpdating(status);
    setError(null);
    const res = await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdating(null);
    if (!res.ok) {
      setError("Não foi possível atualizar o agendamento.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={className}
        style={{ ...style, textAlign: "left", width: undefined }}
        data-status={appointment.status}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      {open && (
        <div className={styles.modalOverlay} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{appointment.client.name}</h2>
            <div className={styles.detailMeta}>
              {appointment.service.name} · {formatCentsBRL(appointment.priceCents)}
            </div>
            <div className={styles.detailMeta}>
              {formatDateShort(new Date(appointment.startTime))} · {formatTime(new Date(appointment.startTime))}
            </div>
            {appointment.client.phone && (
              <div className={styles.detailMeta}>{appointment.client.phone}</div>
            )}
            <div className={styles.detailStatus} data-status={appointment.status}>
              {STATUS_LABEL[appointment.status] ?? appointment.status}
            </div>

            {error && <div className={styles.modalError}>{error}</div>}

            {appointment.client.phone &&
              (appointment.status === "PENDING" || appointment.status === "CONFIRMED") && (
                <a
                  href={whatsappReminderHref(appointment.client.phone, appointment)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.modalWhatsapp}
                >
                  Lembrar via WhatsApp
                </a>
              )}

            <div className={styles.modalActions} style={{ flexWrap: "wrap" }}>
              {appointment.status === "PENDING" && (
                <button
                  type="button"
                  className={styles.modalSave}
                  disabled={updating !== null}
                  onClick={() => updateStatus("CONFIRMED")}
                >
                  {updating === "CONFIRMED" ? "Confirmando..." : "Confirmar"}
                </button>
              )}
              {(appointment.status === "PENDING" || appointment.status === "CONFIRMED") && (
                <button
                  type="button"
                  className={styles.modalCancel}
                  disabled={updating !== null}
                  onClick={() => updateStatus("CANCELLED")}
                >
                  {updating === "CANCELLED" ? "Cancelando..." : "Cancelar"}
                </button>
              )}
              {appointment.status === "CONFIRMED" && (
                <>
                  <button
                    type="button"
                    className={styles.modalCancel}
                    disabled={updating !== null}
                    onClick={() => updateStatus("NO_SHOW")}
                  >
                    {updating === "NO_SHOW" ? "Marcando..." : "Marcar falta"}
                  </button>
                  <button
                    type="button"
                    className={styles.modalSave}
                    disabled={updating !== null}
                    onClick={() => updateStatus("COMPLETED")}
                  >
                    {updating === "COMPLETED" ? "Concluindo..." : "Concluir"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
