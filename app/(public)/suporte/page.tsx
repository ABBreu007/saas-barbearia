import Link from "next/link";
import styles from "./suporte.module.css";
import { CopyEmailButton } from "./copy-email-button";

export const metadata = { title: "Suporte" };

const SUPPORT_EMAIL = "solucaonexo.co@gmail.com";
const NEXO_WHATSAPP_1 = "5521970946410";
const NEXO_WHATSAPP_2 = "5521969565614";
const NEXO_INSTAGRAM = "nexo.developer";
const NEXO_PORTFOLIO_URL = "https://portfolio-nexo.netlify.app/";

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

        <div className={styles.nexoSection}>
          <div className={styles.nexoHeader}>
            <div className={styles.nexoLogo}>NEXO</div>
            <div>
              <span className={styles.nexoEyebrow}>Nexo Developer</span>
              <h2 className={styles.nexoTitle}>Suporte técnico e canais oficiais</h2>
              <p className={styles.nexoSubtitle}>
                Use estes contatos para solicitar ajustes, tirar dúvidas ou acompanhar novos projetos.
              </p>
            </div>
          </div>

          <div className={styles.nexoGrid}>
            <div className={styles.nexoCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span className={styles.nexoCardLabel}>WhatsApp</span>
              <span className={styles.nexoCardValue}>(21) 97094-6410</span>
              <p className={styles.nexoCardHint}>Atendimento direto para dúvidas, ajustes e suporte do sistema.</p>
              <a href={`https://wa.me/${NEXO_WHATSAPP_1}`} target="_blank" rel="noreferrer" className={styles.nexoCardButton}>
                Chamar no WhatsApp
              </a>
            </div>

            <div className={styles.nexoCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span className={styles.nexoCardLabel}>WhatsApp alternativo</span>
              <span className={styles.nexoCardValue}>(21) 96956-5614</span>
              <p className={styles.nexoCardHint}>Canal alternativo para contato quando necessário.</p>
              <a href={`https://wa.me/${NEXO_WHATSAPP_2}`} target="_blank" rel="noreferrer" className={styles.nexoCardButton}>
                Chamar no WhatsApp
              </a>
            </div>

            <div className={styles.nexoCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
              </svg>
              <span className={styles.nexoCardLabel}>Instagram</span>
              <span className={styles.nexoCardValue}>@{NEXO_INSTAGRAM}</span>
              <p className={styles.nexoCardHint}>Acompanhe novidades, projetos e atualizações da empresa.</p>
              <a href={`https://instagram.com/${NEXO_INSTAGRAM}`} target="_blank" rel="noreferrer" className={styles.nexoCardButton}>
                Acessar Instagram
              </a>
            </div>

            <div className={styles.nexoCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span className={styles.nexoCardLabel}>E-mail</span>
              <span className={styles.nexoCardValue}>{SUPPORT_EMAIL}</span>
              <p className={styles.nexoCardHint}>Envie solicitações formais, escopos e informações complementares.</p>
              <CopyEmailButton email={SUPPORT_EMAIL} />
            </div>

            <div className={`${styles.nexoCard} ${styles.nexoCardWide}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span className={styles.nexoCardLabel}>Portfólio</span>
              <span className={styles.nexoCardValue}>Nexo Developer</span>
              <p className={styles.nexoCardHint}>Conheça outros projetos, soluções e entregas desenvolvidas pela empresa.</p>
              <a href={NEXO_PORTFOLIO_URL} target="_blank" rel="noreferrer" className={styles.nexoCardButton}>
                Ver portfólio
              </a>
            </div>
          </div>
        </div>

        <div className={styles.backRow}>
          <Link href="/">Voltar</Link>
        </div>
      </div>
    </div>
  );
}
