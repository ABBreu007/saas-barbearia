export const PASSWORD_REQUIREMENT_TEXT =
  "Mínimo de 8 caracteres, com letra maiúscula, minúscula e um caractere especial.";

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
