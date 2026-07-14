"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

// Mesmo mecanismo de app/auth/confirm/page.tsx: o link de recuperação de
// senha do Supabase também redireciona com a sessão no FRAGMENTO da URL
// (#access_token=...&type=recovery), não numa query string — por isso essa
// página também precisa ler o fragmento manualmente e chamar setSession()
// em vez de confiar no parsing automático (ver comentário detalhado em
// auth/confirm/page.tsx sobre o porquê do flowType "pkce" não pegar isso
// sozinho).
export default function ResetPasswordPage() {
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    if (!access_token || !refresh_token) {
      setStatus("invalid");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      setStatus(error ? "invalid" : "ready");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError("Não foi possível redefinir a senha. Tente pedir um novo link.");
      return;
    }

    // Reload de verdade (não router.push) — mesmo motivo do auth/confirm:
    // garante que o cookie da nova sessão já está disponível pro Server
    // Component na próxima navegação.
    window.location.href = "/";
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {status === "checking" && (
          <>
            <h1 className={styles.title}>Confirmando...</h1>
            <p className={styles.subtitle}>Só um instante.</p>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1 className={styles.title}>Link inválido</h1>
            <p className={styles.subtitle}>
              Esse link de redefinição é inválido ou já expirou. Peça um novo link em "Esqueci minha senha".
            </p>
          </>
        )}

        {status === "ready" && (
          <>
            <h1 className={styles.title}>Nova senha</h1>
            <p className={styles.subtitle}>Escolha uma nova senha pra sua conta.</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  Nova senha
                </label>
                <input
                  id="password"
                  type="password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="confirmPassword">
                  Confirmar nova senha
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className={styles.input}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <button className={styles.submit} type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Redefinir senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
