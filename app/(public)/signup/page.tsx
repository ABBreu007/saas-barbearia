"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../auth.module.css";
import { isStrongPassword, PASSWORD_REQUIREMENT_TEXT } from "@/lib/password";
import { SELF_SIGNUP_ENABLED } from "@/lib/config";

export default function SignupPage() {
  if (!SELF_SIGNUP_ENABLED) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Cadastro por enquanto é sob consulta</h1>
          <p className={styles.subtitle}>
            Ainda não abrimos o autocadastro. Fale com a gente pra criarmos sua conta.
          </p>
          <div className={styles.switch}>
            <Link href="/suporte">Fale com o suporte</Link>
          </div>
          <div className={styles.switch}>
            Já tem conta? <Link href="/login">Entrar</Link>
          </div>
        </div>
      </div>
    );
  }

  return <SignupForm />;
}

function SignupForm() {
  const [barbershopName, setBarbershopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<
    "mismatch" | "weak_password" | "already_registered" | "generic" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("mismatch");
      return;
    }
    if (!isStrongPassword(password)) {
      setError("weak_password");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barbershopName, ownerName, phone, email, password }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // Distingue "e-mail já cadastrado" de qualquer outra falha (ex.: erro
      // ao enviar o e-mail de confirmação) — as duas costumavam mostrar a
      // mesma mensagem, o que escondia problemas reais de infraestrutura
      // atrás de um "já está cadastrado" que nem sempre era verdade.
      setError(body?.error === "email_already_registered" ? "already_registered" : "generic");
      return;
    }

    // A conta nasce sem confirmar o e-mail (ver /api/auth/signup) — só dá
    // pra logar depois de clicar no link que o Supabase manda. Por isso não
    // tentamos logar automaticamente aqui, só avisamos pra checar o e-mail.
    setSubmittedEmail(email);
  }

  if (submittedEmail) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Confirme seu e-mail</h1>
          <p className={styles.subtitle}>
            Enviamos um link de confirmação para <strong>{submittedEmail}</strong>. Abra seu e-mail e
            clique no link pra ativar sua conta — depois disso você já entra direto.
          </p>
          <div className={styles.switch}>
            Não recebeu? Confira a caixa de spam, ou <Link href="/signup">tente cadastrar de novo</Link>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Criar conta</h1>
        <p className={styles.subtitle}>Cadastre sua barbearia para começar</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={styles.error}>
              {error === "mismatch" && "As senhas não são iguais."}
              {error === "weak_password" && PASSWORD_REQUIREMENT_TEXT}
              {error === "already_registered" && "Esse e-mail já está cadastrado."}
              {error === "generic" && (
                <>
                  Não foi possível criar a conta agora. Tente novamente em alguns minutos — se
                  persistir, <Link href="/suporte">avise o suporte</Link>.
                </>
              )}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="barbershopName">
              Nome da barbearia
            </label>
            <input
              id="barbershopName"
              className={styles.input}
              value={barbershopName}
              onChange={(e) => setBarbershopName(e.target.value)}
              required
              minLength={2}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ownerName">
              Seu nome
            </label>
            <input
              id="ownerName"
              className={styles.input}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              minLength={2}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="phone">
              WhatsApp
            </label>
            <input
              id="phone"
              type="tel"
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 91234-5678"
              required
              minLength={8}
            />
          </div>

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
              minLength={8}
            />
            <span className={styles.hint}>{PASSWORD_REQUIREMENT_TEXT}</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              Confirmar senha
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

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>

        <p className={styles.legalNote}>
          Ao criar conta, você concorda com nossa{" "}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>

        <div className={styles.switch}>
          Já tem conta? <Link href="/login">Entrar</Link>
        </div>
        <div className={styles.switch}>
          Precisa de ajuda? <Link href="/suporte">Fale com o suporte</Link>
        </div>
      </div>
    </div>
  );
}
