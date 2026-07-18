import { randomInt } from "node:crypto";

// Server-only (usa node:crypto — nunca importar isto de um Client Component).
// Gera uma senha já dentro da regra de lib/password.ts (isStrongPassword) —
// usado quando o dono da barbearia cria o acesso de outra pessoa (barbeiro
// da equipe), então não faz sentido pedir pra ELE digitar uma senha para
// outra pessoa.
export function generateStrongPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%&*?";
  const all = lower + upper + digits + special;
  const pick = (chars: string) => chars[randomInt(chars.length)];

  const chars = [pick(lower), pick(upper), pick(digits), pick(special)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
