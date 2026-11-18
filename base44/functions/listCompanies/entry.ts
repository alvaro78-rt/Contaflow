import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Leitura da lista de empresas para a tela do mestre.
// As regras de Company continuam fechadas: quem lê é o servidor, com a sessão validada aqui.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    if (!token) return Response.json({ error: 'sessao_invalida' }, { status: 401 });

    const { items: sessions } = await base44.asServiceRole.entities.AuthSession.filter(
      { token },
      { limit: 1 },
    );
    const session = sessions[0];
    if (!session || !session.employee_id) {
      return Response.json({ error: 'sessao_invalida' }, { status: 401 });
    }
    if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return Response.json({ error: 'sessao_expirada' }, { status: 401 });
    }

    // Papel lido do banco, nunca do navegador.
    const actor = await base44.asServiceRole.entities.Employee
      .get(session.employee_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!actor || actor.access_role !== 'master') {
      return Response.json({ error: 'somente_mestre' }, { status: 403 });
    }

    const { items } = await base44.asServiceRole.entities.Company.filter({}, { sort: 'name', limit: 200 });

    // Confirma, por leitura, se a empresa tem dono ativo com acesso criado.
    const { items: owners } = items.length
      ? await base44.asServiceRole.entities.Employee.filter(
        { company_id: { $in: items.map((c) => c.id) }, access_role: 'admin' },
        { limit: 500 },
      )
      : { items: [] };

    return Response.json({
      ok: true,
      companies: items.map((c) => ({
        id: c.id,
        name: c.name || '',
        owner_name: c.owner_name || '',
        owner_cpf: c.owner_cpf || '',
        status: c.status || 'ativa',
        owner_linked: owners.some(
          (o) => o.company_id === c.id && o.cpf === c.owner_cpf && Boolean(o.password_hash) && o.status !== 'desligado',
        ),
      })),
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}