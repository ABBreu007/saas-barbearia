import { NextRequest, NextResponse } from "next/server";
import { getPublicBarbershopData } from "@/lib/data/public-page";

// Rota PÚBLICA (sem autenticação) que alimenta a página de agendamento do
// cliente final (/[slug]). Só expõe campos não sensíveis — nunca retornar
// e-mail/telefone de clientes, dados de assinatura, etc. Usada pelo client
// component da página pública quando o usuário troca de data (a carga
// inicial vem direto via Server Component, sem passar por aqui).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;
  const staffId = searchParams.get("staffId") ?? undefined;

  const data = await getPublicBarbershopData(slug, date, staffId);
  if (!data) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
