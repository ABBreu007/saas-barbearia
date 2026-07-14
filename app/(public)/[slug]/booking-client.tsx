"use client";

import { useState } from "react";
import { formatCentsBRL, formatDateShort, formatTime } from "@/lib/format";
import type { PublicBarbershopData } from "@/lib/data/public-page";
import styles from "./public.module.css";

type Review = PublicBarbershopData["reviews"][number];
type LookupAppointment = {
  id: string;
  startTime: string;
  priceCents: number;
  service: { name: string };
};

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
}) {
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? "");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
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
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

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

  async function handleSelectStaff(staffId: string | null) {
    setSelectedStaffId(staffId);
    setSelectedSlot(null);
    setSlotsLoading(true);
    const url = `/api/public/${slug}?date=${bookingDate}${staffId ? `&staffId=${staffId}` : ""}`;
    const res = await fetch(url);
    setSlotsLoading(false);
    if (!res.ok) return;
    const data = await res.json();
    setSlots(data.availableSlots ?? []);
  }

  async function handleConfirm() {
    if (!selectedSlot || !selectedService || !clientName || !clientPhone) return;
    setBooking(true);
    setBookError(null);

    const startTime = new Date(`${bookingDate}T${selectedSlot}:00-03:00`).toISOString();

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
    const { appointments } = await res.json();
    setLookupResults(appointments);
  }

  async function handleCancelFromLookup(id: string) {
    const ok = await cancelAppointment(id, lookupPhone);
    if (ok) setLookupResults((prev) => prev?.filter((a) => a.id !== id) ?? null);
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
          {manageOpen ? "Fechar" : "Já tem um agendamento? Ver ou cancelar"}
        </button>
      </div>

      {manageOpen && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Meus agendamentos</h2>
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
                    <button
                      type="button"
                      className={styles.lookupCancelBtn}
                      disabled={cancellingId === a.id}
                      onClick={() => handleCancelFromLookup(a.id)}
                    >
                      {cancellingId === a.id ? "Cancelando..." : "Cancelar"}
                    </button>
                  </div>
                ))}
              </div>
            )
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
        <h2 className={styles.sectionTitle}>Horários — hoje</h2>
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
