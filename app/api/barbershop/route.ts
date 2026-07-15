import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(300).optional(),
  mode: z.enum(["DONO", "AUTONOMO"]).optional(),
  bannerUrl: z.string().url().optional(),
  avatarUrl: z.string().url().optional(),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  whatsappUrl: z.string().url().optional().or(z.literal("")),
  address: z.string().max(200).optional(),
  monthlyGoalCents: z.number().int().positive().optional(),
  dailyGoalCents: z.number().int().positive().optional(),
  // Sinal de "terminei o onboarding" — nunca aceita uma data vinda do
  // client; o servidor grava o instante atual pra evitar timestamp forjado.
  markOnboarded: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { markOnboarded, ...data } = parsed.data;

  const barbershop = await prisma.barbershop.update({
    where: { id: staff.barbershopId },
    data: { ...data, ...(markOnboarded ? { onboardedAt: new Date() } : {}) },
  });

  return NextResponse.json({ barbershop });
}

const deleteSchema = z.object({ confirmName: z.string() });

// Exclusão de conta a pedido do titular (LGPD Art. 18). Só o OWNER pode
// apagar a barbearia inteira — um BARBER não deveria conseguir derrubar o
// negócio todo. Exige repetir o nome exato da barbearia no corpo da
// requisição (mesmo padrão "type to confirm" usado por GitHub/Vercel pra
// ações destrutivas) — o client já força isso antes de habilitar o botão,
// mas a checagem real é aqui, nunca só no frontend.
export async function DELETE(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success || parsed.data.confirmName !== staff.barbershop.name) {
    return NextResponse.json({ error: "name_mismatch" }, { status: 400 });
  }

  const allStaff = await prisma.staff.findMany({
    where: { barbershopId: staff.barbershopId },
    select: { authUserId: true },
  });

  // Cascade do Prisma cuida de apagar staff/services/clients/appointments/
  // etc. no Postgres — mas os usuários do Supabase Auth vivem fora do
  // Postgres da aplicação, então precisam ser apagados à parte.
  await prisma.barbershop.delete({ where: { id: staff.barbershopId } });

  const admin = createAdminClient();
  await Promise.all(allStaff.map((s) => admin.auth.admin.deleteUser(s.authUserId)));

  return NextResponse.json({ ok: true });
}
