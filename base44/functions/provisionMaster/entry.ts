import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { onlyDigits, safeEqual } from '../../shared/authHelpers.ts';
import { isValidCpf } from '../../shared/cpf.ts';
import { newPasswordHash } from '../../shared/passwords.ts';

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
  if (password.length < 6) return Response.json({ error: 'senha_curta' }, { status: 400 });

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
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}