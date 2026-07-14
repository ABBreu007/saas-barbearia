import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({ phone: z.string().min(8).max(20) });

// GET público — o cliente final busca os próprios agendamentos futuros por
// telefone. Não há login de cliente nesta MVP: o telefone funciona como
// credencial informal, com o mesmo nível de confiança do botão "Cancelar"
// mostrado logo após o agendamento (ver book/route.ts). Documentado como
// limitação conhecida no README.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ phone: searchParams.get("phone") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!barbershop) {
    return NextResponse.json({ error: "barbershop_not_found" }, { status: 404 });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      barbershopId: barbershop.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      endTime: { gte: new Date() },
      client: { phone: parsed.data.phone },
    },
    include: { service: true },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ appointments });
}
