import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const updateServiceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  durationMin: z.number().int().positive().max(480).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

// Toda query filtra por barbershopId do staff autenticado, nunca só pelo id
// da URL — impede que um barbeiro edite/apague serviço de outra barbearia.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateServiceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { count } = await prisma.service.updateMany({
    where: { id, barbershopId: staff.barbershopId },
    data: parsed.data,
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const service = await prisma.service.findUnique({ where: { id } });
  return NextResponse.json({ service });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const service = await prisma.service.findFirst({
    where: { id, barbershopId: staff.barbershopId },
  });
  if (!service) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // O relacionamento Appointment.service é onDelete: Restrict (histórico de
  // agendamentos não pode ficar órfão) — apagar de verdade um serviço que já
  // foi usado em algum agendamento falharia na constraint do banco. Antes
  // disso não era tratado: a exclusão simplesmente falhava (erro 500 não
  // capturado) e a tela não mostrava nada, parecendo que o botão não fazia
  // nada. Agora: se o serviço nunca foi usado, apaga de verdade; se já foi,
  // desativa (campo `active`, que a página pública já respeita) em vez de
  // apagar — some da página de agendamento do cliente, mas o histórico
  // permanece intacto pro Painel.
  const hasAppointments = await prisma.appointment.findFirst({ where: { serviceId: id } });
  if (hasAppointments) {
    const deactivated = await prisma.service.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ deactivated: true, service: deactivated });
  }

  await prisma.service.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
