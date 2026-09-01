export type NavItem = {
  href: string;
  label: string;
  icon: string; // conteúdo SVG (path/circle), mesmo traçado do design handoff
  desktopOnly?: boolean;
  // Só aparece pro OWNER — telas financeiras (caixa) que um BARBER não tem
  // motivo pra acessar. A rota em si também redireciona se não for OWNER
  // (defesa em profundidade, mesmo padrão de app/(app)/conta/equipe).
  ownerOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Início",
    icon: '<path d="M3 10 12 3l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
  },
  {
    href: "/servicos",
    label: "Serviços",
    icon: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  },
  {
    href: "/produtos",
    label: "Produtos",
    icon: '<path d="M20.5 7.3 12 2 3.5 7.3v9.4L12 22l8.5-5.3z"/><path d="M3.5 7.3 12 12l8.5-4.7M12 12v10"/>',
    desktopOnly: true,
  },
  {
    href: "/painel",
    label: "Painel",
    icon: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
  },
  {
    href: "/caixa",
    label: "Caixa",
    icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><circle cx="12" cy="14" r="2.5"/>',
    desktopOnly: true,
    ownerOnly: true,
  },
  {
    href: "/clientes",
    label: "Clientes",
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    desktopOnly: true,
  },
  {
    href: "/conta",
    label: "Conta",
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  },
];
