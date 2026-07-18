"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./equipe.module.css";

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "BARBER";
  avatarUrl: string | null;
};
type NewCredentials = { name: string; email: string; password: string };

async function uploadStaffAvatar(targetStaffId: string, file: File): Promise<string> {
  const fileExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "staffAvatar", fileExt, targetStaffId }),
  });
  if (!signRes.ok) throw new Error("sign_failed");
  const { path, token, publicUrl } = await signRes.json();

  const supabase = createClient();
  const { error } = await supabase.storage.from("barbershop-media").uploadToSignedUrl(path, token, file);
  if (error) throw error;

  return publicUrl;
}

export function EquipeClient({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<NewCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleAvatarChange(id: string, file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploadingId(id);
    try {
      const avatarUrl = await uploadStaffAvatar(id, file);
      const res = await fetch(`/api/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });
      if (!res.ok) throw new Error("save_failed");
      router.refresh();
    } catch {
      setError("Não foi possível enviar a foto.");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleRemove(id: string, memberName: string) {
    if (!confirm(`Remover ${memberName} da equipe? Ele(a) perde o acesso ao sistema — o histórico de agendamentos dele(a) continua registrado.`)) {
      return;
    }
    setRemovingId(id);
    const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) {
      setError("Não foi possível remover. Tente novamente.");
      return;
    }
    router.refresh();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone: phone || undefined }),
    });

    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "email_already_registered"
          ? "Esse e-mail já está cadastrado em outra conta."
          : "Não foi possível adicionar. Confira os dados e tente de novo."
      );
      return;
    }

    const body = await res.json();
    setCredentials({ name, email, password: body.password });
    setName("");
    setEmail("");
    setPhone("");
    router.refresh();
  }

  async function handleCopy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Login: ${credentials.email}\nSenha: ${credentials.password}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bloqueado — os dados já estão visíveis em texto pra copiar manualmente.
    }
  }

  return (
    <div>
      <div className={styles.list}>
        {staff.map((s) => (
          <div key={s.id} className={styles.row}>
            <div
              className={styles.rowAvatar}
              style={s.avatarUrl ? { backgroundImage: `url(${s.avatarUrl})` } : undefined}
              onClick={() => fileInputs.current[s.id]?.click()}
            >
              {!s.avatarUrl && (uploadingId === s.id ? "…" : s.name.slice(0, 2).toUpperCase())}
              <input
                ref={(el) => {
                  fileInputs.current[s.id] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={styles.hiddenInput}
                onChange={(e) => handleAvatarChange(s.id, e.target.files?.[0])}
              />
            </div>
            <div className={styles.rowInfo}>
              <span className={styles.roleBadge}>{s.role === "OWNER" ? "Dono" : "Barbeiro"}</span>
              <span className={styles.rowName}>{s.name}</span>
              <span className={styles.rowMeta}>{s.email}</span>
            </div>
            {s.role === "BARBER" && (
              <button
                type="button"
                className={styles.removeBtn}
                disabled={removingId === s.id}
                onClick={() => handleRemove(s.id, s.name)}
              >
                {removingId === s.id ? "Removendo..." : "Remover"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className={styles.addSection}>
        <div className={styles.addTitle}>Adicionar barbeiro</div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleAdd}>
          <div className={styles.field}>
            <label className={styles.label}>Nome</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>E-mail</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>WhatsApp (opcional)</label>
            <input
              type="tel"
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 91234-5678"
            />
          </div>
          <button type="submit" className={styles.saveBtn} disabled={saving}>
            {saving ? "Adicionando..." : "Adicionar barbeiro"}
          </button>
        </form>

        {credentials && (
          <div className={styles.successCard}>
            <div className={styles.successTitle}>
              {credentials.name} foi adicionado(a) — repasse esse login pra ele(a):
            </div>
            <div className={styles.successRow}>
              <span className={styles.successLabel}>E-mail</span>
              <span className={styles.successValue}>{credentials.email}</span>
            </div>
            <div className={styles.successRow}>
              <span className={styles.successLabel}>Senha</span>
              <span className={styles.successValue}>{credentials.password}</span>
            </div>
            <button type="button" className={styles.copyBtn} onClick={handleCopy}>
              {copied ? "✓ Copiado!" : "Copiar login e senha"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
