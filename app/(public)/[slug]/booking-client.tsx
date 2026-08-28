"use client";

import { useState } from "react";
import { formatCentsBRL, formatDateShort, formatTime } from "@/lib/format";
import { brazilDateStringBounds } from "@/lib/timezone";
import type { PublicBarbershopData } from "@/lib/data/public-page";
import styles from "./public.module.css";

type Review = PublicBarbershopData["reviews"][number];
type LookupAppointment = {
  id: string;
  startTime: string;
  priceCents: number;
  service: { id: string; name: string; durationMin: number };
};
type LookupClientPlan = {
  status: "PENDING" | "ACTIVE";
  plan: { name: string };
  used?: number;
  remaining?: number;
};

const BOOKING_WINDOW_DAYS = 14;
const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

// Próximos N dias a partir de `fromDateStr` (inclusive), como strings
// YYYY-MM-DD. Reaproveita o mesmo padrão de app/(app)/agenda/day-view.tsx
// (offset fixo, sem horário de verão no Brasil desde 2019 — ver
// lib/timezone.ts) em vez de reimplementar a lógica de fuso aqui.
function nextDays(fromDateStr: string, count: number): string[] {
  const { start } = brazilDateStringBounds(fromDateStr);
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10));
}

export function BookingClient({
  slug,
  bookingDate,
  services,
  availableSlots,
  initialReviews,
  initialRatingAvg,
  initialRatingCount,
  staffList,
  showStaffPicker,
  plans,
  barbershopWhatsappUrl,
}: {
  slug: string;
  // Data (YYYY-MM-DD, já calculada no fuso de São Paulo pelo servidor) para
  // a qual `availableSlots` foi calculado. NUNCA recalcular "hoje" aqui no
  // client com `new Date().toISOString()` — isso pega o dia em UTC, que
  // diverge do dia no Brasil por até 3h e já causou um agendamento sendo
  // criado no dia errado (mesma classe de bug já corrigida em lib/timezone.ts).
  bookingDate: string;
  services: PublicBarbershopData["services"];
  availableSlots: string[];
  initialReviews: Review[];
  initialRatingAvg: number | null;
  initialRatingCount: number;
  staffList: PublicBarbershopData["staff"];
  // Só mostra o passo "Escolha o profissional" em barbearias modo Dono com
  // mais de 1 barbeiro — autônomo (1 pessoa só) não tem o que escolher.
  showStaffPicker: boolean;
  // Planos de assinatura ativos da barbearia — mostrados no painel "Meus
  // agendamentos e plano" pra o cliente SOLICITAR (nunca ativa sozinho —
  // fica PENDING até o barbeiro aprovar em /clientes, depois de confirmar
  // o pagamento por fora). Usar crédito de um plano já aprovado também só
  // acontece por ali, nunca num checkbox solto no formulário de
  // agendamento comum — telefone sozinho não prova identidade, então
  // gastar crédito de outra pessoa precisa ficar atrás desse fluxo mais
  // deliberado, não de uma caixinha que qualquer um marca sem querer.
  plans: PublicBarbershopData["plans"];
  barbershopWhatsappUrl: string | null;
}) {
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? "");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(bookingDate);
  const bookableDays = nextDays(bookingDate, BOOKING_WINDOW_DAYS);
  const [slots, setSlots] = useState(availableSlots);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookedAppointmentId, setBookedAppointmentId] = useState<string | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupAppointment[] | null>(null);
  const [lookupClientName, setLookupClientName] = useState<string | null>(null);
  const [lookupClientPlan, setLookupClientPlan] = useState<LookupClientPlan | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmingDataDeletion, setConfirmingDataDeletion] = useState(false);
  const [dataDeletionDone, setDataDeletionDone] = useState(false);
  const [dataDeletionLoading, setDataDeletionLoading] = useState(false);

  // Solicitar um plano (fica PENDING até o barbeiro aprovar).
  const [requestingPlanId, setRequestingPlanId] = useState<string | null>(null);
  const [planRequestName, setPlanRequestName] = useState("");
  const [planRequestLoading, setPlanRequestLoading] = useState(false);
  const [planRequestError, setPlanRequestError] = useState<string | null>(null);
  const [planRequestDone, setPlanRequestDone] = useState<{ planName: string } | null>(null);

  // Agendar usando 1 crédito de um plano já ACTIVE — mini seletor de
  // serviço/dia/horário próprio, separado do fluxo de agendamento comum
  // (que nunca usa crédito).
  const [creditBookingOpen, setCreditBookingOpen] = useState(false);
  const [creditServiceId, setCreditServiceId] = useState(services[0]?.id ?? "");
  const [creditDate, setCreditDate] = useState(bookingDate);
  const [creditSlots, setCreditSlots] = useState<string[]>([]);
  const [creditSlotsLoading, setCreditSlotsLoading] = useState(false);
  const [creditSelectedSlot, setCreditSelectedSlot] = useState<string | null>(null);
  const [creditBooking, setCreditBooking] = useState(false);
  const [creditBookError, setCreditBookError] = useState<string | null>(null);
  const [creditBookedOk, setCreditBookedOk] = useState(false);

  // Remarcar um agendamento existente (só um por vez).
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(bookingDate);
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSelectedSlot, setRescheduleSelectedSlot] = useState<string | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const [reviews, setReviews] = useState(initialReviews);
  const [ratingAvg, setRatingAvg] = useState(initialRatingAvg);
  const [ratingCount, setRatingCount] = useState(initialRatingCount);
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewerName, setReviewerName] = useState("");
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const selectedService = services.find((s) => s.id === selectedServiceId);

  async function fetchSlots(dateStr: string, staffId: string | null) {
    setSlotsLoading(true);
    const url = `/api/public/${slug}?date=${dateStr}${staffId ? `&staffId=${staffId}` : ""}`;
    const res = await fetch(url);
    setSlotsLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setSlots(data.availableSlots ?? []);
  }

  async function handleSelectStaff(staffId: string | null) {
    setSelectedStaffId(staffId);
    setSelectedSlot(null);
    await fetchSlots(selectedDate, staffId);
  }

  async function handleSelectDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    await fetchSlots(dateStr, selectedStaffId);
  }

  async function handleConfirm() {
    if (!selectedSlot || !selectedService || !clientName || !clientPhone) return;
    setBooking(true);
    setBookError(null);

    const startTime = new Date(`${selectedDate}T${selectedSlot}:00-03:00`).toISOString();

    const res = await fetch(`/api/public/${slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: selectedServiceId,
        startTime,
        clientName,
        clientPhone,
        ...(selectedStaffId ? { staffId: selectedStaffId } : {}),
      }),
    });
    setBooking(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setBookError(
        body?.error === "slot_unavailable"
          ? "Esse horário acabou de ser preenchido. Escolha outro."
          : "Não foi possível confirmar o agendamento."
      );
      return;
    }
    const { appointment } = await res.json();
    setBookedAppointmentId(appointment.id);
    setConfirmed(true);
  }

  async function cancelAppointment(id: string, phone: string) {
    setCancellingId(id);
    const res = await fetch(`/api/public/${slug}/appointments/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setCancellingId(null);
    return res.ok;
  }

  async function handleCancelJustBooked() {
    if (!bookedAppointmentId) return;
    const ok = await cancelAppointment(bookedAppointmentId, clientPhone);
    if (ok) setJustCancelled(true);
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupPhone) return;
    setLookupLoading(true);
    setLookupError(null);
    const res = await fetch(`/api/public/${slug}/appointments?phone=${encodeURIComponent(lookupPhone)}`);
    setLookupLoading(false);
    if (!res.ok) {
      setLookupError("Não foi possível buscar seus agendamentos.");
      return;
    }
    const { appointments, clientPlan, client } = await res.json();
    setLookupResults(appointments);
    setLookupClientPlan(clientPlan);
    setLookupClientName(client?.name ?? null);
  }

  async function handleCancelFromLookup(id: string) {
    const ok = await cancelAppointment(id, lookupPhone);
    if (ok) setLookupResults((prev) => prev?.filter((a) => a.id !== id) ?? null);
  }

  async function handleDataDeletion() {
    if (!lookupPhone) return;
    setDataDeletionLoading(true);
    await fetch(`/api/public/${slug}/data-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: lookupPhone }),
    });
    setDataDeletionLoading(false);
    setConfirmingDataDeletion(false);
    setDataDeletionDone(true);
    setLookupResults(null);
  }

  async function handleRequestPlan(planId: string, planName: string) {
    if (!lookupPhone || !planRequestName) return;
    setPlanRequestLoading(true);
    setPlanRequestError(null);
    const res = await fetch(`/api/public/${slug}/plan-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, clientName: planRequestName, clientPhone: lookupPhone }),
    });
    setPlanRequestLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setPlanRequestError(
        body?.error === "already_requested"
          ? "Esse telefone já tem um plano pendente ou ativo."
          : "Não foi possível enviar sua solicitação."
      );
      return;
    }
    setRequestingPlanId(null);
    setPlanRequestDone({ planName });
  }

  async function fetchCreditSlots(dateStr: string) {
    setCreditSlotsLoading(true);
    const res = await fetch(`/api/public/${slug}?date=${dateStr}`);
    setCreditSlotsLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setCreditSlots(data.availableSlots ?? []);
  }

  function openCreditBooking() {
    setCreditBookingOpen(true);
    setCreditBookedOk(false);
    setCreditBookError(null);
    setCreditSelectedSlot(null);
    fetchCreditSlots(creditDate);
  }

  async function handleCreditSelectDate(dateStr: string) {
    setCreditDate(dateStr);
    setCreditSelectedSlot(null);
    await fetchCreditSlots(dateStr);
  }

  async function handleConfirmCreditBooking() {
    if (!creditSelectedSlot || !creditServiceId) return;
    setCreditBooking(true);
    setCreditBookError(null);
    const startTime = new Date(`${creditDate}T${creditSelectedSlot}:00-03:00`).toISOString();
    const res = await fetch(`/api/public/${slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: creditServiceId,
        startTime,
        clientName: lookupClientName ?? "",
        clientPhone: lookupPhone,
        useClientPlan: true,
      }),
    });
    setCreditBooking(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setCreditBookError(
        body?.error === "slot_unavailable"
          ? "Esse horário acabou de ser preenchido. Escolha outro."
          : body?.error === "no_credits_left"
            ? "Você já usou todos os créditos do seu plano este mês."
            : "Não foi possível confirmar o agendamento."
      );
      return;
    }
    setCreditBookedOk(true);
    setCreditBookingOpen(false);
    await handleLookup({ preventDefault() {} } as React.FormEvent);
  }

  function openReschedule(appointmentId: string) {
    setReschedulingId(appointmentId);
    setRescheduleError(null);
    setRescheduleSelectedSlot(null);
    setRescheduleDate(bookingDate);
    fetchRescheduleSlots(bookingDate);
  }

  async function fetchRescheduleSlots(dateStr: string) {
    setRescheduleSlotsLoading(true);
    const res = await fetch(`/api/public/${slug}?date=${dateStr}`);
    setRescheduleSlotsLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setRescheduleSlots(data.availableSlots ?? []);
  }

  async function handleRescheduleSelectDate(dateStr: string) {
    setRescheduleDate(dateStr);
    setRescheduleSelectedSlot(null);
    await fetchRescheduleSlots(dateStr);
  }

  async function handleConfirmReschedule() {
    if (!reschedulingId || !rescheduleSelectedSlot) return;
    setRescheduleSaving(true);
    setRescheduleError(null);
    const startTime = new Date(`${rescheduleDate}T${rescheduleSelectedSlot}:00-03:00`).toISOString();
    const res = await fetch(`/api/public/${slug}/appointments/${reschedulingId}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: lookupPhone, startTime }),
    });
    setRescheduleSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setRescheduleError(
        body?.error === "slot_unavailable"
          ? "Esse horário acabou de ser preenchido. Escolha outro."
          : "Não foi possível remarcar."
      );
      return;
    }
    setReschedulingId(null);
    await handleLookup({ preventDefault() {} } as React.FormEvent);
  }

  async function handleSubmitReview() {
    if (userRating === 0 || !reviewerName) return;
    setSubmittingReview(true);
    setReviewError(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barbershopSlug: slug,
        clientName: reviewerName,
        rating: userRating,
        comment: comment || undefined,
      }),
    });
    setSubmittingReview(false);
    if (!res.ok) {
      setReviewError("Não foi possível enviar sua avaliação.");
      return;
    }
    const { review } = await res.json();
    const newReviews = [review, ...reviews];
    setReviews(newReviews);
    setRatingCount(newReviews.length);
    setRatingAvg(newReviews.reduce((sum, r) => sum + r.rating, 0) / newReviews.length);
    setRated(true);
  }

  return (
    <>
      <div className={styles.manageRow}>
        <button type="button" className={styles.manageToggle} onClick={() => setManageOpen((v) => !v)}>
          {manageOpen ? "Fechar" : "Já tem agendamento ou plano? Ver, remarcar ou assinar"}
        </button>
      </div>

      {manageOpen && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Meus agendamentos e plano</h2>
          <form className={styles.lookupForm} onSubmit={handleLookup}>
            <input
              className={styles.input}
              value={lookupPhone}
              onChange={(e) => setLookupPhone(e.target.value)}
              placeholder="Seu telefone (11999998888)"
            />
            <button type="submit" className={styles.lookupBtn} disabled={!lookupPhone || lookupLoading}>
              {lookupLoading ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {lookupError && <div className={styles.error}>{lookupError}</div>}

          {lookupResults !== null && (
            lookupResults.length === 0 ? (
              <div className={styles.hint}>Nenhum agendamento futuro encontrado para esse telefone.</div>
            ) : (
              <div className={styles.lookupList}>
                {lookupResults.map((a) => (
                  <div key={a.id} className={styles.lookupCard}>
                    <div>
                      <div className={styles.lookupService}>{a.service.name}</div>
                      <div className={styles.lookupWhen}>
                        {formatDateShort(new Date(a.startTime))} · {formatTime(new Date(a.startTime))}
                      </div>
                    </div>
                    <div className={styles.lookupCardActions}>
                      <button
                        type="button"
                        className={styles.lookupRescheduleBtn}
                        onClick={() => openReschedule(a.id)}
                      >
                        Remarcar
                      </button>
                      <button
                        type="button"
                        className={styles.lookupCancelBtn}
                        disabled={cancellingId === a.id}
                        onClick={() => handleCancelFromLookup(a.id)}
                      >
                        {cancellingId === a.id ? "Cancelando..." : "Cancelar"}
                      </button>
                    </div>

                    {reschedulingId === a.id && (
                      <div className={styles.reschedulePanel}>
                        <div className={styles.dateStrip}>
                          {nextDays(bookingDate, BOOKING_WINDOW_DAYS).map((d) => {
                            const day = Number(d.slice(8, 10));
                            const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
                            return (
                              <button
                                key={d}
                                type="button"
                                className={styles.dateChip}
                                data-selected={d === rescheduleDate}
                                onClick={() => handleRescheduleSelectDate(d)}
                              >
                                <span className={styles.dateChipLabel}>{WEEKDAY_LABELS[weekday]}</span>
                                <span className={styles.dateChipNum}>{day}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className={styles.slotList}>
                          {rescheduleSlotsLoading && <div className={styles.hint}>Atualizando horários...</div>}
                          {!rescheduleSlotsLoading && rescheduleSlots.length === 0 && (
                            <div className={styles.hint}>Nenhum horário disponível.</div>
                          )}
                          {!rescheduleSlotsLoading &&
                            rescheduleSlots.map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                className={styles.slotChip}
                                data-selected={slot === rescheduleSelectedSlot}
                                onClick={() => setRescheduleSelectedSlot(slot)}
                              >
                                {slot}
                              </button>
                            ))}
                        </div>
                        {rescheduleError && <div className={styles.error}>{rescheduleError}</div>}
                        <div className={styles.lookupCardActions}>
                          <button type="button" onClick={() => setReschedulingId(null)}>
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className={styles.lookupRescheduleBtn}
                            disabled={!rescheduleSelectedSlot || rescheduleSaving}
                            onClick={handleConfirmReschedule}
                          >
                            {rescheduleSaving ? "Salvando..." : "Confirmar novo horário"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {lookupPhone && lookupClientPlan?.status === "PENDING" && (
            <div className={styles.hint}>
              Sua solicitação do <strong>{lookupClientPlan.plan.name}</strong> está aguardando aprovação do
              barbeiro.
            </div>
          )}

          {lookupPhone && lookupClientPlan?.status === "ACTIVE" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Seu plano: {lookupClientPlan.plan.name}</h2>
              <div className={styles.hint}>
                {lookupClientPlan.remaining} crédito{lookupClientPlan.remaining === 1 ? "" : "s"} restante
                {lookupClientPlan.remaining === 1 ? "" : "s"} este mês
              </div>
              {!creditBookingOpen && !creditBookedOk && (
                <button
                  type="button"
                  className={styles.confirmBtn}
                  disabled={(lookupClientPlan.remaining ?? 0) <= 0}
                  onClick={openCreditBooking}
                >
                  Agendar com crédito do plano
                </button>
              )}
              {creditBookedOk && <div className={styles.confirmedBanner}>✓ Agendado com seu crédito!</div>}
              {creditBookingOpen && (
                <div className={styles.reschedulePanel}>
                  <div className={styles.field}>
                    <label className={styles.label}>Serviço</label>
                    <select
                      className={styles.input}
                      value={creditServiceId}
                      onChange={(e) => setCreditServiceId(e.target.value)}
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.durationMin}min
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.dateStrip}>
                    {nextDays(bookingDate, BOOKING_WINDOW_DAYS).map((d) => {
                      const day = Number(d.slice(8, 10));
                      const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
                      return (
                        <button
                          key={d}
                          type="button"
                          className={styles.dateChip}
                          data-selected={d === creditDate}
                          onClick={() => handleCreditSelectDate(d)}
                        >
                          <span className={styles.dateChipLabel}>{WEEKDAY_LABELS[weekday]}</span>
                          <span className={styles.dateChipNum}>{day}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.slotList}>
                    {creditSlotsLoading && <div className={styles.hint}>Atualizando horários...</div>}
                    {!creditSlotsLoading && creditSlots.length === 0 && (
                      <div className={styles.hint}>Nenhum horário disponível.</div>
                    )}
                    {!creditSlotsLoading &&
                      creditSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          className={styles.slotChip}
                          data-selected={slot === creditSelectedSlot}
                          onClick={() => setCreditSelectedSlot(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                  </div>
                  {creditBookError && <div className={styles.error}>{creditBookError}</div>}
                  <div className={styles.lookupCardActions}>
                    <button type="button" onClick={() => setCreditBookingOpen(false)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.lookupRescheduleBtn}
                      disabled={!creditSelectedSlot || creditBooking}
                      onClick={handleConfirmCreditBooking}
                    >
                      {creditBooking ? "Confirmando..." : "Confirmar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {plans.length > 0 && !lookupClientPlan && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Planos de assinatura</h2>
              <div className={styles.hint}>
                Digite seu telefone acima pra solicitar — o plano só passa a valer depois que o barbeiro
                confirmar o pagamento e aprovar.
              </div>
              <div className={styles.serviceList}>
                {plans.map((p) => (
                  <div key={p.id} className={styles.serviceCard} data-selected={false}>
                    <div>
                      <div className={styles.serviceName}>{p.name}</div>
                      <div className={styles.serviceDuration}>{p.visitsPerMonth} cortes/mês</div>
                    </div>
                    <div className={styles.servicePrice}>{formatCentsBRL(p.priceCents)}/mês</div>
                  </div>
                ))}
              </div>

              {planRequestDone ? (
                <div className={styles.confirmedBanner}>
                  ✓ Pedido do {planRequestDone.planName} enviado! Avise o barbeiro pra agilizar a aprovação.
                  {barbershopWhatsappUrl && (
                    <a
                      href={`${barbershopWhatsappUrl}?text=${encodeURIComponent(
                        `Olá! Quero assinar o ${planRequestDone.planName}, meu nome é ${planRequestName}.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.confirmBtn}
                      style={{ display: "inline-block", marginTop: 8, textAlign: "center" }}
                    >
                      Avisar no WhatsApp
                    </a>
                  )}
                </div>
              ) : requestingPlanId ? (
                <div className={styles.reschedulePanel}>
                  <div className={styles.field}>
                    <label className={styles.label}>Seu nome</label>
                    <input
                      className={styles.input}
                      value={planRequestName}
                      onChange={(e) => setPlanRequestName(e.target.value)}
                    />
                  </div>
                  {planRequestError && <div className={styles.error}>{planRequestError}</div>}
                  <div className={styles.lookupCardActions}>
                    <button type="button" onClick={() => setRequestingPlanId(null)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.lookupRescheduleBtn}
                      disabled={!lookupPhone || !planRequestName || planRequestLoading}
                      onClick={() => {
                        const plan = plans.find((p) => p.id === requestingPlanId);
                        if (plan) handleRequestPlan(plan.id, plan.name);
                      }}
                    >
                      {planRequestLoading ? "Enviando..." : "Enviar pedido"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.serviceList}>
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={styles.confirmBtn}
                      disabled={!lookupPhone}
                      onClick={() => setRequestingPlanId(p.id)}
                    >
                      Quero o {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {lookupPhone && !dataDeletionDone && (
            <div className={styles.dataDeletionRow}>
              {!confirmingDataDeletion ? (
                <button
                  type="button"
                  className={styles.dataDeletionLink}
                  onClick={() => setConfirmingDataDeletion(true)}
                >
                  Solicitar exclusão dos meus dados
                </button>
              ) : (
                <div className={styles.dataDeletionConfirm}>
                  <p>
                    Isso remove seu nome e telefone dos nossos registros. Não é possível desfazer. Confirma?
                  </p>
                  <div className={styles.dataDeletionActions}>
                    <button type="button" onClick={() => setConfirmingDataDeletion(false)}>
                      Cancelar
                    </button>
                    <button type="button" onClick={handleDataDeletion} disabled={dataDeletionLoading}>
                      {dataDeletionLoading ? "Removendo..." : "Sim, remover meus dados"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {dataDeletionDone && (
            <div className={styles.hint}>Seus dados foram removidos dos nossos registros.</div>
          )}
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Escolha o serviço</h2>
        <div className={styles.serviceList}>
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              className={styles.serviceCard}
              data-selected={s.id === selectedServiceId}
              onClick={() => setSelectedServiceId(s.id)}
            >
              <div>
                <div className={styles.serviceName}>{s.name}</div>
                <div className={styles.serviceDuration}>{s.durationMin} min</div>
              </div>
              <div className={styles.servicePrice}>{formatCentsBRL(s.priceCents)}</div>
            </button>
          ))}
        </div>
      </div>

      {showStaffPicker && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Escolha o profissional</h2>
          <div className={styles.staffList}>
            <button
              type="button"
              className={styles.staffCard}
              data-selected={selectedStaffId === null}
              onClick={() => handleSelectStaff(null)}
            >
              <div className={styles.staffCardAvatar}>—</div>
              <div className={styles.staffCardName}>Sem preferência</div>
            </button>
            {staffList.map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.staffCard}
                data-selected={selectedStaffId === s.id}
                onClick={() => handleSelectStaff(s.id)}
              >
                <div
                  className={styles.staffCardAvatar}
                  style={s.avatarUrl ? { backgroundImage: `url(${s.avatarUrl})` } : undefined}
                >
                  {!s.avatarUrl && s.name.slice(0, 2).toUpperCase()}
                </div>
                <div className={styles.staffCardName}>{s.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Escolha o dia</h2>
        <div className={styles.dateStrip}>
          {bookableDays.map((d) => {
            const day = Number(d.slice(8, 10));
            const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
            return (
              <button
                key={d}
                type="button"
                className={styles.dateChip}
                data-selected={d === selectedDate}
                onClick={() => handleSelectDate(d)}
              >
                <span className={styles.dateChipLabel}>{WEEKDAY_LABELS[weekday]}</span>
                <span className={styles.dateChipNum}>{day}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Horários — {selectedDate === bookingDate ? "hoje" : formatDateShort(new Date(`${selectedDate}T12:00:00Z`))}
        </h2>
        <div className={styles.slotList}>
          {slotsLoading && <div className={styles.hint}>Atualizando horários...</div>}
          {!slotsLoading && slots.length === 0 && (
            <div className={styles.hint}>Nenhum horário disponível hoje.</div>
          )}
          {!slotsLoading && slots.map((slot) => (
            <button
              key={slot}
              type="button"
              className={styles.slotChip}
              data-selected={slot === selectedSlot}
              onClick={() => setSelectedSlot(slot)}
            >
              {slot}
            </button>
          ))}
        </div>
      </div>

      {!confirmed && selectedSlot && (
        <div className={styles.section}>
          <div className={styles.field}>
            <label className={styles.label}>Seu nome</label>
            <input className={styles.input} value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Telefone</label>
            <input
              className={styles.input}
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="11999998888"
            />
          </div>
        </div>
      )}

      {bookError && <div className={styles.error}>{bookError}</div>}

      {!confirmed ? (
        <button
          type="button"
          className={styles.confirmBtn}
          disabled={!selectedSlot || !clientName || !clientPhone || booking}
          onClick={handleConfirm}
        >
          {booking
            ? "Confirmando..."
            : `Confirmar agendamento${selectedService ? ` · ${formatCentsBRL(selectedService.priceCents)}` : ""}`}
        </button>
      ) : justCancelled ? (
        <div className={styles.cancelledBanner}>Agendamento cancelado.</div>
      ) : (
        <div className={styles.confirmedBanner}>
          ✓ Agendamento confirmado!
          <button type="button" className={styles.cancelJustBookedBtn} onClick={handleCancelJustBooked}>
            {cancellingId === bookedAppointmentId ? "Cancelando..." : "Cancelar agendamento"}
          </button>
        </div>
      )}

      <div className={styles.reviewsHeader}>
        <h2 className={styles.sectionTitleLg}>Avaliações</h2>
        <div className={styles.reviewsAvg}>
          <span className={styles.reviewsAvgNum}>{ratingAvg?.toFixed(1).replace(".", ",") ?? "—"}</span>
          <span className={styles.stars}>★★★★★</span>
          <span className={styles.reviewsCount}>{ratingCount}</span>
        </div>
      </div>

      <div className={styles.reviewList}>
        {reviews.map((r) => (
          <div key={r.id} className={styles.reviewCard}>
            <div className={styles.reviewHeader}>
              <div className={styles.reviewAvatar}>{r.clientName.slice(0, 2).toUpperCase()}</div>
              <div className={styles.reviewMeta}>
                <div className={styles.reviewName}>{r.clientName}</div>
                <div className={styles.reviewDate}>
                  {formatDateShort(new Date(r.createdAt))}
                </div>
              </div>
              <span className={styles.starsSmall}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            </div>
            {r.comment && <div className={styles.reviewComment}>{r.comment}</div>}
          </div>
        ))}
      </div>

      {!rated && (
        <div className={styles.rateCard}>
          <div className={styles.rateTitle}>Avalie a barbearia</div>
          <div className={styles.rateHint}>Toque nas estrelas para dar sua nota</div>
          <div className={styles.rateStars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={styles.rateStarBtn}
                data-filled={n <= (hoverRating || userRating)}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setUserRating(n)}
                aria-label={`${n} estrelas`}
              >
                ★
              </button>
            ))}
          </div>
          <input
            className={styles.rateInput}
            placeholder="Seu nome"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
          />
          <textarea
            className={styles.rateTextarea}
            placeholder="Escreva um comentário (opcional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          {reviewError && <div className={styles.error}>{reviewError}</div>}
          <button
            type="button"
            className={styles.rateSubmitBtn}
            disabled={userRating === 0 || !reviewerName || submittingReview}
            onClick={handleSubmitReview}
          >
            {submittingReview ? "Enviando..." : "Enviar avaliação"}
          </button>
        </div>
      )}
      {rated && (
        <div className={styles.confirmedBanner}>
          ✓ Obrigado pela avaliação! Sua nota: {userRating} de 5 estrelas
        </div>
      )}
    </>
  );
}
