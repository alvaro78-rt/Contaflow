import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';
import { onlyDigits } from '../../shared/cpf.ts';

const fail = (status, error) => Response.json({ error }, { status });

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'requisicao_invalida');
    const client = createClientFromRequest(req);
    const loaded = await loadSession(client, body?.token);
    if (loaded.error) return fail(loaded.status, loaded.error);
    const master = loaded.actor;
    if (master.access_role !== 'master') return fail(403, 'somente_mestre');
    const { Company, AuthSession } = client.asServiceRole.entities;
    if (body.action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      const cpf = onlyDigits(master.cpf);
      if (name.length < 2 || name.length > 150) return fail(400, 'nome_invalido');
      if (!cpf || !master.full_name) return fail(409, 'mestre_incompleto');
      const existing = await Company.filter({ name, owner_cpf: cpf, status: { $ne: 'inativa' } }, 'id', 1);
      if (existing.length) return Response.json({ ok: true, id: existing[0].id, resumed: true });
      const result = await Company.upsert([{ name, owner_cpf: cpf, owner_name: master.full_name, status: 'ativa' }],
        { key: ['name', 'owner_cpf', 'status'] });
      const company = result.records[0];
      return Response.json({ ok: true, id: company.id, resumed: result.created === 0 });
    }
    if (!['delete', 'restore'].includes(body.action)) return fail(400, 'acao_invalida');
    if (typeof body.id !== 'string' || !body.id.trim()) return fail(400, 'empresa_invalida');
    const company = await Company.get(body.id).catch(e => e.status === 404 ? null : Promise.reject(e));
    if (!company) return fail(404, 'empresa_inexistente');
    if (body.action === 'restore') {
      if (company.status === 'inativa') await Company.update(company.id, { status: 'ativa' });
      const restored = await Company.get(company.id);
      if (restored.status !== 'ativa') return fail(409, 'reativacao_nao_confirmada');
      return Response.json({ ok: true, id: company.id, status: 'ativa' });
    }
    if (company.status !== 'inativa') await Company.update(company.id, { status: 'inativa' });
    // A conta mestre continua válida para escolher outra empresa.
    await AuthSession.updateMany({ role: 'master', company_id: company.id }, { $set: { company_id: '' } });
    return Response.json({ ok: true, id: company.id });
  } catch {
    return fail(503, 'falha_servidor');
  }
}
