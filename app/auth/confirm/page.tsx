"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../../(public)/auth.module.css";

// Destino do link de confirmação de e-mail (signUp usa emailRedirectTo
// apontando pra cá). O Supabase valida o token no lado dele e redireciona o
// navegador de volta com a sessão no FRAGMENTO da URL (#access_token=...) —
// isso nunca chega ao servidor (fragmento não é enviado em requisição HTTP
// nenhuma), por isso essa página é client-side.
//
// Lê o fragmento manualmente e chama setSession() em vez de confiar no
// `detectSessionInUrl` automático do supabase-js: o client deste app
// (createBrowserClient de @supabase/ssr) usa flowType "pkce" por padrão, que
// espera um `?code=` na query string, não um `#access_token=` no fragmento —
// então o parsing automático simplesmente não dispara pra esse link
// (confirmado testando: a sessão nunca era criada, sem erro nenhum). Ler o
// fragmento à mão e chamar setSession() funciona independente do flow type.
export default function ConfirmEmailPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");

    if (!access_token || !refresh_token) {
      queueMicrotask(() => setFailed(true));
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) {
        setFailed(true);
        return;
      }
      // Reload de verdade (não router.push) — garante que o cookie recém-gravado
      // pelo setSession já vai junto na próxima requisição ao servidor.
      window.location.href = "/";
    });
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {failed ? (
          <>
            <h1 className={styles.title}>Link inválido</h1>
            <p className={styles.subtitle}>
              Esse link de confirmação é inválido ou já expirou. Tente se cadastrar de novo.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Confirmando...</h1>
            <p className={styles.subtitle}>Só um instante.</p>
          </>
        )}
      </div>
    </div>
  );
}
