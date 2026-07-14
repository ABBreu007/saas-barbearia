"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dados.module.css";

export function DadosForm({
  initialAddress,
  initialInstagramUrl,
  initialWhatsappUrl,
}: {
  initialAddress: string;
  initialInstagramUrl: string;
  initialWhatsappUrl: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress);
  const [instagramUrl, setInstagramUrl] = useState(initialInstagramUrl);
  const [whatsappUrl, setWhatsappUrl] = useState(initialWhatsappUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/barbershop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, instagramUrl, whatsappUrl }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Não foi possível salvar as alterações.");
      return;
    }
    router.push("/conta");
    router.refresh();
  }

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label}>Endereço</label>
        <input
          className={styles.input}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Rua Exemplo, 123 — Bairro, Cidade"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Instagram (link)</label>
        <input
          className={styles.input}
          value={instagramUrl}
          onChange={(e) => setInstagramUrl(e.target.value)}
          placeholder="https://instagram.com/suabarbearia"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>WhatsApp (link)</label>
        <input
          className={styles.input}
          value={whatsappUrl}
          onChange={(e) => setWhatsappUrl(e.target.value)}
          placeholder="https://wa.me/5511999998888"
        />
      </div>

      <button type="button" className={styles.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar alterações"}
      </button>
    </div>
  );
}
