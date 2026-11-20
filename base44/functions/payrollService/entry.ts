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
const localToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());

// Never treat an unclassified dependent as a tax dependent.
function savedTaxDependents(employee) {
  if (Number.isInteger(employee.tax_dependents) &&
      employee.tax_dependents >= 0 && employee.tax_dependents <= 99) return employee.tax_dependents;
  if (!Array.isArray(employee.dependents)) return null;
  if (employee.dependents.length === 0) return 0;
  if (!employee.dependents.every((dep) => typeof dep?.tax_dependent === 'boolean')) return null;
  return employee.dependents.filter((dep) => dep.tax_dependent).length;
}

// Apenas feriados nacionais confirmados para 2026 (Portaria MGI 11.460/2025).
// Pontos facultativos e feriados estaduais/municipais não são presumidos.
// https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026
const NATIONAL_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01', '2026-09-07',
  '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
]);

function paidNationalHolidays(competence, schedule, records, admissionDate = '') {
  if (!Array.isArray(schedule?.work_days) || !Array.isArray(records)) return [];
  const marked = new Set(records.map((r) => r.date));
  return [...NATIONAL_HOLIDAYS_2026].filter((date) =>
    date.startsWith(competence + '-') && (!admissionDate || date >= admissionDate) &&
    schedule.work_days.includes(new Date(date).getUTCDay()) &&
    !marked.has(date));
}

function automaticReview(employee, body) {
  if (body.automatic !== true) return { ...body, provisional: false };
  return {
    ...body,
    payment_date: localToday(), // reference for an estimated calculation, not proof of actual payment
    tax_dependents: savedTaxDependents(employee),
    paid_days: [],
    unpaid_days: [],
    dsr_extra: 0,
    dsr_discount: 0,
    reviewed_inputs: true, // permits a preliminary draft only
    provisional: true,
  };
}
const applies = (t, comp) =>
  t.active !== false && validMonth(t.start_competence) &&
  t.start_competence <= comp && (!t.end_competence || t.end_competence >= comp);

async function calculate({ entities, companyId, actor }, emp, body) {
  const inputs = automaticReview(emp, body);
  const { competence, payment_date, tax_dependents, paid_days, unpaid_days, dsr_extra, dsr_discount } = inputs;
  const query = { company_id: companyId, employee_id: emp.id };
  const range = monthRange(competence);
  if (validDate(emp.admission_date) && emp.admission_date > range.$lte) {
    return fail(422, 'competencia_anterior_admissao');
  }
  const closed = localToday();
  if (
    range.$lte >= closed || !validDate(payment_date) || payment_date < range.$lte ||
    !Number.isInteger(tax_dependents) ||
    tax_dependents < 0 || tax_dependents > 99 || inputs.reviewed_inputs !== true
  ) {
    return incomplete(inputs.provisional && tax_dependents === null
      ? ['O cadastro não informa quais dependentes são fiscais. Atualize essa informação no cadastro para permitir o cálculo automático.']
      : ['Confira a competência encerrada e os dados de pagamento, dependentes e conferência do período.']);
  }
  if (
    emp.status === 'afastado' || emp.status === 'desligado' || emp.contract_type !== 'CLT' ||
    !validDate(emp.admission_date)
  ) {
    return incomplete([
      'Confira o contrato CLT, a situação e a data de admissão do funcionário.',
    ]);
  }
  const admittedThisMonth = emp.admission_date > range.$gte;
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
  // Sem qualquer marcação, o ponto não permite identificar faltas, horas extras ou atrasos.
  // Mostre somente uma prévia NÃO SALVA, nunca uma folha de pagamento aprovada/finalizável.
  if (inputs.provisional && marks.items.length === 0) {
    if (problems.length) return incomplete(problems);
    const estimate = buildPayroll({
      employee: emp,
      positionName: position.name,
      competence,
      stats: { worked: 0, late: 0, overtime: 0, absences: 0, dsrExtra: 0, dsrDiscount: 0 },
      rubrics: rubrics.items,
      table,
      paymentDate: payment_date,
      taxDependents: tax_dependents,
      admissionDate: emp.admission_date,
    });
    if (!consistentReceipt(estimate)) return fail(422, 'valores_inconsistentes');
    return ok({
      preview_only: true,
      payroll: {
        ...estimate,
        id: null,
        preview_only: true,
        attendance_pending: true,
        status: 'rascunho',
      },
    });
  }

  const calendarPaidDays = inputs.provisional
    ? paidNationalHolidays(competence, schedule, marks.items, emp.admission_date)
    : paid_days;
  const review = reviewAttendance(
    marks.items,
    schedule,
    competence,
    calendarPaidDays,
    unpaid_days,
    table?.tolerance_minutes,
    emp.admission_date,
  );
  problems.push(...review.problems);
  if (inputs.provisional) {
    const holidayWork = [...new Set(marks.items
      .filter((r) => NATIONAL_HOLIDAYS_2026.has(r.date)).map((r) => r.date))];
    if (holidayWork.length) problems.push(
      'Há marcações em feriado nacional (' + holidayWork.join(', ') +
      '). A remuneração especial desse trabalho exige conferência.',
    );
  }
  const { stats } = review;
  if (inputs.provisional && stats?.overtime > 0) {
    problems.push('Há horas extras registradas. O reflexo no DSR não está cadastrado e não pode ser presumido.');
  }
  if (inputs.provisional && (stats?.absences > 0 || stats?.late > 0)) {
    problems.push('Há faltas ou atrasos que exigem apuração de DSR antes de gerar a folha.');
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
    admissionDate: emp.admission_date,
  });
  if (!consistentReceipt(data)) return fail(422, 'valores_inconsistentes');
  return ok({
    payroll: await entities.Payroll.create({
      ...data,
      ...query,
      input_review: {
        payment_date: inputs.provisional ? '' : payment_date,
        calculation_reference_date: inputs.provisional ? payment_date : null,
        payment_date_confirmed: !inputs.provisional,
        tax_dependents,
        paid_days: calendarPaidDays,
        unpaid_days,
        dsr_extra,
        dsr_discount,
        actor_id: actor.id,
        source: inputs.provisional ? 'automatic' : 'manual',
        admission_partial: admittedThisMonth,
        version: inputs.provisional ? 2 : 1,
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
      if (row.earnings?.some((item) => item.description?.includes('estimativa'))) {
        return incomplete([
          'A folha possui salário proporcional estimado após admissão durante o mês. ' +
          'É necessária conferência da regra contratual antes de aprovar.',
        ]);
      }
      if (row.input_review?.version === 2 && row.input_review?.payment_date_confirmed !== true) {
        return incomplete([
          'Rascunho automático calculado. A data efetiva de pagamento precisa ser confirmada antes da aprovação para validar o IRRF.',
        ]);
      }
      if (row.input_review?.version !== 1 && row.input_review?.version !== 2) {
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
