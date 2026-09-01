"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import styles from "./nav.module.css";

function Icon({ svg, active }: { svg: string; active: boolean }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#f0ece2" : "#6f6a5f"}
      strokeWidth={active ? 2.4 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Nav({
  barbershopName,
  barbershopInitials,
  barbershopAvatarUrl,
  planLabel,
  isOwner,
}: {
  barbershopName: string;
  barbershopInitials: string;
  barbershopAvatarUrl: string | null;
  planLabel: string;
  isOwner: boolean;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);

  return (
    <>
      {/* Mobile: tab bar inferior */}
      <nav className={styles.mobileNav} aria-label="Navegação principal">
        {visibleItems.filter((item) => !item.desktopOnly).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={styles.mobileItem}
              data-active={active}
            >
              <Icon svg={item.icon} active={active} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sidebar fixa */}
      <aside className={styles.sidebar} aria-label="Navegação principal">
        <div className={styles.sidebarBrand}>
          <div
            className={styles.sidebarAvatar}
            style={barbershopAvatarUrl ? { backgroundImage: `url(${barbershopAvatarUrl})` } : undefined}
          >
            {!barbershopAvatarUrl && barbershopInitials}
          </div>
          <span className={styles.sidebarBrandName}>{barbershopName}</span>
        </div>
        <div className={styles.sidebarLinks}>
          {visibleItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.sidebarItem}
                data-active={active}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={active ? "#ffffff" : "#9a9384"}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: item.icon }}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.planBadge}>PLANO {planLabel}</div>
          <Link href="/conta" className={styles.planManage}>
            Gerenciar
          </Link>
        </div>
      </aside>
    </>
  );
}
