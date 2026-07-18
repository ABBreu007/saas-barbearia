// Cria uma barbearia manualmente (dono do SaaS cadastrando por fora do
// autocadastro público, que está desativado — ver lib/config.ts). Faz
// exatamente o que /api/auth/signup faz, só que sem exigir confirmação por
// e-mail (o usuário já nasce confirmado no Supabase Auth).
//
// Uso: node scripts/criar-barbearia.mjs
//
// Atenção: este projeto usa o MESMO banco Postgres/Supabase tanto local
// quanto em produção (não existe banco de dev separado) — rodar este script
// cria a conta de verdade, em produção, não importa de onde você rodou.

import { createInterface } from "node:readline/promises";
import { randomInt } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(projectRoot, ".env");
  if (!existsSync(envPath)) {
    console.error("Não achei o arquivo .env em " + envPath);
    process.exit(1);
  }
  for (const rawLine of readFileSync(envPath, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const admin = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prisma = new PrismaClient();

// Mesma regra de senha forte do cadastro público (lib/password.ts):
// mínimo 8, com maiúscula, minúscula e caractere especial. Gerar em vez de
// pedir pro operador digitar evita erro de digitação e garante que já nasce
// dentro da regra.
function generatePassword() {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%&*?";
  const all = lower + upper + digits + special;
  const pick = (chars) => chars[randomInt(chars.length)];

  const chars = [pick(lower), pick(upper), pick(digits), pick(special)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Mesma lógica de lib/slug.ts, duplicada aqui de propósito — este script
// roda fora do Next.js (sem o alias "@/"), então não importa lib/ diretamente.
function slugify(input) {
  return input
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // remove marcas diacríticas (acentos) após normalização NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function generateUniqueSlug(name) {
  const base = slugify(name) || "barbearia";
  let candidate = base;
  let suffix = 2;
  while (await prisma.barbershop.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

// Mesmos valores de lib/plans.ts (TRIAL_DAYS, PILOT_MONTHS) — duplicado pelo
// mesmo motivo acima. Se mudar lá, mudar aqui também.
const TRIAL_DAYS = 14;
const PILOT_MONTHS = 3;

async function main() {
  console.log("=== Criar barbearia (cadastro manual) ===");
  console.log("Atenção: isso grava direto no banco de produção (não existe banco separado de teste).\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const barbershopName = (await rl.question("Nome da barbearia: ")).trim();
  if (barbershopName.length < 2) {
    console.error("Nome da barbearia inválido (mínimo 2 caracteres).");
    rl.close();
    process.exit(1);
  }

  const ownerName = (await rl.question("Nome do dono: ")).trim();
  if (ownerName.length < 2) {
    console.error("Nome do dono inválido (mínimo 2 caracteres).");
    rl.close();
    process.exit(1);
  }

  const phone = (await rl.question("WhatsApp/telefone (ex: 11999998888): ")).trim();
  if (phone.length < 8) {
    console.error("Telefone inválido (mínimo 8 caracteres).");
    rl.close();
    process.exit(1);
  }

  const email = (await rl.question("E-mail do dono: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("E-mail inválido.");
    rl.close();
    process.exit(1);
  }

  const password = generatePassword();

  console.log("\nConfirme os dados:");
  console.log(`  Barbearia:     ${barbershopName}`);
  console.log(`  Dono:          ${ownerName}`);
  console.log(`  Telefone:      ${phone}`);
  console.log(`  E-mail:        ${email}`);
  console.log(`  Senha gerada:  ${password}`);

  const confirm = (await rl.question("\nCriar essa conta agora? (sim/não): ")).trim().toLowerCase();
  rl.close();

  if (confirm !== "sim" && confirm !== "s") {
    console.log("Cancelado, nada foi criado.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nCriando usuário no Supabase Auth...");
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // já nasce confirmado — nenhum e-mail é enviado
  });

  if (authError || !authData.user) {
    console.error("Falha ao criar usuário:", authError?.message ?? "erro desconhecido");
    await prisma.$disconnect();
    process.exit(1);
  }

  const authUserId = authData.user.id;

  try {
    console.log("Criando barbearia, dono e assinatura no banco...");
    const slug = await generateUniqueSlug(barbershopName);

    const { barbershop } = await prisma.$transaction(async (tx) => {
      const barbershop = await tx.barbershop.create({
        data: { name: barbershopName, slug },
      });

      await tx.staff.create({
        data: {
          barbershopId: barbershop.id,
          authUserId,
          name: ownerName,
          email,
          phone,
          role: "OWNER",
        },
      });

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

      return { barbershop };
    });

    console.log("\nConta criada com sucesso.\n");
    console.log(`  Página pública:  /${barbershop.slug}  (prefixe com o domínio: localhost:3000 ou o domínio de produção)`);
    console.log(`  E-mail de login: ${email}`);
    console.log(`  Senha:           ${password}`);
    console.log("\nManda esses dados de login pro dono da barbearia. Ele pode trocar a senha depois em \"Esqueci minha senha\" na tela de login.");
  } catch (err) {
    console.error("\nFalha ao criar os dados no banco — desfazendo o usuário criado no Auth...");
    console.error(err instanceof Error ? err.message : err);
    await admin.auth.admin.deleteUser(authUserId);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
