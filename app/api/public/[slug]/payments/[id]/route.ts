import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota PÚBLICA — a página de agendamento consulta isso em polling logo
// depois de voltar do Checkout Pro do Mercado Pago, pra saber se já pode
// mostrar "confirmado". Só devolve o status (nada sensível); o id do
// Payment é um cuid não adivinhável, dispensa telefone como credencial
// extra (mesmo raciocínio de um link de confirmação de pedido sem conta).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;

  const barbershop = await prisma.barbershop.findUnique({ where: { slug }, select: { id: true } });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const payment = await prisma.payment.findFirst({
    where: { id, barbershopId: barbershop.id },
    select: { status: true },
  });
  if (!payment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ status: payment.status });
}
