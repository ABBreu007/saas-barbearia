// Toda a operação (barbearias, clientes) é no Brasil — "hoje", "esta semana"
// etc. sempre devem ser calculados no fuso de São Paulo, nunca no fuso do
// servidor. Isso importa de verdade em produção: a Vercel roda em UTC, então
// sem isso "hoje" ficaria errado por até 3h perto da meia-noite.
//
// América/São Paulo está fixo em UTC-3 desde o fim do horário de verão no
// Brasil (2019) — por isso um offset fixo é seguro aqui, sem precisar de
// uma lib de timezone completa (date-fns-tz/luxon) só para isto.
const BRAZIL_UTC_OFFSET_HOURS = 3;

// Retorna [início, fim) do dia (00:00:00.000 a 23:59:59.999) no fuso de
// São Paulo, como instantes UTC — prontos para comparar com colunas
// `startTime`/`endTime` do Postgres.
export function brazilDayBounds(reference: Date = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(reference)
    .split("-")
    .map(Number);

  const start = new Date(Date.UTC(year, month - 1, day, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, BRAZIL_UTC_OFFSET_HOURS, 0, 0, -1));
  return { start, end };
}

// Início do dia (domingo) da semana corrente no fuso de São Paulo.
export function brazilWeekStart(reference: Date = new Date()) {
  const { start } = brazilDayBounds(reference);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(reference);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const result = new Date(start);
  result.setUTCDate(result.getUTCDate() - weekdayIndex);
  return result;
}

// Para uma data "YYYY-MM-DD" já pensada como calendário do Brasil (ex.: o
// cliente escolheu "13/07" num datepicker) — retorna os limites do dia como
// instantes UTC e o dia da semana (0=domingo), sem depender do fuso do
// processo Node que está rodando.
export function brazilDateStringBounds(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, BRAZIL_UTC_OFFSET_HOURS, 0, 0, -1));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { start, end, weekday };
}

// Minutos desde meia-noite (fuso de São Paulo) de um instante — usado para
// posicionar blocos de agendamento numa timeline (ex.: 23:25 → 1405).
export function brazilMinutesSinceMidnight(date: Date): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return ((utcMinutes - BRAZIL_UTC_OFFSET_HOURS * 60) % 1440 + 1440) % 1440;
}

// Converte qualquer instante para "YYYY-MM-DD" no fuso de São Paulo.
// IMPORTANTE: nunca usar `date.toISOString().slice(0, 10)` para agrupar
// agendamentos por dia — isso pega a data em UTC, que perto da meia-noite
// cai no dia errado (ex.: 23:25 no Brasil = 02:25 UTC do dia seguinte).
export function brazilDateString(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

// Alias — mesma função, nome mais claro no call-site quando o uso é
// especificamente "qual é a data de hoje" (ex.: default de ?date= na URL).
export const todayBrazilDateString = brazilDateString;

// Início do mês corrente no fuso de São Paulo.
export function brazilMonthStart(reference: Date = new Date()) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(reference)
    .split("-")
    .map(Number);

  return new Date(Date.UTC(year, month - 1, 1, BRAZIL_UTC_OFFSET_HOURS, 0, 0, 0));
}

// [início, fim) do mês corrente no fuso de São Paulo.
export function brazilMonthRange(reference: Date = new Date()) {
  const start = brazilMonthStart(reference);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { start, end };
}

// [início, fim) do mês ANTERIOR ao de `reference`, no fuso de São Paulo.
// Usa aritmética de mês (não milissegundos) porque meses têm tamanhos
// diferentes — subtrair 30 dias do dia 1 nem sempre cai no mês anterior certo.
export function brazilPreviousMonthRange(reference: Date = new Date()) {
  const start = brazilMonthStart(reference);
  const prevStart = new Date(start);
  prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
  const prevEnd = new Date(start);
  prevEnd.setUTCMilliseconds(prevEnd.getUTCMilliseconds() - 1);
  return { start: prevStart, end: prevEnd };
}
