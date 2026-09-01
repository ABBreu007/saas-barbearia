import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { todayBrazilDateString } from "@/lib/timezone";

const orderItemInput = z.object({
  kind: z.enum(["SERVICE", "PRODUCT"]),
  refId: z.string().min(1),
  quantity: z.number().int().positive().max(50).default(1),
});

const createOrderSchema = z.object({
  clientId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
  appointmentId: z.string().min(1).optional(),
  items: z.array(orderItemInput).min(1),
  // Por padrão a comanda já nasce fechada (caso comum: "Concluir" um
  // atendimento gera tudo de uma vez). close: false existe pra fluxo de
  // venda avulsa que o barbeiro ainda vai completar depois.
  close: z.boolean().default(true),
});

// Cria uma comanda com seus itens (serviço e/ou produtos) numa transação só.
// Dois pontos de entrada:
// - appointmentId presente: nasce a partir de "Concluir" um agendamento —
//   client/staff são herdados do agendamento se não vierem no body, e o
//   Appointment é marcado COMPLETED junto.
// - appointmentId ausente: venda avulsa (ex.: cliente de passagem só
//   comprando produto) — clientId/staffId viram obrigatórios.
export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { appointmentId, items, close } = parsed.data;
  let { clientId, staffId } = parsed.data;

  let appointment = null;
  if (appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, barbershopId: staff.barbershopId },
      include: { order: true },
    });
    if (!appointment) {
      return NextResponse.json({ error: "appointment_not_found" }, { status: 404 });
    }
    if (appointment.order) {
      return NextResponse.json({ error: "appointment_already_has_order" }, { status: 409 });
    }
    clientId = clientId ?? appointment.clientId;
    staffId = staffId ?? appointment.staffId ?? staff.id;
  }

  if (!clientId || !staffId) {
    return NextResponse.json({ error: "client_and_staff_required" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, barbershopId: staff.barbershopId },
  });
  if (!client) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }
  const orderStaff = await prisma.staff.findFirst({
    where: { id: staffId, barbershopId: staff.barbershopId },
  });
  if (!orderStaff) {
    return NextResponse.json({ error: "staff_not_found" }, { status: 404 });
  }

  // Resolve cada item pro Service/Product de origem, sempre com preço
  // vindo do servidor (nunca do body) — mesmo princípio de
  // Appointment.priceCents em app/api/public/[slug]/book/route.ts.
  const resolvedItems: {
    kind: "SERVICE" | "PRODUCT";
    refId: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
    totalCents: number;
  }[] = [];
  for (const item of items) {
    if (item.kind === "SERVICE") {
      const service = await prisma.service.findFirst({
        where: { id: item.refId, barbershopId: staff.barbershopId },
      });
      if (!service) {
        return NextResponse.json({ error: "service_not_found", refId: item.refId }, { status: 404 });
      }
      resolvedItems.push({
        kind: "SERVICE",
        refId: service.id,
        name: service.name,
        unitPriceCents: service.priceCents,
        quantity: item.quantity,
        totalCents: service.priceCents * item.quantity,
      });
    } else {
      const product = await prisma.product.findFirst({
        where: { id: item.refId, barbershopId: staff.barbershopId },
      });
      if (!product) {
        return NextResponse.json({ error: "product_not_found", refId: item.refId }, { status: 404 });
      }
      resolvedItems.push({
        kind: "PRODUCT",
        refId: product.id,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
        totalCents: product.priceCents * item.quantity,
      });
    }
  }

  const settings = await prisma.barbershopSettings.findUnique({
    where: { barbershopId: staff.barbershopId },
  });
  const serviceRateBps = settings?.defaultServiceCommissionBps ?? 0;
  const productRateBps = settings?.defaultProductCommissionBps ?? 0;
  const totalCents = resolvedItems.reduce((sum, i) => sum + i.totalCents, 0);

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        barbershopId: staff.barbershopId,
        clientId,
        staffId,
        appointmentId: appointmentId ?? null,
        status: close ? "CLOSED" : "OPEN",
        totalCents,
        closedAt: close ? new Date() : null,
      },
    });

    for (const item of resolvedItems) {
      const orderItem = await tx.orderItem.create({
        data: { barbershopId: staff.barbershopId, orderId: createdOrder.id, ...item },
      });
      const rateBps = item.kind === "SERVICE" ? serviceRateBps : productRateBps;
      await tx.commission.create({
        data: {
          barbershopId: staff.barbershopId,
          orderId: createdOrder.id,
          orderItemId: orderItem.id,
          staffId,
          rateBps,
          amountCents: Math.round((item.totalCents * rateBps) / 10000),
        },
      });
    }

    if (appointmentId) {
      await tx.appointment.update({ where: { id: appointmentId }, data: { status: "COMPLETED" } });
    }

    // Lança automaticamente no caixa do dia se houver um aberto — conveniência
    // de UX (fechar comanda já reflete no caixa), não uma dependência forte:
    // se não houver caixa aberto, a comanda é salva normalmente mesmo assim.
    if (close) {
      const openRegister = await tx.cashRegister.findFirst({
        where: {
          barbershopId: staff.barbershopId,
          date: new Date(todayBrazilDateString()),
          status: "OPEN",
        },
      });
      if (openRegister) {
        await tx.cashMovement.create({
          data: {
            barbershopId: staff.barbershopId,
            cashRegisterId: openRegister.id,
            type: "SALE",
            amountCents: totalCents,
            orderId: createdOrder.id,
            createdByStaffId: staff.id,
          },
        });
      }
    }

    return tx.order.findUniqueOrThrow({
      where: { id: createdOrder.id },
      include: { items: true },
    });
  });

  return NextResponse.json({ order }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const orders = await prisma.order.findMany({
    where: { barbershopId: staff.barbershopId, ...(clientId ? { clientId } : {}) },
    include: { items: true, client: true, staff: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ orders });
}
