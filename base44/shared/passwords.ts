import { hashPassword, safeEqual } from './authHelpers.ts';

const ITERATIONS = 120000;
const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

const derive = async (password, salt, iterations) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = new Uint8Array((salt.match(/.{2}/g) || []).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return toHex(bits);
};

// Senhas novas: PBKDF2 com sal aleatório. O hash nunca sai do servidor.
export async function newPasswordHash(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(String(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

// Verifica o formato novo e também o antigo (SHA-256 de "cpf::senha") das contas já existentes.
export async function verifyPassword(stored, cpf, password) {
  const value = String(stored || '');
  if (!value) return false;
  if (value.startsWith('pbkdf2$')) {
    const [, iterations, salt, hash] = value.split('$');
    if (!salt || !hash) return false;
    return safeEqual(await derive(String(password), salt, Number(iterations) || ITERATIONS), hash);
  }
  return safeEqual(await hashPassword(cpf, password), value);
}