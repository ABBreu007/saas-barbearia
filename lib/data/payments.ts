import { prisma } from "@/lib/prisma";
import { preference, paymentRefund } from "@/lib/mercadopago";

type SettingsForDeposit = { depositType: "FIXED" | "PERCENT" | null; depositValue: number | null };

// `depositValue` já vem salvo do jeito que o Checkout Pro precisa: FIXED em
// centavos (mesma unidade de todo valor monetário no projeto), PERCENT como
// pontos percentuais inteiros (30 = 30%) — ver conversão em
// app/(app)/conta/configuracoes/configuracoes-client.tsx.
export function depositAmountCents(settings: SettingsForDeposit, priceCents: number): number {
  if (settings.depositType === "FIXED") return settings.depositValue ?? 0;
  if (settings.depositType === "PERCENT") return Math.round((priceCents * (settings.depositValue ?? 0)) / 100);
  return 0;
}

// Cria o checkout (Preference/Checkout Pro) do sinal. IMPORTANTE: usa o
// token da conta MP da própria Nexo (mesmo de lib/mercadopago.ts) — enquanto
// não existir Marketplace (OAuth Connect por barbearia), o dinheiro do sinal
// cai na conta da Nexo, não na do barbeiro. Repasse é manual até essa fase
// existir (ver aviso em app/(app)/caixa).
export async function createDepositPreference(input: {
  paymentId: string;
  serviceName: string;
  amountCents: number;
  origin: string;
  slug: string;
}) {
  const { paymentId, serviceName, amountCents, origin, slug } = input;
  const result = await preference.create({
    body: {
      items: [
        {
          id: paymentId,
          title: `Sinal — ${serviceName}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: amountCents / 100,
        },
      ],
      external_reference: paymentId,
      notification_url: `${origin}/api/payments/webhook`,
      back_urls: {
        success: `${origin}/${slug}?paymentId=${paymentId}`,
        pending: `${origin}/${slug}?paymentId=${paymentId}`,
        failure: `${origin}/${slug}?paymentId=${paymentId}`,
      },
    },
  });
  if (!result.id || !result.init_point) throw new Error("mp_preference_failed");
  return { preferenceId: result.id, checkoutUrl: result.init_point };
}

type SettleDb = Pick<typeof prisma, "payment" | "appointment" | "barbershopSettings">;

// Chamado pelos dois pontos de cancelamento (cliente final e barbeiro).
// Sempre cancela o Appointment; quando há um sinal PAID vinculado, decide o
// destino do dinheiro:
// - dentro do prazo configurado (cancellationHoursForFullRefund) → tenta
//   reembolso automático agora.
// - fora do prazo (cancelamento em cima da hora) → NÃO reembolsa sozinho,
//   fica REFUND_PENDING pro dono decidir ("pendência de reembolso" do
//   documento original).
// A tentativa automática só funciona hoje porque o dinheiro está na conta MP
// da própria Nexo (reembolsar é uma chamada na mesma conta que recebeu).
// Quando existir Marketplace/split de verdade (dinheiro na conta do
// barbeiro), essa chamada precisa ser repensada — não dá mais pra reembolsar
// a partir da conta da plataforma.
export async function cancelAppointmentAndSettlePayment(appointmentId: string, db: SettleDb = prisma) {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { payment: true },
  });
  if (!appointment) return;

  await db.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });

  const payment = appointment.payment;
  if (!payment || payment.status !== "PAID") return;

  const settings = await db.barbershopSettings.findUnique({ where: { barbershopId: appointment.barbershopId } });
  const hoursUntilStart = (appointment.startTime.getTime() - Date.now()) / (60 * 60 * 1000);
  const freeRefundWindow = settings?.cancellationHoursForFullRefund ?? 24;

  if (hoursUntilStart < freeRefundWindow) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "REFUND_PENDING", refundReason: "late_cancellation" },
    });
    return;
  }

  try {
    await refundPaymentNow(payment.id, payment.mpPaymentId, db);
  } catch {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "REFUND_PENDING", refundReason: "auto_refund_failed" },
    });
  }
}

// Chamada real de estorno na SDK do Mercado Pago + atualização do registro.
// Usada tanto pelo reembolso automático (dentro do prazo) quanto pela ação
// manual do dono em cima de uma pendência (`PATCH /api/payments/[id]`).
export async function refundPaymentNow(
  paymentId: string,
  mpPaymentId: string | null,
  db: Pick<typeof prisma, "payment"> = prisma
) {
  if (!mpPaymentId) throw new Error("missing_mp_payment_id");
  await paymentRefund.create({ payment_id: mpPaymentId });
  await db.payment.update({
    where: { id: paymentId },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
}
