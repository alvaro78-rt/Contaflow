import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession, scopeCompany, MANAGEMENT_ROLES } from '../../shared/sessionGuard.ts';

// Lista os funcionários da empresa em uso. A empresa vem da sessão validada, não do navegador.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  try {
    const loaded = await loadSession(base44, body?.token);
    if (loaded.error) return Response.json({ error: loaded.error }, { status: loaded.status });
    const { session, actor } = loaded;

    const scope = scopeCompany(session, actor);
    if (!scope) return Response.json({ error: 'sem_empresa' }, { status: 403 });
    if (!MANAGEMENT_ROLES.includes(actor.access_role || '')) {
      return Response.json({ error: 'sem_permissao' }, { status: 403 });
    }

    const { items } = await base44.asServiceRole.entities.Employee.filter(
      { company_id: scope },
      { sort: 'full_name', limit: 200 },
    );

    return Response.json({
      ok: true,
      employees: items.map((e) => ({
        id: e.id,
        full_name: e.full_name || '',
        cpf: e.cpf || '',
        status: e.status || 'ativo',
        access_role: e.access_role || 'funcionario',
        department: e.department || '',
        base_salary: e.base_salary || 0,
        tem_acesso: Boolean(e.password_hash),
      })),
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}