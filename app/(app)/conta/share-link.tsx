"use client";

import { useState } from "react";
import styles from "./conta.module.css";

export function ShareLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bloqueado (permissão do navegador) — sem fallback: o link
      // já está visível em texto pra copiar manualmente.
    }
  }

  return (
    <button type="button" className={styles.copyLinkBtn} onClick={handleCopy}>
      {copied ? "✓ Link copiado!" : "Copiar link"}
    </button>
  );
}
