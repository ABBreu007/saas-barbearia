// Popula a "Barbearia Teste QA" (slug: barbearia-teste-qa) com dados
// realistas o suficiente pra testar TODAS as telas do site: Início, Painel
// (métricas dia/semana/mês), Agenda, Serviços, Clientes, Conta, e a página
// pública de agendamento (incluindo avaliações).
//
// Uso: node scripts/seed-test-data.mjs
//
// É seguro rodar mais de uma vez: reseta agendamentos/clientes/serviços/
// avaliações/horários dessa barbearia especificamente antes de recriar (não
// mexe em nenhuma outra barbearia do banco). Os 2 barbeiros extra só são
// criados na primeira vez — reruns detectam que já existem pelo e-mail e
// reaproveitam.

import { readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const SLUG = "barbearia-teste-qa";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prisma = new PrismaClient();

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

// Mesma lógica de lib/timezone.ts (duplicada aqui de propósito — script roda
// fora do Next.js, sem o alias "@/"). Brasil é UTC-3 fixo (sem horário de
// verão desde 2019).
const DAY_MS = 24 * 60 * 60 * 1000;
function brazilDayStart(reference) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(reference)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
}
// dayOffset dias a partir de hoje (Brasil), no horário hour:minute (Brasil).
function at(dayOffset, hour, minute) {
  const base = brazilDayStart(new Date(Date.now() + dayOffset * DAY_MS));
  return new Date(base.getTime() + (hour * 60 + minute) * 60000);
}

