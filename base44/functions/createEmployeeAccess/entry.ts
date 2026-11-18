import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { onlyDigits } from '../../shared/authHelpers.ts';
import { isValidCpf } from '../../shared/cpf.ts';
import { newPasswordHash } from '../../shared/passwords.ts';
import { loadSession, scopeCompany, MANAGEMENT_ROLES } from '../../shared/sessionGuard.ts';

// Cadastro de funcionário com acesso. CPF é o usuário; a empresa vem da sessão autorizada.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const fullName = String(body?.full_name || '').trim();
  const cpf = onlyDigits(body?.cpf);
  const password = String(body?.password || '');

  try {
    const loaded = await loadSession(base44, body?.token);
    if (loaded.error) return Response.json({ error: loaded.error }, { status: loaded.status });
    const { session, actor } = loaded;

    const scope = scopeCompany(session, actor);
    if (!scope) return Response.json({ error: 'sem_empresa' }, { status: 403 });
    if (!MANAGEMENT_ROLES.includes(actor.access_role || '')) {
      return Response.json({ error: 'sem_permissao' }, { status: 403 });
    }

    if (fullName.length < 3) return Response.json({ error: 'nome_invalido' }, { status: 400 });
    if (cpf.length !== 11 || !isValidCpf(cpf)) {
      return Response.json({ error: 'cpf_invalido' }, { status: 400 });
    }
    if (password.length < 6) return Response.json({ error: 'senha_curta' }, { status: 400 });

    // Um CPF, uma conta: não cria acesso duplicado para quem já tem senha definida.
    const { items: existentes } = await base44.asServiceRole.entities.Employee.filter({ cpf }, { limit: 10 });
    if (existentes.some((e) => e.password_hash)) {
      return Response.json({ error: 'cpf_ja_tem_acesso' }, { status: 409 });
    }

    const created = await base44.asServiceRole.entities.Employee.create({
      company_id: scope,
      full_name: fullName,
      cpf,
      access_role: 'funcionario',
      status: 'ativo',
      password_hash: await newPasswordHash(password),
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    });

    // Duplo clique ou timeout: sobrevive apenas o cadastro mais antigo deste CPF.
    const { items: depois } = await base44.asServiceRole.entities.Employee.filter(
      { cpf, company_id: scope },
      { sort: 'created_date', limit: 5 },
    );
    const primeiro = depois[0];
    if (primeiro && primeiro.id !== created.id) {
      await base44.asServiceRole.entities.Employee.delete(created.id);
      return Response.json({
        ok: true,
        employee: { id: primeiro.id, full_name: primeiro.full_name || '', duplicated: true },
      });
    }

    return Response.json({
      ok: true,
      employee: { id: created.id, full_name: created.full_name || '', company_id: scope },
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}