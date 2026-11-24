import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';
import { canReadCompany } from '../../shared/companyAccess.ts';

// Abre a empresa escolhida pela conta mestre. A empresa em uso fica na sessão do servidor,
// nunca em um identificador enviado como autorização nas outras chamadas.
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

    if (actor.access_role !== 'master') {
      return Response.json({ error: 'somente_mestre' }, { status: 403 });
    }

    const companyId = String(body?.company_id || '').trim();

    // Sem empresa informada: volta para a escolha de empresas.
    if (!companyId) {
      await base44.asServiceRole.entities.AuthSession.update(session.id, { company_id: '' });
      return Response.json({ ok: true, company: null });
    }

    const company = await base44.asServiceRole.entities.Company
      .get(companyId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!company) return Response.json({ error: 'empresa_inexistente' }, { status: 404 });

    // Sem vínculo com a empresa, a resposta é a mesma de uma empresa qualquer:
    // não confirmamos sequer a existência de empresa de outro proprietário.
    if (!canReadCompany(actor, company)) {
      return Response.json({ error: 'empresa_nao_autorizada' }, { status: 403 });
    }

    if (company.status === 'inativa') return Response.json({ error: 'empresa_inativa' }, { status: 403 });
    if (company.owner_cpf && !company.owner_name) {
      const pending = await base44.asServiceRole.entities.Employee.filter({
        company_id: 'criando:' + company.name, cpf: company.owner_cpf, access_role: 'admin',
      }, 'id', 1);
      if (pending.length) return Response.json({ error: 'empresa_pendente' }, { status: 409 });
    }
    await base44.asServiceRole.entities.AuthSession.update(session.id, { company_id: company.id });

    return Response.json({
      ok: true,
      company: { id: company.id, name: company.name || '', status: company.status || 'ativa' },
    });
  } catch {
    return Response.json({ error: 'falha_servidor' }, { status: 500 });
  }
}
