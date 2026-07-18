import Link from "next/link";
import styles from "./suporte.module.css";

export const metadata = { title: "Suporte" };

const SUPPORT_EMAIL = "solucaonexo.co@gmail.com";

export default function SupportPage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Suporte</h1>
        <p className={styles.subtitle}>
          Problema no sistema, dúvida sobre sua conta ou algo não funcionou como esperado? Fale com a
          gente diretamente por e-mail — respondemos o mais rápido possível.
        </p>

        <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.emailCard}>
          <span className={styles.emailLabel}>E-mail de suporte</span>
          <span className={styles.emailAddress}>{SUPPORT_EMAIL}</span>
        </a>

        <p className={styles.tip}>
          Pra agilizar, inclua no e-mail: o nome da sua barbearia, o e-mail usado no cadastro e uma
          descrição do que aconteceu (print de tela ajuda bastante).
        </p>

        <div className={styles.backRow}>
          <Link href="/">Voltar</Link>
        </div>
      </div>
    </div>
  );
}
