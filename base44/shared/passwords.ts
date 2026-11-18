import { pbkdf2Async } from 'npm:@noble/hashes@2.2.0/pbkdf2.js';
import { sha256 } from 'npm:@noble/hashes@2.2.0/sha2.js';
import { hashPassword, safeEqual } from './authHelpers.ts';

const ITERATIONS = 100000;
const LEGACY_ITERATIONS = 120000;
const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function derive(password, salt, iterations) {
  const passwordBytes = new TextEncoder().encode(password);
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g) || [], (hex) => parseInt(hex, 16));

  // O runtime hospedado aceita até 100 mil iterações. A implementação JS
  // verifica hashes antigos acima desse limite sem alterar a senha da conta.
  if (iterations > ITERATIONS) {
    return toHex(await pbkdf2Async(sha256, passwordBytes, saltBytes, { c: iterations, dkLen: 32 }));
  }

  const key = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return toHex(bits);
}

export async function newPasswordHash(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(String(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(stored, cpf, password) {
  const value = String(stored || '');
  if (!value) return false;
  if (value.startsWith('pbkdf2$')) {
    const [, iterations, salt, hash] = value.split('$');
    const count = Number(iterations);
    if (!Number.isInteger(count) || count < 1 || count > LEGACY_ITERATIONS ||
      !/^[0-9a-f]{32}$/i.test(salt || '') || !/^[0-9a-f]{64}$/i.test(hash || '')) return false;
    return safeEqual(await derive(String(password), salt, count), hash);
  }
  return safeEqual(await hashPassword(cpf, password), value);
}
