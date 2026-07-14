"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    // Não checa o resultado pra decidir a mensagem: se checássemos e
    // mostrássemos "e-mail não encontrado" nesse caso, qualquer um poderia
    // usar esse formulário pra descobrir quais e-mails têm conta — mesmo
    // padrão de "não revelar existência de conta" já usado no cadastro.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Verifique seu e-mail</h1>
          <p className={styles.subtitle}>
            Se houver uma conta com o e-mail <strong>{email}</strong>, enviamos um link pra redefinir a senha.
            Confira sua caixa de entrada (e o spam).
          </p>
          <div className={styles.switch}>
            <Link href="/login">Voltar pro login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Esqueci minha senha</h1>
        <p className={styles.subtitle}>Informe seu e-mail e mandamos um link pra você criar uma nova senha.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>

        <div className={styles.switch}>
          <Link href="/login">Voltar pro login</Link>
        </div>
      </div>
    </div>
  );
}
