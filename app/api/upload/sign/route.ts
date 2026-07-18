import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const signSchema = z.object({
  kind: z.enum(["banner", "avatar", "staffAvatar"]),
  fileExt: z.enum(["jpg", "jpeg", "png", "webp"]),
  // Obrigatório só para kind "staffAvatar" — qual barbeiro da equipe está
  // recebendo a foto (pode não ser quem está fazendo o upload: é o OWNER
  // gerenciando a foto de outro barbeiro em Conta → Equipe).
  targetStaffId: z.string().min(1).optional(),
});

const BUCKET = "barbershop-media";

// Gera uma signed upload URL do Supabase Storage escopada à barbearia do
// staff autenticado. O upload real do arquivo acontece do browser direto
// para o Storage usando essa URL — o binário nunca passa pelo backend.
// Substitui o image-slot.js do protótipo (que era só drag-and-drop mock).
export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = signSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { kind, fileExt, targetStaffId } = parsed.data;

  if (kind === "staffAvatar") {
    if (!targetStaffId) {
      return NextResponse.json({ error: "missing_target_staff_id" }, { status: 400 });
    }
    // Só o OWNER edita foto de terceiros — escopado à própria barbearia
    // (nunca confiar em targetStaffId vindo do client sem checar isso).
    if (staff.role !== "OWNER" && targetStaffId !== staff.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const target = await prisma.staff.findFirst({
      where: { id: targetStaffId, barbershopId: staff.barbershopId },
    });
    if (!target) {
      return NextResponse.json({ error: "staff_not_found" }, { status: 404 });
    }
  }

  const path =
    kind === "staffAvatar"
      ? `${staff.barbershopId}/staff-${targetStaffId}-${Date.now()}.${fileExt}`
      : `${staff.barbershopId}/${kind}-${Date.now()}.${fileExt}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: publicUrlData.publicUrl,
  });
}
