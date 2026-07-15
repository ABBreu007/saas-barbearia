"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ScheduleForm } from "@/app/(app)/conta/horarios/schedule-form";
import styles from "./onboarding.module.css";

const STEP_LABELS = ["Sua barbearia", "Horários", "Primeiro serviço", "Foto de perfil"];

// Seg–sáb 9h–19h, domingo fechado — padrão razoável pra não deixar a tela
// de horários em branco no primeiro acesso; o barbeiro pode ajustar em
// seguida (o ScheduleForm embaixo já é o mesmo componente da tela Conta).
const DEFAULT_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isOpen: weekday >= 1 && weekday <= 6,
  openMinutes: 9 * 60,
  closeMinutes: 19 * 60,
}));

async function uploadAvatar(file: File): Promise<string> {
  const fileExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "avatar", fileExt }),
  });
  if (!signRes.ok) throw new Error("sign_failed");
  const { path, token, publicUrl } = await signRes.json();

  const supabase = createClient();
  const { error } = await supabase.storage.from("barbershop-media").uploadToSignedUrl(path, token, file);
  if (error) throw error;

  return publicUrl;
}

export function OnboardingClient({
  barbershopName,
  initialMode,
  trialDays,
}: {
  barbershopName: string;
  initialMode: "DONO" | "AUTONOMO";
  trialDays: number | null;
}) {
  const [step, setStep] = useState(1);

  // Passo 1
  const [mode, setMode] = useState<"DONO" | "AUTONOMO">(initialMode);
  const [address, setAddress] = useState("");
  const [savingStep1, setSavingStep1] = useState(false);

  // Passo 2 — salva os horários padrão assim que a pessoa chega nesse
  // passo, pra nunca ficar sem nada configurado mesmo se ela só clicar
  // "Continuar" sem mexer em nada.
  const hoursSaved = useRef(false);
  useEffect(() => {
    if (step === 2 && !hoursSaved.current) {
      hoursSaved.current = true;
      fetch("/api/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: DEFAULT_HOURS }),
      });
    }
  }, [step]);

  // Passo 3
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState(30);
  const [servicePrice, setServicePrice] = useState(30);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceDone, setServiceDone] = useState(false);

  // Passo 4
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  async function handleStep1Continue() {
    setSavingStep1(true);
    await fetch("/api/barbershop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, ...(address ? { address } : {}) }),
    });
    setSavingStep1(false);
    setStep(2);
  }

  async function handleCreateService() {
    if (!serviceName.trim()) return;
    setSavingService(true);
    setServiceError(null);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: serviceName,
        durationMin: serviceDuration,
        priceCents: Math.round(servicePrice * 100),
      }),
    });
    setSavingService(false);
    if (!res.ok) {
      setServiceError("Não foi possível criar o serviço.");
      return;
    }
    setServiceDone(true);
  }

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      setAvatarUrl(url);
    } catch {
      // sem bloquear o onboarding por causa de upload — a foto pode ser
      // adicionada depois em Conta > Personalizar perfil.
    } finally {
      setUploading(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);
    // Bug real encontrado em auditoria: essa chamada não checava `res.ok` —
    // se o PATCH falhasse (ex.: rede instável), o código seguia direto pro
    // redirect mesmo assim, e o usuário caía de volta no passo 1 do
    // onboarding (porque `onboardedAt` continuava nulo) sem entender por quê,
    // como se o progresso tivesse sumido. Agora só redireciona em caso de sucesso.
    const res = await fetch("/api/barbershop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(avatarUrl ? { avatarUrl } : {}), markOnboarded: true }),
    });
    if (!res.ok) {
      setFinishing(false);
      setFinishError("Não foi possível concluir agora. Tente novamente.");
      return;
    }
    // Reload de verdade — igual ao fluxo de confirmação de e-mail, garante
    // que o layout do (app) já enxerga onboardedAt preenchido na primeira
    // renderização em vez de correr risco de cache client-side.
    window.location.href = "/";
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.stepIndicator}>
          Passo {step} de 4 · {STEP_LABELS[step - 1]}
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${(step / 4) * 100}%` }} />
        </div>

        {step === 1 && (
          <>
            <h1 className={styles.title}>Bem-vindo, {barbershopName}!</h1>
            <p className={styles.subtitle}>
              Vamos configurar o essencial em poucos passos antes de você ver sua agenda.
            </p>

            <div className={styles.field}>
              <label className={styles.label}>Como você trabalha?</label>
              <div className={styles.segmented}>
                <button
                  type="button"
                  className={styles.segmentedItem}
                  data-active={mode === "DONO"}
                  onClick={() => setMode("DONO")}
                >
                  Dono da barbearia
                </button>
                <button
                  type="button"
                  className={styles.segmentedItem}
                  data-active={mode === "AUTONOMO"}
                  onClick={() => setMode("AUTONOMO")}
                >
                  Autônomo
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Endereço (opcional por agora)</label>
              <input
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua Exemplo, 123 - Centro"
              />
            </div>

            <button type="button" className={styles.primaryBtn} onClick={handleStep1Continue} disabled={savingStep1}>
              {savingStep1 ? "Salvando..." : "Continuar"}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className={styles.title}>Horários de funcionamento</h1>
            <p className={styles.subtitle}>
              Já deixamos um horário padrão (seg–sáb, 9h–19h) pra você ajustar do seu jeito.
            </p>
            <ScheduleForm initialDays={DEFAULT_HOURS} initialTimeOff={[]} />
            <button type="button" className={styles.primaryBtn} onClick={() => setStep(3)}>
              Continuar
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className={styles.title}>Seu primeiro serviço</h1>
            <p className={styles.subtitle}>
              Cadastre um serviço pra já começar a receber agendamentos. Dá pra adicionar mais depois.
            </p>

            {serviceDone ? (
              <div className={styles.doneBanner}>✓ Serviço "{serviceName}" criado!</div>
            ) : (
              <>
                {serviceError && <div className={styles.error}>{serviceError}</div>}
                <div className={styles.field}>
                  <label className={styles.label}>Nome</label>
                  <input
                    className={styles.input}
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    placeholder="Corte de cabelo"
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
                      value={serviceDuration}
                      onChange={(e) => setServiceDuration(Number(e.target.value))}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Preço (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      className={styles.input}
                      value={servicePrice}
                      onChange={(e) => setServicePrice(Number(e.target.value))}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={handleCreateService}
                  disabled={savingService || !serviceName.trim()}
                >
                  {savingService ? "Criando..." : "Criar serviço e continuar"}
                </button>
              </>
            )}

            {serviceDone ? (
              <button type="button" className={styles.primaryBtn} onClick={() => setStep(4)}>
                Continuar
              </button>
            ) : (
              <button type="button" className={styles.skipBtn} onClick={() => setStep(4)}>
                Pular por enquanto
              </button>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h1 className={styles.title}>Falta pouco</h1>
            <p className={styles.subtitle}>Uma foto de perfil ajuda seus clientes a reconhecerem sua barbearia.</p>

            <div className={styles.avatarWrap}>
              <div
                className={styles.avatar}
                style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
                onClick={() => avatarInput.current?.click()}
              >
                {!avatarUrl && <span>{uploading ? "..." : "Foto"}</span>}
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className={styles.hiddenInput}
                  onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                />
              </div>
            </div>

            <div className={styles.trialBox}>
              {trialDays === null
                ? "Seu teste grátis começa agora, sem cartão de crédito."
                : `Você tem ${trialDays} dia${trialDays === 1 ? "" : "s"} de teste grátis, sem cartão de crédito.`}
            </div>

            {finishError && <div className={styles.error}>{finishError}</div>}

            <button type="button" className={styles.primaryBtn} onClick={handleFinish} disabled={finishing || uploading}>
              {finishing ? "Concluindo..." : "Concluir e ver minha agenda"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