async function main() {
  const barbershop = await prisma.barbershop.findUnique({ where: { slug: SLUG } });
  if (!barbershop) {
    console.error(`Barbearia "${SLUG}" não encontrada — rode isso só depois dela existir.`);
    process.exit(1);
  }
  console.log(`Semeando dados em "${barbershop.name}" (${SLUG})...\n`);

  // --- 1. Barbeiros extra (BARBER), além do OWNER que já existe ---
  const extraStaffSpecs = [
    { name: "Marcos Andrade", email: "marcos.barbeiro.qa@example.com" },
    { name: "Carlos Mendes", email: "carlos.barbeiro.qa@example.com" },
  ];
  const newStaffCredentials = [];
  const staffIds = [];

  const ownerStaff = await prisma.staff.findFirst({
    where: { barbershopId: barbershop.id, role: "OWNER" },
  });
  if (ownerStaff) staffIds.push(ownerStaff.id);

  for (const spec of extraStaffSpecs) {
    let staff = await prisma.staff.findFirst({ where: { barbershopId: barbershop.id, email: spec.email } });
    if (staff) {
      console.log(`Barbeiro "${spec.name}" já existe, reaproveitando.`);
    } else {
      const password = generatePassword();
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
      });
      if (authError || !authData.user) {
        console.error(`Falha ao criar usuário pra ${spec.name}:`, authError?.message);
        process.exit(1);
      }
      staff = await prisma.staff.create({
        data: {
          barbershopId: barbershop.id,
          authUserId: authData.user.id,
          name: spec.name,
          email: spec.email,
          phone: "11" + String(randomInt(900000000, 999999999)),
          role: "BARBER",
        },
      });
      newStaffCredentials.push({ name: spec.name, email: spec.email, password });
      console.log(`Barbeiro "${spec.name}" criado.`);
    }
    staffIds.push(staff.id);
  }
  const [ownerId, marcosId, carlosId] = staffIds;

  // --- 2. Reset dos dados de teste desta barbearia (não mexe em outras) ---
  console.log("\nLimpando agendamentos/avaliações/clientes/serviços antigos desta barbearia...");
  await prisma.appointment.deleteMany({ where: { barbershopId: barbershop.id } });
  await prisma.review.deleteMany({ where: { barbershopId: barbershop.id } });
  await prisma.client.deleteMany({ where: { barbershopId: barbershop.id } });
  await prisma.service.deleteMany({ where: { barbershopId: barbershop.id } });

  // --- 3. Horário de funcionamento: seg-sáb 9h-19h, domingo fechado ---
  console.log("Configurando horário de funcionamento...");
  for (let weekday = 0; weekday <= 6; weekday++) {
    const isOpen = weekday !== 0;
    await prisma.businessHour.upsert({
      where: { barbershopId_weekday: { barbershopId: barbershop.id, weekday } },
      create: { barbershopId: barbershop.id, weekday, isOpen, openMinutes: 9 * 60, closeMinutes: 19 * 60 },
      update: { isOpen, openMinutes: 9 * 60, closeMinutes: 19 * 60 },
    });
  }

  // --- 4. Serviços ---
  console.log("Criando serviços...");
  const serviceSpecs = [
    { name: "Corte Simples", durationMin: 30, priceCents: 3500 },
    { name: "Corte + Barba", durationMin: 50, priceCents: 6000 },
    { name: "Barba", durationMin: 20, priceCents: 2500 },
    { name: "Sobrancelha", durationMin: 15, priceCents: 1500 },
    { name: "Corte Infantil", durationMin: 30, priceCents: 3000 },
  ];
  const services = [];
  for (const spec of serviceSpecs) {
    services.push(await prisma.service.create({ data: { barbershopId: barbershop.id, ...spec } }));
  }
  const [sCorte, sCorteBarba, sBarba, sSobrancelha, sInfantil] = services;

  // --- 5. Clientes ---
  console.log("Criando clientes...");
  const clientSpecs = [
    "Rafael Souza",
    "Bruno Lima",
    "Carlos Eduardo Silva",
    "Diego Santos",
    "Eduardo Costa",
    "Felipe Oliveira",
    "Gustavo Pereira",
    "Henrique Alves",
    "Igor Martins",
    "Lucas Ferreira",
  ];
  const clients = [];
  for (const name of clientSpecs) {
    clients.push(
      await prisma.client.create({
        data: {
          barbershopId: barbershop.id,
          name,
          phone: "11" + String(randomInt(900000000, 999999999)),
        },
      })
    );
  }
  const [cRafael, cBruno, cCarlos, cDiego, cEduardo, cFelipe, cGustavo, cHenrique, cIgor, cLucas] = clients;

  // --- 6. Agendamentos ---
  // "ref" = horário de hoje usado como âncora pros agendamentos de hoje,
  // preso entre 11h-15h pra sempre caber dentro do expediente (9h-19h) não
  // importa a hora real em que este script for rodado.
  const nowMinutes = Math.round((Date.now() - brazilDayStart(new Date()).getTime()) / 60000);
  const ref = Math.min(900, Math.max(660, nowMinutes));

  console.log("Criando agendamentos (mês passado, esta semana, hoje e próximos dias)...");
  const specs = [
    // Mês passado (~3-6 semanas atrás) — alimenta a comparação mês a mês e a
    // retenção (Rafael e Bruno voltam este mês também).
    { off: -38, h: 10, m: 0, client: cRafael, service: sCorte, staff: ownerId, status: "CONFIRMED" },
    { off: -33, h: 14, m: 30, client: cBruno, service: sCorteBarba, staff: marcosId, status: "CONFIRMED" },
    { off: -27, h: 11, m: 0, client: cCarlos, service: sBarba, staff: carlosId, status: "CONFIRMED" },
    { off: -21, h: 16, m: 0, client: cRafael, service: sCorteBarba, staff: ownerId, status: "CONFIRMED" },
    { off: -20, h: 9, m: 30, client: cDiego, service: sSobrancelha, staff: marcosId, status: "NO_SHOW" },

    // Esta semana, antes de hoje.
    { off: -6, h: 10, m: 0, client: cEduardo, service: sCorte, staff: ownerId, status: "CONFIRMED" },
    { off: -5, h: 15, m: 0, client: cRafael, service: sCorte, staff: marcosId, status: "CONFIRMED" },
    { off: -4, h: 11, m: 30, client: cFelipe, service: sInfantil, staff: carlosId, status: "CONFIRMED" },
    { off: -3, h: 17, m: 0, client: cBruno, service: sBarba, staff: ownerId, status: "CONFIRMED" },
    { off: -2, h: 9, m: 0, client: cGustavo, service: sCorteBarba, staff: marcosId, status: "CANCELLED" },
    { off: -1, h: 13, m: 0, client: cHenrique, service: sCorte, staff: carlosId, status: "NO_SHOW" },
    { off: -1, h: 16, m: 30, client: cIgor, service: sSobrancelha, staff: ownerId, status: "CONFIRMED" },

    // Hoje — 2 já "aconteceram" (antes de agora) e 2 ainda por vir, âncoradas em `ref`.
    { off: 0, minutesFromRef: -150, client: cLucas, service: sCorte, staff: marcosId, status: "CONFIRMED" },
    { off: 0, minutesFromRef: -60, client: cDiego, service: sBarba, staff: carlosId, status: "NO_SHOW" },
    { off: 0, minutesFromRef: 90, client: cFelipe, service: sCorteBarba, staff: ownerId, status: "CONFIRMED" },
    { off: 0, minutesFromRef: 180, client: cGustavo, service: sSobrancelha, staff: marcosId, status: "CONFIRMED" },

    // Próximos dias (dentro da janela de 14 dias de agendamento futuro).
    { off: 1, h: 10, m: 0, client: cLucas, service: sCorte, staff: ownerId, status: "CONFIRMED" },
    { off: 2, h: 14, m: 0, client: cDiego, service: sCorteBarba, staff: marcosId, status: "CONFIRMED" },
    { off: 4, h: 11, m: 0, client: cGustavo, service: sBarba, staff: carlosId, status: "CONFIRMED" },
    { off: 6, h: 16, m: 0, client: cHenrique, service: sSobrancelha, staff: ownerId, status: "CONFIRMED" },
    { off: 9, h: 9, m: 30, client: cIgor, service: sInfantil, staff: marcosId, status: "CONFIRMED" },
    { off: 13, h: 15, m: 0, client: cFelipe, service: sCorte, staff: carlosId, status: "CONFIRMED" },
  ];

  for (const spec of specs) {
    const startTime =
      spec.minutesFromRef !== undefined ? at(spec.off, 0, ref + spec.minutesFromRef) : at(spec.off, spec.h, spec.m);
    const endTime = new Date(startTime.getTime() + spec.service.durationMin * 60000);
    await prisma.appointment.create({
      data: {
        barbershopId: barbershop.id,
        staffId: spec.staff,
        clientId: spec.client.id,
        serviceId: spec.service.id,
        startTime,
        endTime,
        status: spec.status,
        priceCents: spec.service.priceCents,
      },
    });
  }
  console.log(`  ${specs.length} agendamentos criados.`);

  // --- 7. Avaliações ---
  console.log("Criando avaliações...");
  const reviewSpecs = [
    { off: -33, name: "Rafael Souza", rating: 5, comment: "Atendimento excelente, super recomendo!" },
    { off: -25, name: "Bruno Lima", rating: 4, comment: "Muito bom, só demorou um pouco." },
    { off: -6, name: "Eduardo Costa", rating: 5, comment: "Melhor barbearia da região." },
    { off: -4, name: "Felipe Oliveira", rating: 5, comment: null },
    { off: -3, name: "Bruno Lima", rating: 5, comment: "Dessa vez foi ainda mais rápido, adorei." },
    { off: -1, name: "Igor Martins", rating: 5, comment: "Voltarei sempre!" },
  ];
  for (const r of reviewSpecs) {
    await prisma.review.create({
      data: {
        barbershopId: barbershop.id,
        clientName: r.name,
        rating: r.rating,
        comment: r.comment,
        createdAt: at(r.off, 12, 0),
      },
    });
  }
  console.log(`  ${reviewSpecs.length} avaliações criadas.`);

  // --- 8. Metas (dia/mês) calculadas a partir do faturamento já criado, pra
  // testar os dois estados do indicador (verde/amarelo/vermelho) ao mesmo
  // tempo: hoje fica em ~80% (amarelo), o mês fica em ~115% (verde).
  console.log("Calculando metas de faturamento...");
  const now = new Date();
  const monthStartReal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3, 0, 0, 0));
  const dayStart = brazilDayStart(now);

  const [monthRevenue, dayRevenue] = await Promise.all([
    prisma.appointment.aggregate({
      where: {
        barbershopId: barbershop.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        startTime: { gte: monthStartReal, lte: now },
      },
      _sum: { priceCents: true },
    }),
    prisma.appointment.aggregate({
      where: {
        barbershopId: barbershop.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        startTime: { gte: dayStart, lte: now },
      },
      _sum: { priceCents: true },
    }),
  ]);

  const monthRealizedCents = monthRevenue._sum.priceCents ?? 0;
  const dayRealizedCents = dayRevenue._sum.priceCents ?? 0;
  const monthlyGoalCents = monthRealizedCents > 0 ? Math.round(monthRealizedCents / 1.15) : 50000;
  const dailyGoalCents = dayRealizedCents > 0 ? Math.round(dayRealizedCents / 0.8) : 10000;

  await prisma.barbershop.update({
    where: { id: barbershop.id },
    data: { monthlyGoalCents, dailyGoalCents },
  });

  console.log("\n✅ Seed concluído.\n");
  console.log(`  Login (dono):     teste.barbeiro@exemplo.com / senhaSuperSegura123`);
  for (const c of newStaffCredentials) {
    console.log(`  Login (barbeiro): ${c.email} / ${c.password}`);
  }
  console.log(`  Página pública:   /${barbershop.slug}`);
  console.log(`  Faturamento hoje: R$ ${(dayRealizedCents / 100).toFixed(2)} (meta R$ ${(dailyGoalCents / 100).toFixed(2)})`);
  console.log(`  Faturamento mês:  R$ ${(monthRealizedCents / 100).toFixed(2)} (meta R$ ${(monthlyGoalCents / 100).toFixed(2)})`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Falha no seed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
