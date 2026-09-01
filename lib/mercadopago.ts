import { MercadoPagoConfig, PreApproval, Preference, Payment, PaymentRefund } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

// PreApproval = API de assinatura recorrente (plano PRO) do Mercado Pago.
export const preApproval = new PreApproval(client);

// Preference = Checkout Pro, usado pro sinal antecipado do agendamento
// público. IMPORTANTE: usa o mesmo token acima (conta MP da própria Nexo) —
// enquanto não existir Marketplace (OAuth Connect por barbearia), o valor do
// sinal cai na conta da Nexo, não na do barbeiro. Ver nota em
// lib/data/payments.ts.
export const preference = new Preference(client);
export const mpPayment = new Payment(client);
export const paymentRefund = new PaymentRefund(client);
