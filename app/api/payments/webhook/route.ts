import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mpPayment } from "@/lib/mercadopago";

// Webhook do Mercado Pago para eventos de pagamento (sinal antecipado do
// agendamento público). Mesmo esquema de validação HMAC de
// app/api/subscriptions/webhook/route.ts — dois recursos de webhook
// diferentes do MP, não vale a pena abstrair pra um helper compartilhado por
// só 2 usos.
function isValidSignature(request: NextRequest, rawBody: string): boolean {
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!signatureHeader || !requestId || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("="))
  );
  const ts = parts.ts;
  const receivedHash = parts.v1;
  if (!ts || !receivedHash) return false;

  const manifest = `id:${requestId};request-id:${requestId};ts:${ts};`;
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const received = Buffer.from(receivedHash);
  const expected = Buffer.from(expectedHash);
  // timingSafeEqual lança (em vez de retornar false) se os buffers tiverem
  // tamanhos diferentes — um v1 malformado/truncado sem isso derrubava a
  // rota com 500 em vez de simplesmente rejeitar com 401.
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSignature(request, rawBody)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  if (payload.type !== "payment") {
    return NextResponse.json({ ok: true }); // ignora outros tipos de evento
  }

  const mpPaymentId = payload.data?.id;
  if (!mpPaymentId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const remote = await mpPayment.get({ id: mpPaymentId });
  const externalReference = remote.external_reference; // = Payment.id
  if (!externalReference) {
    return NextResponse.json({ ok: true });
  }

  const payment = await prisma.payment.findUnique({ where: { id: externalReference } });
  // Já resolvido (webhook duplicado, ou já expirou/foi cancelado por fora) —
  // não reprocessa.
  if (!payment || payment.status !== "PENDING") {
    return NextResponse.json({ ok: true });
  }

  if (remote.status === "approved") {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date(), mpPaymentId: String(mpPaymentId) },
      }),
      prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { status: "CONFIRMED" },
      }),
    ]);
  } else if (remote.status === "rejected" || remote.status === "cancelled") {
    // Libera o horário — não faz sentido segurar a agenda por um pagamento
    // que não vai se concretizar.
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", mpPaymentId: String(mpPaymentId) },
      }),
      prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { status: "CANCELLED" },
      }),
    ]);
  }
  // in_process / pending / outros: nada muda ainda, só confirma recebimento.

  return NextResponse.json({ ok: true });
}
