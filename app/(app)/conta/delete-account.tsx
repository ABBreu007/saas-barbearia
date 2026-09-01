"use client";

import { useState } from "react";
import styles from "./conta.module.css";

// Exclusão de conta a pedido do titular (LGPD Art. 18). Exige digitar o
// nome exato da barbearia antes de habilitar o botão — mesmo padrão
// "type to confirm" do GitHub/Vercel pra ações destrutivas irreversíveis.
// A checagem de verdade é no servidor (DELETE /api/barbershop); isso aqui
// só evita um clique acidental.
export function DeleteAccountSection({ barbershopName }: { barbershopName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/barbershop", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: confirmText }),
    });
    if (!res.ok) {
      setDeleting(false);
      setError("Não foi possível excluir. Confira se digitou o nome certo.");
      return;
    }
    // A sessão não existe mais depois da exclusão — reload de verdade, não
    // router.push, pra garantir que nenhuma tela tente reusar dado antigo.
    window.location.href = "/login";
  }

  if (!open) {
    return (
      <button type="button" className={styles.dangerLink} onClick={() => setOpen(true)}>
        Excluir minha conta e todos os dados
      </button>
    );
  }

  return (
    <div className={styles.dangerZone}>
      <div className={styles.dangerTitle}>Excluir conta</div>
      <p className={styles.dangerDesc}>
        Isso apaga permanentemente a barbearia &quot;{barbershopName}&quot;, todos os serviços, agendamentos,
        clientes e o acesso de todos os barbeiros vinculados. Não é possível desfazer.
      </p>
      <label className={styles.dangerLabel}>
        Digite <strong>{barbershopName}</strong> pra confirmar
      </label>
      <input
        className={styles.dangerInput}
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
      />
      {error && <div className={styles.dangerError}>{error}</div>}
      <div className={styles.dangerActions}>
        <button type="button" className={styles.dangerCancelBtn} onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button
          type="button"
          className={styles.dangerConfirmBtn}
          disabled={confirmText !== barbershopName || deleting}
          onClick={handleDelete}
        >
          {deleting ? "Excluindo..." : "Excluir permanentemente"}
        </button>
      </div>
    </div>
  );
}
