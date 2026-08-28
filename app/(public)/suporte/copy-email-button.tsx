"use client";

import { useState } from "react";
import styles from "./suporte.module.css";

export function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={handleCopy} className={styles.nexoCardButton}>
      {copied ? "E-mail copiado!" : "Copiar e-mail"}
    </button>
  );
}
