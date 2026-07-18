import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStrongPassword } from "@/lib/password-server";

const createStaffSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z.string().min(8).max(20).optional(),
});

// Adiciona um barbeiro à equipe. Só o OWNER pode — um BARBER não deveria
// conseguir convidar outros membros. A senha é gerada pelo servidor (não
// pedida no formulário) porque quem está preenchendo é o DONO cadastrando
// outra pessoa, não a própria pessoa — mesmo raciocínio de
// scripts/criar-barbearia.mjs. O e-mail já nasce confirmado
// (`email_confirm: true`), sem depender de envio de e-mail nenhum.
export async function POST(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (staff.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createStaffSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { name, email, phone } = parsed.data;
  const password = generateStrongPassword();

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    const alreadyRegistered = authError?.message?.toLowerCase().includes("already been registered");
    return NextResponse.json(
      {
        error: alreadyRegistered ? "email_already_registered" : "create_failed",
        detail: authError?.message,
      },
      { status: alreadyRegistered ? 409 : 500 }
    );
  }

  try {
    // Mais de 1 barbeiro só faz sentido em modo "Dono da barbearia" — se a
    // barbearia ainda estava marcada como "Autônomo" (ex.: criada só com o
    // dono, ou trocada sem querer em Conta), adicionar o primeiro barbeiro
    // já corrige isso sozinho, evitando o estado inconsistente de ter
    // equipe mas a página pública se comportando como se fosse 1 pessoa só.
    const [newStaff] = await prisma.$transaction([
      prisma.staff.create({
        data: {
          barbershopId: staff.barbershopId,
          authUserId: authData.user.id,
          name,
          email,
          phone,
          role: "BARBER",
        },
      }),
      prisma.barbershop.updateMany({
        where: { id: staff.barbershopId, mode: "AUTONOMO" },
        data: { mode: "DONO" },
      }),
    ]);

    return NextResponse.json({ staff: newStaff, password }, { status: 201 });
  } catch (err) {
    // Compensação: sem isso, sobraria um usuário Auth "fantasma" sem Staff
    // correspondente, incapaz de logar em lugar nenhum.
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: "create_failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
