"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./perfil.module.css";

type Props = {
  initialName: string;
  initialDescription: string;
  initialBannerUrl: string | null;
  initialAvatarUrl: string | null;
};

async function uploadImage(kind: "banner" | "avatar", file: File): Promise<string> {
  const fileExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const signRes = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fileExt }),
  });
  if (!signRes.ok) throw new Error("sign_failed");
  const { path, token, publicUrl } = await signRes.json();

  const supabase = createClient();
  const { error } = await supabase.storage
    .from("barbershop-media")
    .uploadToSignedUrl(path, token, file);
  if (error) throw error;

  return publicUrl;
}

export function ProfileForm({
  initialName,
  initialDescription,
  initialBannerUrl,
  initialAvatarUrl,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState<"banner" | "avatar" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bannerInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  async function handleFile(kind: "banner" | "avatar", file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(kind);
    try {
      const url = await uploadImage(kind, file);
      if (kind === "banner") setBannerUrl(url);
      else setAvatarUrl(url);
    } catch {
      setError("Não foi possível enviar a imagem.");
    } finally {
      setUploading(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/barbershop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        ...(bannerUrl ? { bannerUrl } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      }),
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
      <div
        className={styles.banner}
        style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined}
        onClick={() => bannerInput.current?.click()}
      >
        {!bannerUrl && (
          <span className={styles.bannerHint}>
            {uploading === "banner" ? "Enviando..." : "Toque para escolher o banner"}
          </span>
        )}
        <input
          ref={bannerInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={styles.hiddenInput}
          onChange={(e) => handleFile("banner", e.target.files?.[0])}
        />
      </div>

      <div className={styles.avatarWrap}>
        <div
          className={styles.avatar}
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
          onClick={() => avatarInput.current?.click()}
        >
          {!avatarUrl && <span className={styles.avatarHint}>{uploading === "avatar" ? "..." : "Foto"}</span>}
          <input
            ref={avatarInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.hiddenInput}
            onChange={(e) => handleFile("avatar", e.target.files?.[0])}
          />
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field}>
        <label className={styles.label}>Nome de exibição</label>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Descrição</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <button
        type="button"
        className={styles.saveBtn}
        onClick={handleSave}
        disabled={saving || uploading !== null}
      >
        {uploading ? "Enviando imagem..." : saving ? "Salvando..." : "Salvar alterações"}
      </button>
    </div>
  );
}
