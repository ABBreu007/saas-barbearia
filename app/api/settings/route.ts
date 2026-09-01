import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

// Configurações da barbearia (comissão padrão + campos de sinal, que
// controlam o fluxo de Payment em lib/data/payments.ts). Só o OWNER acessa,
// mesmo gate de app/api/staff/route.ts.
const updateSettingsSchema = z.object({
  depositRequired: z.boolean().optional(),
  depositType: z.enum(["FIXED", "PERCENT"]).nullable().optional(),
  depositValue: z.number().int().nonnegative().nullable().optional(),
  cancellationHoursForFullRefund: z.number().int().nonnegative().max(720).optional(),
  defaultServiceCommissionBps: z.number().int().min(0).max(10000).optional(),
  defaultProductCommissionBps: z.number().int().min(0).max(10000).optional(),
});

const DEFAULTS = {
  depositRequired: false,
  depositType: null as "FIXED" | "PERCENT" | null,
  depositValue: null as number | null,
  cancellationHoursForFullRefund: 24,
  defaultServiceCommissionBps: 0,
  defaultProductCommissionBps: 0,
};

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const settings = await prisma.barbershopSettings.findUnique({
    where: { barbershopId: staff.barbershopId },
  });

  return NextResponse.json({ settings: settings ?? { barbershopId: staff.barbershopId, ...DEFAULTS } });
}

export async function PATCH(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const settings = await prisma.barbershopSettings.upsert({
    where: { barbershopId: staff.barbershopId },
    create: { barbershopId: staff.barbershopId, ...DEFAULTS, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ settings });
}
