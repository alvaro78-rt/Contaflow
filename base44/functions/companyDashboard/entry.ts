import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { loadSession } from '../../shared/sessionGuard.ts';

// Leitura do painel do dono. Empresa e perfil saem da sessão validada aqui, nunca do navegador.
// O corpo da requisição só traz o token: não existe parâmetro de empresa.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const loaded = await loadSession(base44, body?.token);
    if (loaded.error) return Response.json({error: loaded.error}, {status: loaded.status});
    const {actor, session} = loaded;

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
    // Indicadores independentes: uma consulta indisponível não deve derrubar todo o painel.
    // Valores desconhecidos são null, jamais zero.
    const safe = async (task) => {
      try {
        const value = await task();
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    };
    const [ativos, afastados, semAcesso] = await Promise.all([
      safe(() => Employee.count({ ...scope, $or: [{ status: 'ativo' }, { status: { $exists: false } }] })),
      safe(() => Employee.count({ ...scope, status: 'afastado' })),
      safe(() => Employee.count({ ...scope, $or: [{ password_hash: { $exists: false } }, { password_hash: '' }, { password_hash: null }] })),
    ]);

    let payroll = null;
    if (role !== 'gerente') {
      const [folhas, finalizadas, totals] = await Promise.all([
        safe(() => Payroll.count({ ...scope, competence })),
        safe(() => Payroll.count({ ...scope, competence, status: 'finalizada' })),
        (async () => {
          try {
            const result = await Payroll.aggregate({
              query: { ...scope, competence },
              sum: ['total_earnings', 'total_deductions', 'net_salary'],
            });
            const row = result?.rows?.[0];
            if (!row) return null;
            return {
              proventos: row.sum_total_earnings != null && Number.isFinite(Number(row.sum_total_earnings)) ? Number(row.sum_total_earnings) : null,
              descontos: row.sum_total_deductions != null && Number.isFinite(Number(row.sum_total_deductions)) ? Number(row.sum_total_deductions) : null,
              liquido: row.sum_net_salary != null && Number.isFinite(Number(row.sum_net_salary)) ? Number(row.sum_net_salary) : null,
            };
          } catch { return null; }
        })(),
      ]);
      payroll = {
        folhas,
        finalizadas,
        proventos: totals?.proventos ?? null,
        descontos: totals?.descontos ?? null,
        liquido: totals?.liquido ?? null,
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