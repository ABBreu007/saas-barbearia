import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUniqueSlug } from "@/lib/slug";
import { TRIAL_DAYS, PILOT_MONTHS } from "@/lib/plans";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  barbershopName: z.string().min(2).max(80),
  ownerName: z.string().min(2).max(80),
});

// Cadastro de uma nova barbearia: cria o usuário no Supabase Auth e, em
// seguida, a Barbershop + o Staff (OWNER) vinculados a ele. É o único ponto
// de entrada que cria uma barbearia — todas as outras rotas assumem que
// staff.barbershopId já existe.
export async function POST(request: NextRequest) {
  const parsed = signupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { email, password, barbershopName, ownerName } = parsed.data;

  // signUp() (não admin.createUser) de propósito: é o único jeito do Supabase
  // mandar de verdade o e-mail de confirmação — admin.createUser não dispara
  // e-mail nenhum, só marca o usuário como confirmado/não na hora. Com isso o
  // usuário nasce com email_confirmed_at = null e só consegue logar depois de
  // clicar no link (ver app/auth/confirm/route.ts).
  const anon = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: authData, error: authError } = await anon.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${new URL(request.url).origin}/auth/confirm` },
  });

  // Com "Confirm email" ativado, o Supabase não retorna erro pra e-mail já
  // cadastrado (evita permitir descobrir quais e-mails existem) — em vez
  // disso devolve um usuário "fake" sem identities. É o sinal documentado
  // pra detectar esse caso.
  const alreadyRegistered = authData.user && authData.user.identities?.length === 0;

  if (alreadyRegistered) {
    return NextResponse.json({ error: "email_already_registered" }, { status: 409 });
  }

  // Qualquer outra falha do signUp() — incluindo, na prática, falha ao
  // ENVIAR o e-mail de confirmação (o GoTrue trata isso como erro do
  // signUp() inteiro quando "Confirm email" está ativado, não como um aviso
  // separado). Bug real encontrado: antes essa rota devolvia o mesmo
  // `error: "auth_signup_failed"` tanto pra esse caso quanto pro de e-mail
  // já cadastrado, e o frontend traduzia AMBOS como "Esse e-mail já está
  // cadastrado" — uma falha de SMTP (ex.: rate limit, domínio de remetente
  // não verificado) aparecia pro usuário como se a conta já existisse,
  // escondendo a causa real. Agora os dois casos têm códigos diferentes.
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: "auth_signup_failed", detail: authError?.message },
      { status: 500 }
    );
  }

  const authUserId = authData.user.id;

  try {
    const slug = await generateUniqueSlug(barbershopName);

    const { barbershop, staff } = await prisma.$transaction(async (tx) => {
      const barbershop = await tx.barbershop.create({
        data: { name: barbershopName, slug },
      });

      const staff = await tx.staff.create({
        data: {
          barbershopId: barbershop.id,
          authUserId,
          name: ownerName,
          email,
          role: "OWNER",
        },
      });

      // Toda barbearia nasce em modo trial no plano FREE (14 dias, sem
      // cartão) e já sai marcada com o prazo de preço de piloto (R$40/mês
      // por 3 meses a partir do cadastro — depois migra sozinha pro preço
      // cheio de R$80/mês, ver lib/plans.ts). A cobrança em si só liga
      // quando a integração com o Mercado Pago for ativada.
      const now = Date.now();
      const trialEndsAt = new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const pilotPriceUntil = new Date(now);
      pilotPriceUntil.setMonth(pilotPriceUntil.getMonth() + PILOT_MONTHS);

      await tx.subscription.create({
        data: {
          barbershopId: barbershop.id,
          plan: "FREE",
          status: "TRIALING",
          trialEndsAt,
          pilotPriceUntil,
        },
      });

      return { barbershop, staff };
    });

    return NextResponse.json({ barbershop, staff }, { status: 201 });
  } catch (err) {
    // Compensação: sem isso, o usuário ficaria "logável" mas sem barbearia.
    // Precisa do client admin aqui — o anon usado no signUp() não tem
    // permissão pra apagar usuários.
    await createAdminClient().auth.admin.deleteUser(authUserId);
    return NextResponse.json(
      { error: "signup_failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
