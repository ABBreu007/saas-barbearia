import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

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
