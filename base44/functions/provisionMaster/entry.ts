import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { pbkdf2Async } from 'npm:@noble/hashes@2.2.0/pbkdf2.js';
import { sha256 } from 'npm:@noble/hashes@2.2.0/sha2.js';
import { secrets } from 'base44:runtime';

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

// Mesma receita do cliente: SHA-256 de "cpf::senha" em hexadecimal.
async function hashPassword(cpf, password) {
  const bytes = new TextEncoder().encode(`${onlyDigits(cpf)}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


// Mesma validação de dígitos verificadores usada no cliente.
function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

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

async function newPasswordHash(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(String(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(stored, cpf, password) {
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


// Primeiro acesso da instalação: uma única conta, protegida por chave secreta.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const token = typeof body?.token === 'string' ? body.token : '';
  const cpf = onlyDigits(body?.cpf);
  const fullName = String(body?.full_name || '').trim();
  const password = String(body?.password || '');

  if (!fullName || fullName.length < 3) return Response.json({ error: 'nome_invalido' }, { status: 400 });
  if (cpf.length !== 11 || !isValidCpf(cpf)) return Response.json({ error: 'cpf_invalido' }, { status: 400 });
  if (password.length < 6 || password.length > 128) return Response.json({ error: 'senha_curta' }, { status: 400 });

  try {
    let expected = '';
    try {
      expected = secrets.get('BOOTSTRAP_TOKEN') || '';
    } catch {
      expected = '';
    }
    if (!expected) {
      return Response.json({ error: 'nao_configurado' }, { status: 503 });
    }
    if (!safeEqual(token, expected)) {
      return Response.json({ error: 'token_invalido' }, { status: 403 });
    }

    // Cadastro inicial encerrado no servidor: qualquer conta ou empresa já existente fecha a porta.
    const [contas, empresas] = await Promise.all([
      base44.asServiceRole.entities.Employee.filter({}, { limit: 1 }),
      base44.asServiceRole.entities.Company.filter({}, { limit: 1 }),
    ]);
    if (contas.items.length > 0 || empresas.items.length > 0) {
      return Response.json({ error: 'ja_existe' }, { status: 409 });
    }

    const created = await base44.asServiceRole.entities.Employee.create({
      full_name: fullName,
      cpf,
      access_role: 'master',
      status: 'ativo',
      password_hash: await newPasswordHash(password),
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    });

    // Dois cliques simultâneos: sobrevive apenas a conta criada primeiro.
    const { items: mestres } = await base44.asServiceRole.entities.Employee.filter(
      { access_role: 'master' },
      { sort: 'created_date', limit: 5 },
    );
    if (mestres[0] && mestres[0].id !== created.id) {
      await base44.asServiceRole.entities.Employee.delete(created.id);
      return Response.json({ error: 'ja_existe' }, { status: 409 });
    }

    return Response.json({ ok: true, master: { id: created.id, full_name: created.full_name } });
  } catch {
    return Response.json({ error: 'falha_servidor' }, { status: 500 });
  }
}
