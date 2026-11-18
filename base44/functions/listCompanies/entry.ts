import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { onlyDigits } from '../../shared/cpf.ts';
import { loadSession } from '../../shared/sessionGuard.ts';

async function allRows(entity, query, sort) {
  const rows = [];
  let cursor;
  do {
    const page = await entity.filter(query, { sort, limit: 200, cursor });
    rows.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return rows;
}

// Leitura da lista de empresas para a tela do mestre.
// As regras de Company continuam fechadas: quem lê é o servidor, com a sessão validada aqui.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const loaded = await loadSession(base44, body?.token);
    if (loaded.error) return Response.json({ error: loaded.error }, { status: loaded.status });
    const actor = loaded.actor;
    if (actor.access_role !== 'master') return Response.json({ error: 'somente_mestre' }, { status: 403 });
    const { Company, Employee } = base44.asServiceRole.entities;
    const items = await allRows(Company, { status: { $ne: 'inativa' } }, 'name');
    const ids = items.map(c => c.id);
    const owners = ids.length ? await allRows(Employee, { company_id: { $in: ids }, access_role: 'admin' }, 'id') : [];
    return Response.json({
      ok: true,
      companies: items.map((c) => ({
        id: c.id,
        name: c.name || '',
        owner_name: c.owner_name || '',
        owner_cpf: c.owner_cpf || '',
        status: c.status || 'ativa',
        owner_linked: Boolean(onlyDigits(c.owner_cpf)) && (onlyDigits(c.owner_cpf) === onlyDigits(actor.cpf) || owners.some(
          (o) => o.company_id === c.id && onlyDigits(o.cpf) === onlyDigits(c.owner_cpf) && Boolean(o.password_hash) && o.status !== 'desligado',
        )),
      })),
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}