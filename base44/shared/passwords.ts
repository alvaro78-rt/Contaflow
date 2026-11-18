import { pbkdf2Sync } from 'node:crypto';
import { hashPassword, safeEqual } from './authHelpers.ts';

const ITERATIONS = 120000;
const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

// O caminho nativo mantém a compatibilidade com os hashes já emitidos,
// inclusive em versões do runtime que limitam as iterações via Web Crypto.
const derive = (password, salt, iterations) => {
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g) || [], (hex) => parseInt(hex, 16));
  return pbkdf2Sync(password, saltBytes, iterations, 32, 'sha256').toString('hex');
};

// Senhas novas: PBKDF2 com sal aleatório. O hash nunca sai do servidor.
export function newPasswordHash(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = derive(String(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

// Verifica o formato novo e também o antigo (SHA-256 de "cpf::senha") das contas já existentes.
export async function verifyPassword(stored, cpf, password) {
  const value = String(stored || '');
  if (!value) return false;
  if (value.startsWith('pbkdf2$')) {
    const [, iterations, salt, hash] = value.split('$');
    const count = Number(iterations);
    if (!Number.isInteger(count) || count < 1 || count > ITERATIONS ||
      !/^[0-9a-f]{32}$/i.test(salt || '') || !/^[0-9a-f]{64}$/i.test(hash || '')) return false;
    return safeEqual(derive(String(password), salt, count), hash);
  }
  return safeEqual(await hashPassword(cpf, password), value);
}