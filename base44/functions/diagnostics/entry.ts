import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';
import { canReadCompany, hasPendingOwnership } from '../../shared/companyAccess.ts';
import { PAYROLL_SERVICE_RELEASE } from '../../shared/payrollRelease.ts';

// Diagnóstico SOMENTE LEITURA: informa a versão do backend que respondeu, o
// ambiente consultado e reconcilia os registros órfãos de ponto.
// Só entram dados de empresas com vínculo confirmado. Empresas com titularidade
// pendente aparecem apenas como contagem agregada, sem nome, CPF ou valor.
const LIMIT = 500;
const fail = (status, error) => Response.json({ error }, { status });
const rows = (page) => (Array.isArray(page) ? page : page?.items || []);
const unique = (values) => [...new Set(values)];

const countBy = (list, key) =>
  list.reduce((acc, row) => {
    const value = row[key] || 'sem_valor';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

const duplicateKeys = (list) => {
  const seen = new Map();
  for (const mark of list) {
    const key = `${mark.date}|${mark.kind}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()].filter(([, total]) => total > 1);
};

export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'requisicao_invalida');

  const base44 = createClientFromRequest(req);
  const loaded = await loadSession(base44, body.token);
  if (loaded.error) return fail(loaded.status, loaded.error);
  const { actor } = loaded;
  if (!['master', 'admin'].includes(actor.access_role)) return fail(403, 'sem_permissao');

  const entities = base44.asServiceRole.entities;
  const load = (name) => entities[name].filter({}, { limit: LIMIT }).then(rows);
  const [
    companies, employees, payrolls, marks, vacations, thirteenth,
    terminations, rubrics, positions, schedules, tables, authSessions,
  ] = await Promise.all([
    load('Company'), load('Employee'), load('Payroll'), load('TimeRecord'),
    load('Vacation'), load('ThirteenthSalary'), load('Termination'), load('Rubric'),
    load('Position'), load('WorkSchedule'), load('LegalTable'), load('AuthSession'),
  ]);

  const isMaster = actor.access_role === 'master';
  // Empresa mestre: só as empresas com titularidade ou gestão confirmada.
  // Demais perfis: apenas a empresa do próprio cadastro.
  const allowedIds = new Set(isMaster
    ? companies.filter((company) => canReadCompany(actor, company)).map((company) => company.id)
    : [String(actor.company_id || '')].filter(Boolean));
  const inScope = (list) => list.filter((row) => allowedIds.has(String(row.company_id || '')));

  const companiesScoped = companies.filter((company) => allowedIds.has(company.id));
  const employeesScoped = inScope(employees);
  const payrollsScoped = inScope(payrolls);
  const marksScoped = inScope(marks);

  const employeeById = new Map(employeesScoped.map((row) => [row.id, row]));
  const companyById = new Map(companiesScoped.map((row) => [row.id, row]));

  const groups = new Map();
  for (const mark of marksScoped) {
    if (employeeById.has(mark.employee_id)) continue;
    const group = groups.get(mark.employee_id) || {
      employee_id: mark.employee_id,
      company_id: mark.company_id || '',
      total: 0,
      marks: [],
    };
    group.total += 1;
    group.marks.push(mark);
    groups.set(mark.employee_id, group);
  }

  const orphans = [...groups.values()].map((group) => {
    const company = companyById.get(group.company_id);
    const dates = unique(group.marks.map((mark) => mark.date)).sort();
    const evidences = payrollsScoped
      .filter((row) => row.employee_id === group.employee_id)
      .map((row) => ({
        competence: row.competence,
        name: row.employee_name || '',
        cpf: row.employee_cpf || '',
        position: row.position_name || '',
        status: row.status || '',
      }));
    return {
      employee_id: group.employee_id,
      company: company ? { id: company.id, name: company.name, status: company.status || '' } : null,
      company_id: group.company_id,
      total: group.total,
      kinds: countBy(group.marks, 'kind'),
      days: dates.length,
      first_day: dates[0] || '',
      last_day: dates[dates.length - 1] || '',
      duplicate_keys: duplicateKeys(group.marks).length,
      evidence: evidences,
    };
  }).sort((a, b) => b.total - a.total);

  const linked = marksScoped.filter((mark) => employeeById.has(mark.employee_id)).length;
  const orphanPayrolls = payrollsScoped.filter((row) => !employeeById.has(row.employee_id));
  const allDuplicates = duplicateKeys(marksScoped);

  // Empresas sem vínculo: apenas contagem, sem identificador, dado pessoal ou
  // financeiro. Somente a conta mestre vê a quebra; os demais perfis, só o total.
  const pendingCompanies = isMaster
    ? companies.filter((company) => !allowedIds.has(company.id)).map((company) => ({
      status: company.status || 'ativa',
      ownership: hasPendingOwnership(company) ? 'sem_titular' : 'outro_titular',
      counts: {
        employees: employees.filter((row) => row.company_id === company.id).length,
        payrolls: payrolls.filter((row) => row.company_id === company.id).length,
        time_records: marks.filter((row) => row.company_id === company.id).length,
      },
    }))
    : [];

  const url = new URL(req.url);

  return Response.json({
    ok: true,
    read_only: true,
    release: PAYROLL_SERVICE_RELEASE,
    environment: {
      function: 'diagnostics',
      host: url.host,
      release_source: 'base44/shared/payrollRelease.ts',
      note: 'A versão acima é a do backend que respondeu a esta chamada, neste host.',
    },
    checked_at: new Date().toISOString(),
    session: {
      name: actor.full_name || '',
      role: actor.access_role || '',
      company_id: String(actor.company_id || ''),
      scope: isMaster ? 'empresas_com_vinculo' : 'empresa_da_sessao',
    },
    integrity: {
      companies: companiesScoped.length,
      employees: employeesScoped.length,
      payrolls: payrollsScoped.length,
      time_records: marksScoped.length,
      vacations: inScope(vacations).length,
      thirteenth: inScope(thirteenth).length,
      terminations: inScope(terminations).length,
      rubrics: inScope(rubrics).length,
      positions: inScope(positions).length,
      schedules: inScope(schedules).length,
      legal_tables: tables.length,
      auth_sessions: inScope(authSessions).length,
    },
    time_records: {
      total_scoped: marksScoped.length,
      linked_to_employee: linked,
      orphan: marksScoped.length - linked,
      duplicate_keys: allDuplicates.length,
      duplicate_samples: allDuplicates.slice(0, 5).map(([key, total]) => ({ key, total })),
      companies: unique(marksScoped.map((mark) => mark.company_id || 'sem_empresa')),
      kinds: countBy(marksScoped, 'kind'),
    },
    orphan_employees: orphans,
    orphan_employee_ids: groups.size,
    orphan_payrolls: orphanPayrolls.map((row) => ({
      competence: row.competence,
      name: row.employee_name || '',
      status: row.status || '',
      employee_id: row.employee_id,
    })),
    pending_companies: pendingCompanies,
    pending_companies_total: pendingCompanies.length,
    truncated: [companies, employees, payrolls, marks].some((list) => list.length >= LIMIT),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
