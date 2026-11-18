export const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

// Mesma receita do cliente: SHA-256 de "cpf::senha" em hexadecimal.
export async function hashPassword(cpf, password) {
  const bytes = new TextEncoder().encode(`${onlyDigits(cpf)}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}