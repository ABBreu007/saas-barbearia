import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initials } from "@/lib/format";
import { ModeSwitcher } from "./mode-switcher";
import { LogoutButton } from "./logout-button";
import { ShareLinkButton } from "./share-link";
import { trialDaysLeft, isInPilotWindow, effectivePriceCents, PILOT_PRICE_CENTS, FULL_PRICE_CENTS } from "@/lib/plans";
import { formatCentsBRL, formatDateShort } from "@/lib/format";
import styles from "./conta.module.css";

export default async function ContaPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const subscription = await prisma.subscription.findUnique({
    where: { barbershopId: staff.barbershopId },
  });

  // Origem lida do header `host` (não de env var) — funciona igual em
  // localhost e no domínio real de produção sem precisar configurar nada.
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const publicUrl = `${protocol}://${host}/${staff.barbershop.slug}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 176, margin: 1 });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Conta</h1>

      <div className={styles.profileRow}>
        <div
          className={styles.avatar}
          style={
            staff.barbershop.avatarUrl
              ? { backgroundImage: `url(${staff.barbershop.avatarUrl})` }
              : undefined
          }
        >
          {!staff.barbershop.avatarUrl && initials(staff.barbershop.name)}
        </div>
        <div>
          <div className={styles.profileName}>{staff.barbershop.name}</div>
          <div className={styles.profileSub}>
            {staff.name} · {staff.email}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Modo de operação</div>
        <ModeSwitcher mode={staff.barbershop.mode} />
      </div>

      <div className={styles.planCard}>
        <div className={styles.planHeader}>
          <span className={styles.planBadge}>
            PLANO {subscription?.plan ?? "FREE"}
          </span>
          <span className={styles.planStatus}>
            {subscription?.status === "TRIALING" ? "Em teste" : subscription?.status ?? "—"}
          </span>
        </div>
        {subscription?.status === "TRIALING" ? (
          <>
            <div className={styles.planPrice}>
              {(() => {
                const days = trialDaysLeft(subscription.trialEndsAt);
                if (days === null) return "Teste grátis";
                return (
                  <>
                    {days} dia{days === 1 ? "" : "s"}
                    <span className={styles.planPriceUnit}> restante{days === 1 ? "" : "s"}</span>
                  </>
                );
              })()}
            </div>
            <div className={styles.planDesc}>
              Teste grátis, sem cartão de crédito · depois{" "}
              {formatCentsBRL(isInPilotWindow(subscription.pilotPriceUntil) ? PILOT_PRICE_CENTS : FULL_PRICE_CENTS)}
              /mês
              {isInPilotWindow(subscription.pilotPriceUntil) &&
                ` até ${formatDateShort(subscription.pilotPriceUntil!)}`}
            </div>
          </>
        ) : (
          <>
            <div className={styles.planPrice}>
              {formatCentsBRL(effectivePriceCents(subscription ?? { plan: "FREE", pilotPriceUntil: null }))}
              <span className={styles.planPriceUnit}>/mês</span>
            </div>
            <div className={styles.planDesc}>
              Agenda ilimitada · Página pública · Relatórios
              {subscription && isInPilotWindow(subscription.pilotPriceUntil) &&
                ` · preço de piloto até ${formatDateShort(subscription.pilotPriceUntil!)}`}
            </div>
          </>
        )}
        <button type="button" className={styles.planManageBtn} disabled>
          {subscription?.status === "TRIALING" ? "Assinar agora (em breve)" : "Gerenciar assinatura (em breve)"}
        </button>
      </div>

      <div className={styles.menu}>
        <Link href="/conta/perfil" className={styles.menuItem}>
          <span>Personalizar perfil &amp; banner</span>
          <span className={styles.menuAction}>Editar ›</span>
        </Link>
        <Link href="/conta/horarios" className={styles.menuItem}>
          <span>Horários de funcionamento</span>
          <span className={styles.menuAction}>Definir ›</span>
        </Link>
        <Link href="/conta/dados" className={styles.menuItem}>
          <span>Dados da barbearia</span>
          <span className={styles.menuAction}>Editar ›</span>
        </Link>
        <Link href={`/${staff.barbershop.slug}`} className={styles.menuItem} target="_blank" data-last="true">
          <span>Redes sociais &amp; link público</span>
          <span className={styles.menuAction}>Ver página ›</span>
        </Link>
      </div>

      <div className={styles.shareCard}>
        <div className={styles.sectionLabel}>Compartilhar página de agendamento</div>
        <div className={styles.shareBody}>
          <img src={qrDataUrl} alt="QR code do link de agendamento" className={styles.qrImage} width={88} height={88} />
          <div className={styles.shareInfo}>
            <div className={styles.shareUrl}>{publicUrl.replace(/^https?:\/\//, "")}</div>
            <div className={styles.shareHint}>
              Poste no Instagram, mande no WhatsApp ou imprima o QR code no balcão — o cliente agenda sem precisar
              baixar nada.
            </div>
            <ShareLinkButton url={publicUrl} />
          </div>
        </div>
      </div>

      <div className={styles.menu}>
        <div className={styles.menuItem} data-disabled="true">
          <span>Formas de pagamento</span>
          <span className={styles.menuChevron}>›</span>
        </div>
        <div className={styles.menuItem} data-disabled="true" data-last="true">
          <span>Notificações</span>
          <span className={styles.menuChevron}>›</span>
        </div>
      </div>

      <LogoutButton className={styles.logoutBtn} />
      <div style={{ height: 24 }} />
    </div>
  );
}
