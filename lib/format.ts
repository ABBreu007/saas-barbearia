const BRAZIL_TZ = "America/Sao_Paulo";

export function formatCentsBRL(cents: number): string {
  const reais = cents / 100;
  return `R$${reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

// Sempre formata no fuso de São Paulo — independe do fuso do servidor
// (importante: em produção a Vercel roda em UTC) e do fuso do browser do
// cliente (a operação é sempre no Brasil, não no fuso de quem está olhando).
// `hour12: false` é explícito (não implícito via locale) porque o ICU do
// Node no Windows já mostrou inconsistência de AM/PM mesmo com "pt-BR".
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BRAZIL_TZ,
  });
}

// Formato longo (ex.: "domingo, 12 de jul.") — usado só na saudação da tela
// Início, que é copy/design, não um dado tabular de agendamento.
export function formatDateLong(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: BRAZIL_TZ,
  });
}

// dd/MM/yyyy — formato numérico curto para listas/tabelas (Clientes,
// avaliações, agendamentos buscados por telefone). Monta a string a partir
// das partes (não de toLocaleDateString com locale) para garantir a ordem
// dd/MM/yyyy independente de qualquer peculiaridade de ICU da plataforma.
export function formatDateShort(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.day}/${map.month}/${map.year}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function greeting(date: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: BRAZIL_TZ,
    }).format(date)
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
