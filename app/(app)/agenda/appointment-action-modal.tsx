"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCentsBRL, formatDateShort, formatTime } from "@/lib/format";
import type { AgendaAppointment } from "@/lib/data/agenda";
import styles from "./agenda.module.css";

type Product = { id: string; name: string; priceCents: number };

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

  // "Concluir" não é mais um PATCH de status em um clique — abre a comanda
  // (o serviço já vem lançado, dá pra adicionar produtos do catálogo) e só
  // marca COMPLETED quando a comanda é salva (ver POST /api/orders).
  const [comandaOpen, setComandaOpen] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [comandaSaving, setComandaSaving] = useState(false);
  const [comandaError, setComandaError] = useState<string | null>(null);

  async function openComanda() {
    setComandaOpen(true);
    setComandaError(null);
    if (products === null) {
      setProductsLoading(true);
      const res = await fetch("/api/products");
      setProductsLoading(false);
      if (res.ok) {
        const { products: list } = await res.json();
        setProducts(list.filter((p: Product & { active: boolean }) => p.active));
      } else {
        setProducts([]);
      }
    }
  }

  function setQty(productId: string, qty: number) {
    setSelectedQty((prev) => {
      const next = { ...prev, [productId]: qty };
      if (qty <= 0) delete next[productId];
      return next;
    });
  }

  const productsTotalCents = (products ?? []).reduce(
    (sum, p) => sum + (selectedQty[p.id] ?? 0) * p.priceCents,
    0
  );
  const comandaTotalCents = appointment.priceCents + productsTotalCents;

  async function saveComanda() {
    setComandaSaving(true);
    setComandaError(null);
    const items = [
      { kind: "SERVICE", refId: appointment.service.id, quantity: 1 },
      ...Object.entries(selectedQty).map(([refId, quantity]) => ({ kind: "PRODUCT", refId, quantity })),
    ];
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: appointment.id, items, close: true }),
    });
    setComandaSaving(false);
    if (!res.ok) {
      setComandaError("Não foi possível salvar a comanda.");
      return;
    }
    setOpen(false);
    setComandaOpen(false);
    router.refresh();
  }

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

      {open && comandaOpen && (
        <div className={styles.modalOverlay} onClick={() => setComandaOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Comanda — {appointment.client.name}</h2>

            <div className={styles.comandaItem}>
              <span>{appointment.service.name}</span>
              <span>{formatCentsBRL(appointment.priceCents)}</span>
            </div>

            {productsLoading && <div className={styles.detailMeta}>Carregando produtos...</div>}
            {products && products.length > 0 && (
              <>
                <div className={styles.detailMeta} style={{ marginTop: 10 }}>
                  Adicionar produtos
                </div>
                {products.map((p) => (
                  <div key={p.id} className={styles.comandaProductRow}>
                    <div>
                      <div>{p.name}</div>
                      <div className={styles.detailMeta}>{formatCentsBRL(p.priceCents)}</div>
                    </div>
                    <div className={styles.comandaQtyStepper}>
                      <button
                        type="button"
                        onClick={() => setQty(p.id, Math.max(0, (selectedQty[p.id] ?? 0) - 1))}
                      >
                        −
                      </button>
                      <span>{selectedQty[p.id] ?? 0}</span>
                      <button type="button" onClick={() => setQty(p.id, (selectedQty[p.id] ?? 0) + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className={styles.comandaTotal}>
              <span>Total</span>
              <span>{formatCentsBRL(comandaTotalCents)}</span>
            </div>

            {comandaError && <div className={styles.modalError}>{comandaError}</div>}

            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setComandaOpen(false)}>
                Voltar
              </button>
              <button type="button" className={styles.modalSave} onClick={saveComanda} disabled={comandaSaving}>
                {comandaSaving ? "Salvando..." : "Salvar e concluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && !comandaOpen && (
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
                    onClick={openComanda}
                  >
                    Concluir
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
