export type MetricStatus = "verde" | "amarelo" | "vermelho" | "neutro";

// Utilitário único de status pra qualquer card com meta (faturamento hoje,
// faturamento do mês, e qualquer métrica futura da seção 2 do documento de
// melhorias) — evita replicar a mesma lógica de corte (100%/70%) em cada
// componente. Regras:
// - Sem meta definida (null/0) → neutro, nunca colore.
// - Amostra abaixo do mínimo (ex.: menos de 3 avaliações) → neutro, mesmo
//   com meta definida — não faz sentido avaliar confiabilidade estatística
//   baixa como se fosse "ruim".
// - >=100% da meta → verde; >=70% → amarelo; abaixo disso → vermelho.
export function getMetricStatus({
  valor,
  meta,
  amostraAtual = Infinity,
  amostraMinima = 0,
}: {
  valor: number;
  meta: number | null | undefined;
  amostraAtual?: number;
  amostraMinima?: number;
}): MetricStatus {
  if (amostraAtual < amostraMinima) return "neutro";
  if (!meta || meta <= 0) return "neutro";

  const pct = valor / meta;
  if (pct >= 1) return "verde";
  if (pct >= 0.7) return "amarelo";
  return "vermelho";
}

// Símbolo textual pra acompanhar a cor — daltonismo não deve depender só da
// cor pra entender o status (item 3.4 do documento de melhorias).
export function metricStatusSymbol(status: MetricStatus): string {
  if (status === "verde") return "▲";
  if (status === "amarelo") return "●";
  if (status === "vermelho") return "▼";
  return "—";
}
