import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getCommissions } from "@/lib/data/commissions";
import type { Period } from "@/lib/data/metrics";

// GET /api/commissions?period=dia|semana|mes&staffId=
// staffId só tem efeito pro OWNER — um BARBER sempre vê a própria comissão,
// nunca a de um colega, mesmo que tente passar o staffId de outra pessoa na
// query (mesmo princípio de nunca confiar em id vindo do client pra decidir
// de quem são os dados).
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") as Period) ?? "mes";
  const requestedStaffId = searchParams.get("staffId") ?? undefined;
  const staffId = staff.role === "OWNER" ? requestedStaffId : staff.id;

  const commissions = await getCommissions(staff.barbershopId, period, staffId);
  return NextResponse.json(commissions);
}
