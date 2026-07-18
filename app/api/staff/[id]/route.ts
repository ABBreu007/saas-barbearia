import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({ avatarUrl: z.string().url() });

// Atualiza a foto de um membro da equipe (o único campo editável por aqui
// por enquanto). Só o OWNER pode editar a foto de outra pessoa; cada staff
// também pode editar a própria.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (staff.role !== "OWNER" && staff.id !== id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const target = await prisma.staff.findFirst({ where: { id, barbershopId: staff.barbershopId } });
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updated = await prisma.staff.update({
    where: { id },
    data: { avatarUrl: parsed.data.avatarUrl },
  });

  return NextResponse.json({ staff: updated });
}

// Remove um barbeiro da equipe. Só o OWNER pode, e nunca é possível remover
// um OWNER por aqui (sempre precisa sobrar pelo menos um dono responsável
// pela barbearia — não existe fluxo de transferência de titularidade ainda).
// Os agendamentos já feitos por esse barbeiro NÃO são apagados: o Prisma
// (onDelete: SetNull em Appointment.staffId) só desvincula, preservando o
// faturamento/histórico já registrado.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.staff.findFirst({
    where: { id, barbershopId: staff.barbershopId },
  });
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "cannot_remove_owner" }, { status: 400 });
  }

  await prisma.staff.delete({ where: { id: target.id } });
  await createAdminClient().auth.admin.deleteUser(target.authUserId);

  return NextResponse.json({ ok: true });
}
