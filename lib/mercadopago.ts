import { MercadoPagoConfig, PreApproval } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

// PreApproval = API de assinatura recorrente (plano PRO) do Mercado Pago.
export const preApproval = new PreApproval(client);
