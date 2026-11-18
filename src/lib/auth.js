import { onlyDigits } from '@/lib/format';

export async function hashPassword(cpf, password) {
  const bytes = new TextEncoder().encode(`${onlyDigits(cpf)}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const ROLE_LABEL = { admin: 'Administrador', gerente: 'Gerente', funcionario: 'Colaborador', master: 'Conta mestre' };
