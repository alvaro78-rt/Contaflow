import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';

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

    await base44.asServiceRole.entities.AuthSession.update(session.id, { company_id: company.id });

    return Response.json({
      ok: true,
      company: { id: company.id, name: company.name || '', status: company.status || 'ativa' },
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}