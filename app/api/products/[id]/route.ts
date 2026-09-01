import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

const updateProductSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  stockQty: z.number().int().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});

// Mesmo padrão de app/api/services/[id]/route.ts — toda query filtra por
// barbershopId do staff autenticado, nunca só pelo id da URL.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateProductSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { count } = await prisma.product.updateMany({
    where: { id, barbershopId: staff.barbershopId },
    data: parsed.data,
  });

  if (count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  return NextResponse.json({ product });
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
  const product = await prisma.product.findFirst({
    where: { id, barbershopId: staff.barbershopId },
  });
  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Mesma lógica de Service: se o produto já foi vendido em alguma comanda,
  // OrderItem.refId referencia ele mas sem FK de banco (refId é livre, pra
  // sobreviver mesmo se o produto for apagado depois) — então aqui não há
  // constraint que force o soft-delete, mas mantemos o mesmo comportamento
  // por consistência de histórico: se já foi vendido, desativa em vez de
  // apagar, pra não sumir da comanda antiga nem da lista de produtos vendidos.
  const hasSales = await prisma.orderItem.findFirst({
    where: { barbershopId: staff.barbershopId, kind: "PRODUCT", refId: id },
  });
  if (hasSales) {
    const deactivated = await prisma.product.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ deactivated: true, product: deactivated });
  }

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
