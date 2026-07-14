import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { preApproval } from "@/lib/mercadopago";

// Webhook do Mercado Pago para eventos de assinatura (PreApproval).
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/webhooks
//
// IMPORTANTE: valida a assinatura do webhook (x-signature) antes de confiar em
// qualquer payload — sem isso, qualquer pessoa poderia forjar uma chamada e
// liberar acesso PRO de graça.
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

  return crypto.timingSafeEqual(
    Buffer.from(receivedHash),
    Buffer.from(expectedHash)
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSignature(request, rawBody)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  if (payload.type !== "preapproval") {
    return NextResponse.json({ ok: true }); // ignora outros tipos de evento
  }

  const preapprovalId = payload.data?.id;
  if (!preapprovalId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const remote = await preApproval.get({ id: preapprovalId });

  const statusMap: Record<string, "ACTIVE" | "PAST_DUE" | "CANCELED"> = {
    authorized: "ACTIVE",
    paused: "PAST_DUE",
    cancelled: "CANCELED",
  };
  const status = statusMap[remote.status ?? ""] ?? "PAST_DUE";

  await prisma.subscription.updateMany({
    where: { mpSubscriptionId: preapprovalId },
    data: {
      status,
      plan: status === "ACTIVE" ? "PRO" : "FREE",
      currentPeriodEnd: remote.next_payment_date
        ? new Date(remote.next_payment_date)
        : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
