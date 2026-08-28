import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  planId: z.string().min(1),
  clientName: z.string().min(1).max(80),
  clientPhone: z.string().min(8).max(20),
});

// Rota PÚBLICA — o cliente final SOLICITA um plano de assinatura pela
// página pública (não ativa sozinho). Cria um ClientPlan com status
// PENDING; só vira ACTIVE (e passa a valer créditos de verdade) quando o
// barbeiro aprova em /clientes, depois de confirmar o pagamento por fora.
// Sem essa aprovação, qualquer um poderia "virar assinante" de graça só
// digitando um telefone.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const { planId, clientName, clientPhone } = parsed.data;

  const plan = await prisma.barbershopPlan.findFirst({
    where: { id: planId, barbershopId: barbershop.id, active: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const client = await prisma.client.upsert({
    where: { barbershopId_phone: { barbershopId: barbershop.id, phone: clientPhone } },
    create: { barbershopId: barbershop.id, name: clientName, phone: clientPhone },
    update: { name: clientName },
  });

  const existing = await prisma.clientPlan.findFirst({
    where: { clientId: client.id, status: { in: ["PENDING", "ACTIVE"] } },
  });
  if (existing) {
    return NextResponse.json({ error: "already_requested" }, { status: 409 });
  }

  const clientPlan = await prisma.clientPlan.create({
    data: {
      barbershopId: barbershop.id,
      clientId: client.id,
      planId: plan.id,
      cycleStart: new Date(),
      status: "PENDING",
    },
    include: { plan: true },
  });

  return NextResponse.json({ clientPlan }, { status: 201 });
}
