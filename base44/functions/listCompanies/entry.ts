import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { onlyDigits } from '../../shared/cpf.ts';
import { loadSession } from '../../shared/sessionGuard.ts';

// Aceita a resposta paginada do SDK, mantendo compatibilidade com SDKs que
// retornam uma lista diretamente. Nenhum registro é modificado.
async function allRows(entity, query, sort) {
  const rows = [];
  let cursor;
  do {
    const page = await entity.filter(query, { sort, limit: 200, ...(cursor ? { cursor } : {}) });
    if (Array.isArray(page)) {
      rows.push(...page);
      break;
    }
    if (!page || !Array.isArray(page.items)) throw new Error('lista_invalida');
    rows.push(...page.items);
    cursor = page.next_cursor || null;
  } while (cursor);
  return rows;
}

// Lista para a conta mestre. A permissão é validada pelo token da sessão no
// servidor; nunca aceitamos um papel ou uma empresa enviados pelo navegador.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const loaded = await loadSession(base44, body?.token);
    if (loaded.error) return Response.json({ error: loaded.error }, { status: loaded.status });
    const actor = loaded.actor;
    if (actor.access_role !== 'master') {
      return Response.json({ error: 'somente_mestre' }, { status: 403 });
    }

    const { Company, Employee } = base44.asServiceRole.entities;
    // Antes, a consulta com $ne acontecia mesmo para include_inactive=true.
    // Isso impedia a listagem inteira quando um provedor rejeitava o filtro.
    const companies = await allRows(Company, {}, 'name');
    const visible = body?.include_inactive === true
      ? companies
      : companies.filter((c) => c.status !== 'inativa');

    // A verificação do dono é um indicador opcional de interface. Se a leitura
    // de funcionários estiver indisponível, ainda mostramos as empresas.
    const ownerChecks = await Promise.all(visible.map(async (c) => {
      if (!onlyDigits(c.owner_cpf)) return false;
      if (onlyDigits(c.owner_cpf) === onlyDigits(actor.cpf)) return true;
      try {
        const owners = await allRows(Employee, { company_id: c.id, access_role: 'admin' }, 'id');
        return owners.some((o) => onlyDigits(o.cpf) === onlyDigits(c.owner_cpf) &&
          Boolean(o.password_hash) && o.status !== 'desligado');
      } catch {
        return false;
      }
    }));

    return Response.json({
      ok: true,
      companies: visible.map((c, index) => ({
        id: c.id,
        name: c.name || '',
        owner_name: c.owner_name || '',
        owner_cpf: c.owner_cpf || '',
        status: c.status || 'ativa',
        owner_linked: ownerChecks[index],
      })),
    });
  } catch {
    return Response.json({ error: 'falha_servidor' }, { status: 500 });
  }
}
