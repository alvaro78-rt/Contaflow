import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { employeeAdmin, fail, ok, scopedRecord } from '../../shared/employeeAdmin.ts';
import { buildPayroll, validatePayrollInput } from '../../shared/payrollCalculation.js';
import {
  hasUnscopedHistory,
  monthRange,
  validDate,
  validMonth,
  withEmployeeLock,
} from '../../shared/attendance.js';
import { consistentReceipt, reviewAttendance, verifiedTable } from '../../shared/payrollReview.js';

const incomplete = (problems) => Response.json({ error: 'cadastro_incompleto', problems }, { status: 422 });
const applies = (t, comp) =>
  t.active !== false && validMonth(t.start_competence) &&
  t.start_competence <= comp && (!t.end_competence || t.end_competence >= comp);

async function calculate({ entities, companyId, actor }, emp, body) {
  const { competence } = body;
  const automatic = body.automatic === true;
  const query = { company_id: companyId, employee_id: emp.id };
  const range = monthRange(competence);
  const closed = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());

  // A tela simples não envia campos financeiros inventados. A função consulta
  // cadastro, ponto, rubricas e tabela legal. A data do processamento é usada
  // somente como referência para calcular um RASCUNHO, não como prova de pagamento.
  const payment_date = automatic ? closed : body.payment_date;
  const fiscalDependentsUnconfirmed = automatic &&
    Array.isArray(emp.dependents) && emp.dependents.length > 0;
  const tax_dependents = automatic ? (fiscalDependentsUnconfirmed ? null : 0) : body.tax_dependents;
  const paid_days = automatic ? [] : body.paid_days;
  const unpaid_days = automatic ? [] : body.unpaid_days;
  const dsr_extra = automatic ? 0 : body.dsr_extra;
  const dsr_discount = automatic ? 0 : body.dsr_discount;
  if (fiscalDependentsUnconfirmed) {
    return incomplete([
      'Há dependentes cadastrados, mas não é possível presumir quantos são dependentes fiscais. Confira essa informação com o RH antes de calcular.',
    ]);
  }
  if (
    range.$lte >= closed || !validDate(payment_date) || payment_date < range.$lte ||
    !Number.isInteger(tax_dependents) ||
    tax_dependents < 0 || tax_dependents > 99 ||
    (!automatic && body.reviewed_inputs !== true)
  ) {
    return incomplete([
      automatic
        ? 'Selecione uma competência encerrada. A data do processamento será usada como referência para o rascunho.'
        : 'Informe uma competência encerrada, a data de pagamento e os dependentes fiscais. Confirme os dados do período.',
    ]);
  }
  if (
    emp.status === 'afastado' || emp.status === 'desligado' || emp.contract_type !== 'CLT' ||
    !validDate(emp.admission_date) || emp.admission_date > range.$gte
  ) {
    return incomplete([
      'O fluxo mensal exige contrato CLT ativo durante toda a competência. Confira admissão, férias, afastamentos e desligamentos.',
    ]);
  }
  const legacy = await Promise.all([
    hasUnscopedHistory(entities.TimeRecord, { employee_id: emp.id, date: range }),
    hasUnscopedHistory(entities.Vacation, { employee_id: emp.id }),
    hasUnscopedHistory(entities.Termination, { employee_id: emp.id }),
  ]);
  if (legacy.some(Boolean)) return fail(409, 'historico_sem_empresa');
  const [position, schedule, marks, rubrics, tables, vacations, terminations] = await Promise.all([
    scopedRecord(entities.Position, emp.position_id, companyId),
    scopedRecord(entities.WorkSchedule, emp.schedule_id, companyId),
    entities.TimeRecord.filter({ ...query, date: range }, { limit: 500 }),
    entities.Rubric.filter({ company_id: companyId, auto_apply: true }, { limit: 100 }),
    entities.LegalTable.filter({}, { limit: 100 }),
    entities.Vacation.filter({ ...query, start_date: { $lte: range.$lte }, end_date: { $gte: range.$gte } }, {
      limit: 1,
    }),
    entities.Termination.filter({ ...query, termination_date: { $lte: range.$lte } }, { limit: 1 }),
  ]);
  if ([marks, rubrics, tables].some((r) => !Array.isArray(r.items) || r.next_cursor)) {
    return fail(409, 'limite_consulta');
  }
  if (vacations.items.length || terminations.items.length) {
    return incomplete(['Há férias ou rescisão a conciliar nesta competência.']);
  }
  const applicable = tables.items.filter((t) => applies(t, competence));
  const table = applicable.length === 1 ? applicable[0] : null;
  const problems = validatePayrollInput({ employee: emp, schedule, table });
  if (!emp.full_name || !emp.cpf) problems.push('Confira a identificação do funcionário.');
  if (
    !position || !Number.isFinite(emp.base_salary) || !Number.isFinite(emp.weekly_hours) ||
    emp.weekly_hours <= 0
  ) {
    problems.push('Confira cargo, salário e carga horária semanal.');
  }
  if (!verifiedTable(table, competence, payment_date) || !applies(table || {}, payment_date.slice(0, 7))) {
    problems.push(
      'Confira a vigência e as faixas oficiais de INSS e IRRF de 2026. É necessária uma única tabela compatível com o pagamento.',
    );
  }
  if (
    rubrics.items.some((r) =>
      !Number.isFinite(r.fixed_value) || r.fixed_value <= 0 ||
      !['provento', 'desconto', 'informativa'].includes(r.category) || !r.name ||
      (r.category !== 'informativa' && !r.incidence_reviewed)
    )
  ) {
    problems.push('Revise a natureza e as incidências de cada rubrica automática.');
  }
  const review = reviewAttendance(
    marks.items,
    schedule,
    competence,
    paid_days,
    unpaid_days,
    table?.tolerance_minutes,
  );
  problems.push(...review.problems);
  const { stats } = review;
  // DSR e faltas sem classificação não podem ser presumidos como zero.
  // Reutilizamos os zeros somente quando o ponto comprova que não há ocorrência.
  if (automatic && stats) {
    if (stats.overtime > 0) {
      problems.push('Há horas extras sem reflexo de DSR apurado. Concilie os valores com o RH antes de processar.');
    }
    if (stats.late > 0 || stats.absences > 0) {
      problems.push('Há atrasos ou faltas que podem afetar o DSR. Confira o ponto e a apuração antes de processar.');
    }
  }
  if (
    ![dsr_extra, dsr_discount].every((v) =>
      Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < .00001
    ) ||
    (dsr_extra > 0 && !stats?.overtime) || (dsr_discount > 0 && !stats?.absences && !stats?.late)
  ) {
    problems.push(
      'Informe o reflexo de extras e a perda de DSR conferidos, inclusive zero quando inaplicáveis.',
    );
  }
  if (problems.length) return incomplete(problems);
  stats.dsrExtra = dsr_extra;
  stats.dsrDiscount = dsr_discount;
  const data = buildPayroll({
    employee: emp,
    positionName: position.name,
    competence,
    stats,
    rubrics: rubrics.items,
    table,
    paymentDate: payment_date,
    taxDependents: tax_dependents,
  });
  if (!consistentReceipt(data)) return fail(422, 'valores_inconsistentes');
  return ok({
    payroll: await entities.Payroll.create({
      ...data,
      ...query,
      input_review: {
        payment_date,
        tax_dependents,
        paid_days,
        unpaid_days,
        dsr_extra,
        dsr_discount,
        actor_id: actor.id,
        version: 1,
      },
    }),
  });
}

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');
  try {
    const body = await req.json();
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { companyId, entities, actor } = admin;
    const action = body.action;
    if (!['calculate', 'view', 'approve', 'finalize'].includes(action)) return fail(400, 'acao_invalida');
    if (actor.access_role === 'gerente' && action !== 'calculate') return fail(403, 'sem_permissao');
    if (action !== 'view' && body.expected_company_id !== companyId) return fail(409, 'empresa_alterada');
    const transition = action === 'approve' || action === 'finalize';
    const target = transition ? await scopedRecord(entities.Payroll, body.payroll_id, companyId) : null;
    if (transition && !target) return fail(404, 'folha_inexistente');
    const competence = transition ? target.competence : body.competence;
    if (!validMonth(competence)) return fail(400, 'competencia_invalida');
    const employee = await scopedRecord(
      entities.Employee,
      transition ? target.employee_id : body.employee_id,
      companyId,
    );
    if (!employee || employee.access_role === 'master') return fail(404, 'funcionario_inexistente');
    const query = { company_id: companyId, employee_id: employee.id, competence };
    const process = async () => {
      if (await hasUnscopedHistory(entities.Payroll, { employee_id: employee.id, competence })) {
        return fail(409, 'historico_sem_empresa');
      }
      const rows = await entities.Payroll.filter(query, { limit: 2 });
      if (rows.next_cursor || rows.items.length > 1) return fail(409, 'folhas_duplicadas');
      const row = rows.items[0];
      if (action === 'view') return ok({ payroll: row || null });
      if (action === 'calculate') {
        if (row) return ok({ payroll: row, existing: true, existing_final: row.status === 'finalizada' });
        return await calculate(admin, employee, body);
      }
      if (!row || row.id !== target.id || row.status !== (action === 'approve' ? 'rascunho' : 'aprovada')) {
        return fail(409, 'situacao_invalida');
      }
      if (row.input_review?.version !== 1) {
        return incomplete([
          'A folha é anterior à conferência de insumos. Preserve o histórico e faça a conciliação contábil antes de mudar a situação.',
        ]);
      }
      if (
        !consistentReceipt(row) || !row.legal_table_id ||
        (action === 'finalize' && (!row.reviewed_by || !row.reviewed_at))
      ) return fail(409, 'valores_inconsistentes');
      const now = new Date().toISOString();
      const fields = action === 'approve'
        ? {
          status: 'aprovada',
          reviewed_by: actor.full_name || actor.id,
          reviewer_id: actor.id,
          reviewed_at: now,
        }
        : { status: 'finalizada', finalized_at: now, finalizer_id: actor.id };
      const result = await entities.Payroll.updateMany({ ...query, id: row.id, status: row.status }, {
        $set: fields,
      });
      if (result.updated !== 1) return fail(409, 'situacao_invalida');
      return ok({ payroll: { ...row, ...fields } });
    };
    return action === 'view' ? await process() : await withEmployeeLock(entities, employee, process);
  } catch {
    return fail(500, 'falha_servidor');
  }
}
