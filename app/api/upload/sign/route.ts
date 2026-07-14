import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const signSchema = z.object({
  kind: z.enum(["banner", "avatar"]),
  fileExt: z.enum(["jpg", "jpeg", "png", "webp"]),
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

  const { kind, fileExt } = parsed.data;
  const path = `${staff.barbershopId}/${kind}-${Date.now()}.${fileExt}`;

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
