import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getMetrics, type Period } from "@/lib/data/metrics";

// GET /api/metrics?period=dia|semana|mes
// Alimenta o card de faturamento, KPIs, gráfico, "Serviços mais vendidos",
// "Faturamento por barbeiro" e o comparativo com o mês anterior da tela
// Painel. A lógica em si mora em lib/data/metrics.ts (reaproveitada
// diretamente pelo Server Component da página, sem passar por HTTP).
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") as Period) ?? "mes";

  const metrics = await getMetrics(staff.barbershopId, period);
  return NextResponse.json(metrics);
}
