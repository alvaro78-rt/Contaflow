import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Leitura do painel do dono. Empresa e perfil saem da sessão validada aqui, nunca do navegador.
// O corpo da requisição só traz o token: não existe parâmetro de empresa.
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

    // Funcionário e vínculo vêm do banco: o perfil salvo decide o que pode ser lido.
    const actor = await base44.asServiceRole.entities.Employee
      .get(session.employee_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!actor) return Response.json({ error: 'sessao_invalida' }, { status: 401 });
    if (actor.status === 'desligado') {
      return Response.json({ error: 'acesso_encerrado' }, { status: 403 });
    }

    // Perfil autorizado a ver os totais financeiros: dono da empresa (admin) ou a conta
    // mestre que entrou nesta empresa. O gerente pode ler os indicadores de pessoal.
    const role = actor.access_role || 'funcionario';
    if (!['admin', 'master', 'gerente'].includes(role)) {
      return Response.json({ error: 'sem_permissao', role }, { status: 403 });
    }

    // A empresa vem da sessão (mestre) ou do vínculo do funcionário — nunca do navegador.
    const companyId = role === 'master' ? String(session.company_id || '') : String(actor.company_id || '');
    if (!companyId) return Response.json({ error: 'sem_empresa' }, { status: 403 });

    const company = await base44.asServiceRole.entities.Company
      .get(companyId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!company) return Response.json({ error: 'empresa_nao_encontrada' }, { status: 404 });

    if (company.status === 'inativa') return Response.json({ error: 'acesso_encerrado' }, { status: 403 });
    const d = new Date();
    const competence = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const scope = { company_id: company.id };

    const { Employee, Payroll } = base44.asServiceRole.entities;
    const [ativos, afastados, semAcesso] = await Promise.all([
      Employee.count({ ...scope, $or: [{ status: 'ativo' }, { status: { $exists: false } }] }),
      Employee.count({ ...scope, status: 'afastado' }),
      Employee.count({ ...scope, $or: [{ password_hash: { $exists: false } }, { password_hash: '' }, { password_hash: null }] }),
    ]);

    let payroll = null;
    if (role !== 'gerente') {
      const [folhas, finalizadas, agg] = await Promise.all([
        Payroll.count({ ...scope, competence }),
        Payroll.count({ ...scope, competence, status: 'finalizada' }),
        Payroll.aggregate({
          query: { ...scope, competence },
          sum: ['total_earnings', 'total_deductions', 'net_salary'],
        }),
      ]);
      const row = agg?.rows?.[0] || {};
      payroll = {
        folhas,
        finalizadas,
        proventos: row.sum_total_earnings || 0,
        descontos: row.sum_total_deductions || 0,
        liquido: row.sum_net_salary || 0,
      };
    }

    return Response.json({
      ok: true,
      company: { id: company.id, name: company.name || '', status: company.status || 'ativa' },
      profile: { name: actor.full_name || '', role: actor.access_role || 'funcionario' },
      counts: { ativos, afastados, sem_acesso: semAcesso },
      competence,
      payroll,
      read_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}