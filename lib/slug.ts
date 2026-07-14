import { prisma } from "@/lib/prisma";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "") // remove marcas diacríticas (acentos) após normalização NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Gera um slug único checando colisões no banco (barbearia-silva-cia, -2, -3...).
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "barbearia";
  let candidate = base;
  let suffix = 2;

  while (await prisma.barbershop.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
