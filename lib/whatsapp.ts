// Monta um link de conversa do WhatsApp (wa.me) já com mensagem pré-pronta.
// Só funciona com números de celular brasileiros (assume DDD+número sem o
// código do país; adiciona "55" se ainda não tiver).
export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}
