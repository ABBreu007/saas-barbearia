"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";
import { isStrongPassword, PASSWORD_REQUIREMENT_TEXT } from "@/lib/password";

// O link de recuperação de senha do Supabase chega em UM DE DOIS formatos
// dependendo de quem/como disparou o e-mail, e os dois já foram observados
// de verdade neste projeto — não é hipotético:
// 1. Fragmento da URL (#access_token=...&type=recovery) — o que
//    `admin.generateLink()` produz (usado nos testes automatizados).
// 2. Query string (?code=...) — fluxo PKCE, o que `resetPasswordForEmail()`
//    produz de verdade quando chamado do browser client (`lib/supabase/
//    client.ts` usa `createBrowserClient` do @supabase/ssr, que tem
//    `flowType: "pkce"` como padrão). Testar só com `admin.generateLink()`
//    mascarou esse caso — mesma classe de erro que já aconteceu com
//    auth/confirm (testar o mecanismo errado dá falso positivo).
// Por isso essa página tenta os dois: primeiro tenta trocar o `code` da
// query string (`exchangeCodeForSession`), senão cai pro fragmento
// (`setSession`).
export default function ResetPasswordPage() {
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const code = new URL(window.location.href).searchParams.get("code");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        setStatus(error ? "invalid" : "ready");
      });
      return;
    }

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    if (!access_token || !refresh_token) {
      setStatus("invalid");
      return;
    }

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
    if (!isStrongPassword(password)) {
      setError(PASSWORD_REQUIREMENT_TEXT);
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
                <span className={styles.hint}>{PASSWORD_REQUIREMENT_TEXT}</span>
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
