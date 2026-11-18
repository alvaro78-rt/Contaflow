import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { employeeAdmin, fail, ok, scopedRecord } from '../../shared/employeeAdmin.ts';
import { buildPayroll, monthStats, paramsFromTable, validatePayrollInput } from '../../shared/payrollCalculation.js';

const validCompetence = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v || '');
const inForce = (table, comp) => table && table.active !== false &&
  (!table.start_competence || table.start_competence <= comp) &&
  (!table.end_competence || table.end_competence >= comp);

// All financial operations take their actor and company from the validated server session.
export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');
  try {
    const body = await req.json().catch(() => null);
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { companyId, entities, actor } = admin;
    const action = body?.action || 'calculate';
    const allowed = ['calculate', 'approve', 'finalize', 'view'];
    if (!allowed.includes(action)) return fail(400, 'acao_invalida');
    if (actor.access_role === 'gerente' && action !== 'calculate') return fail(403, 'sem_permissao');

    if (action === 'view') {
      const employee = await scopedRecord(entities.Employee, body?.employee_id, companyId);
      if (!employee) return fail(404, 'funcionario_inexistente');
      if (!validCompetence(body?.competence)) return fail(400, 'competencia_invalida');
      const result = await entities.Payroll.filter({
        company_id: companyId, employee_id: employee.id, competence: body.competence,
      }, { limit: 2 });
      if (result.items.length > 1) return fail(409, 'folhas_duplicadas');
      return ok({ payroll: result.items[0] || null });
    }

    if (action === 'approve' || action === 'finalize') {
      const record = await scopedRecord(entities.Payroll, body?.payroll_id, companyId);
      if (!record) return fail(404, 'folha_inexistente');
      if (!Number.isFinite(record.total_earnings) || !Number.isFinite(record.total_deductions) ||
          !Number.isFinite(record.net_salary) ||
          Math.abs(record.net_salary - (record.total_earnings - record.total_deductions)) > 0.005) {
        return fail(409, 'valores_inconsistentes');
      }
      if (action === 'approve') {
        if (record.status !== 'rascunho') return fail(409, 'situacao_invalida');
        const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim() : '';
        if (!reviewer || reviewer.length > 150) return fail(400, 'conferente_invalido');
        const updated = await entities.Payroll.update(record.id, {
          status: 'aprovada', reviewed_by: reviewer, reviewed_at: new Date().toISOString(),
        });
        return ok({ payroll: updated });
      }
      if (record.status !== 'aprovada' || !record.reviewed_by) return fail(409, 'situacao_invalida');
      const updated = await entities.Payroll.update(record.id, {
        status: 'finalizada', finalized_at: new Date().toISOString(),
      });
      return ok({ payroll: updated });
    }

    const competence = body?.competence;
    if (!validCompetence(competence)) return fail(400, 'competencia_invalida');
    const emp = await scopedRecord(entities.Employee, body?.employee_id, companyId);
    if (!emp || emp.access_role === 'master') return fail(404, 'funcionario_inexistente');
    if (emp.status === 'desligado') return fail(409, 'funcionario_desligado');
    if (emp.admission_date && competence < emp.admission_date.slice(0, 7))
      return fail(409, 'competencia_anterior_admissao');

    // Never overwrite an approved or finalized payroll. One draft per employee/competence.
    const existing = await entities.Payroll.filter({ company_id: companyId, employee_id: emp.id, competence }, { limit: 2 });
    if (existing.items.length > 1) return fail(409, 'folhas_duplicadas');
    const old = existing.items[0];
    if (old?.status === 'finalizada') return ok({ payroll: old, existing_final: true });
    if (old?.status === 'aprovada') return fail(409, 'folha_aprovada');

    const [position, schedule, records, rubrics, legal] = await Promise.all([
      emp.position_id ? scopedRecord(entities.Position, emp.position_id, companyId) : Promise.resolve(null),
      emp.schedule_id ? scopedRecord(entities.WorkSchedule, emp.schedule_id, companyId) : Promise.resolve(null),
      entities.TimeRecord.filter({ company_id: companyId, employee_id: emp.id, date: { $gte: `${competence}-01`, $lte: `${competence}-31` } }, { limit: 501 }),
      entities.Rubric.filter({ company_id: companyId, auto_apply: true }, { limit: 101 }),
      entities.LegalTable.filter({}, { sort: '-start_competence', limit: 100 }),
    ]);
    if (!records?.items || !rubrics?.items || !legal?.items) return fail(503, 'consulta_incompleta');
    if (records.items.length > 500 || records.next_cursor || rubrics.items.length > 100 || rubrics.next_cursor ||
        legal.next_cursor) return fail(409, 'limite_consulta');

    // An empty attendance period must be reviewed before the app assumes absences.
    if (!records.items.length) return fail(422, 'ponto_nao_conferido');

    const table = legal.items.find(t => inForce(t, competence)) || null;
    const problems = validatePayrollInput({ employee: emp, schedule, table });
    if (!position) problems.push('Cargo não encontrado na empresa. Confira o cadastro do funcionário.');
    if (problems.length) return Response.json({ error: 'cadastro_incompleto', problems }, { status: 422 });
    if (!Array.isArray(table.inss_bands) || !table.inss_bands.length ||
        !Array.isArray(table.irrf_bands) || !table.irrf_bands.length) {
      return fail(422, 'tabela_legal_incompleta');
    }
    const stats = monthStats(records.items, schedule, competence, paramsFromTable(table), emp.admission_date || '');
    const data = buildPayroll({ employee: emp, positionName: position.name, competence,
      stats, rubrics: rubrics.items, table });
    if (![data.total_earnings, data.total_deductions, data.net_salary].every(Number.isFinite) ||
        Math.abs(data.net_salary - (data.total_earnings - data.total_deductions)) > 0.005) {
      return fail(422, 'valores_inconsistentes');
    }
    const saved = old
      ? await entities.Payroll.update(old.id, { ...data, company_id: companyId })
      : await entities.Payroll.create({ ...data, company_id: companyId });
    if (!saved?.id) return fail(503, 'salvamento_nao_confirmado');
    return ok({ payroll: saved, existing_final: false });
  } catch (err) {
    return fail(500, 'falha_servidor');
  }
}
