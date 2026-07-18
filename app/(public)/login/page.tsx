"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "../auth.module.css";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "confirm_failed"
      ? "O link de confirmação é inválido ou já expirou. Tente se cadastrar de novo."
      : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(
        error.code === "email_not_confirmed"
          ? "Confirme seu e-mail antes de entrar — verifique o link que enviamos na sua caixa de entrada."
          : "E-mail ou senha incorretos."
      );
      return;
    }

    router.push("/");
    router.refresh(); // força o layout (Server Component) a reler a sessão
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Entrar</h1>
        <p className={styles.subtitle}>Acesse o painel da sua barbearia</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

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

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className={styles.forgotRow}>
            <Link href="/esqueci-senha">Esqueci minha senha</Link>
          </div>

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className={styles.switch}>
          Ainda não tem conta? <Link href="/signup">Cadastre sua barbearia</Link>
        </div>
        <div className={styles.switch}>
          Precisa de ajuda? <Link href="/suporte">Fale com o suporte</Link>
        </div>
      </div>
    </div>
  );
}
