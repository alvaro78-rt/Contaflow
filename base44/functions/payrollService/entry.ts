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
import { auditMonth } from '../../shared/attendanceAudit.js';
import { validateConference } from '../../shared/conferenceAttendance.js';
import { consistentReceipt, reviewAttendance } from '../../shared/payrollReview.js';
import { legalTableCheck as sharedLegalTableCheck } from '../../shared/legalTableSelection.js';
import { PAYROLL_SERVICE_RELEASE } from '../../shared/payrollRelease.ts';

// Bloqueio por funcionário: expira em LOCK_TTL_MS e a liberação fica registrada
// em LockRelease. Dois cálculos simultâneos do mesmo funcionário nunca acontecem.

const incomplete = (problems, extra) =>
  Response.json({ error: 'cadastro_incompleto', problems, ...(extra || {}) }, { status: 422 });
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

function automaticReview(employee, body) {
  if (body.automatic !== true) return { ...body, provisional: false };
  const closing = body.action === 'calculateAndFinalize';
  return {
    ...body,
    payment_date: closing ? body.payment_date : localToday(), // data informada pelo responsável no fechamento
    tax_dependents: savedTaxDependents(employee),
    paid_days: [],
    unpaid_days: [],
    dsr_extra: 0,
    dsr_discount: 0,
    reviewed_inputs: true, // dados apurados pelo servidor; fechamento exige as validações abaixo
    provisional: true,
  };
}
async function calculate({ entities, companyId, actor }, emp, body, setStage, draft = null) {
  const closing = body.action === 'calculateAndFinalize';
  if (closing && (body.automatic !== true || !['master', 'admin'].includes(actor.access_role))) return fail(403, 'sem_permissao');
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
  if (closing && admittedThisMonth) return fail(422, 'admissao_no_mes');
  setStage('historico_legado');
  const legacy = await Promise.all([
    hasUnscopedHistory(entities.TimeRecord, { employee_id: emp.id, date: range }),
    hasUnscopedHistory(entities.Vacation, { employee_id: emp.id }),
    hasUnscopedHistory(entities.Termination, { employee_id: emp.id }),
  ]);
  if (legacy.some(Boolean)) return fail(409, 'historico_sem_empresa');
  setStage('consultas_competencia');
  const [position, schedule, marks, rubrics, tables, vacations, terminations, conferences] = await Promise.all([
    scopedRecord(entities.Position, emp.position_id, companyId),
    scopedRecord(entities.WorkSchedule, emp.schedule_id, companyId),
    entities.TimeRecord.filter({ ...query, date: range }, { limit: 500 }),
    entities.Rubric.filter({ company_id: companyId, auto_apply: true }, { limit: 100 }),
    entities.LegalTable.filter({}, { limit: 100 }),
    entities.Vacation.filter({ ...query, start_date: { $lte: range.$lte }, end_date: { $gte: range.$gte } }, {
      limit: 1,
    }),
    entities.Termination.filter({ ...query, termination_date: { $lte: range.$lte } }, { limit: 1 }),
    // Frequência comprovada: conferência mensal autorizada pelo RH.
    entities.AttendanceConference.filter(
      { ...query, competence, status: 'autorizada' },
      { limit: 2 },
    ),
  ]);
  if ([marks, rubrics, tables].some((r) => !Array.isArray(r.items) || r.next_cursor)) {
    return fail(409, 'limite_consulta');
  }
  if (conferences.next_cursor || conferences.items.length > 1) {
    return fail(409, 'conferencia_duplicada');
  }
  const conference = conferences.items[0] || null;
  if (vacations.items.length || terminations.items.length) {
    return incomplete(['Há férias ou rescisão a conciliar nesta competência.']);
  }
  const check = sharedLegalTableCheck(tables.items, competence, payment_date);
  const table = check.table;
  const problems = validatePayrollInput({ employee: emp, schedule, table });
  problems.push(...check.problems);
  if (!emp.full_name || !emp.cpf) problems.push('Confira a identificação do funcionário.');
  if (
    !position || !Number.isFinite(emp.base_salary) || !Number.isFinite(emp.weekly_hours) ||
    emp.weekly_hours <= 0
  ) {
    problems.push('Confira cargo, salário e carga horária semanal.');
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
  // Apuração automática do mês: compara as marcações com a jornada cadastrada.
  // Faltas presumidas (dia de jornada encerrado sem marcação) só geram desconto
  // depois da conferência autorizada; marcações incompletas são pendência de ponto.
  const audit = auditMonth({
    marks: marks.items,
    schedule,
    competence,
    vacations: vacations.items,
    admissionDate: emp.admission_date,
    employeeStatus: emp.status,
    statusDate: emp.status_date,
    tolerance: table?.tolerance_minutes,
  });

  if (!conference && marks.items.length === 0 && !draft) {
    if (problems.length) return incomplete(problems, check.codes.length ? { table_codes: check.codes } : null);
    return Response.json({
      error: 'ponto_sem_registros',
      problems: [
        'Não há marcações nesta competência. Confira cada dia sem marcação e autorize a frequência antes de gerar a folha oficial.',
      ],
      conference_required: true,
    }, { status: 422 });
  }

  let calendarPaidDays = paid_days;
  let effectiveUnpaid = unpaid_days;
  let dsrDiscount = dsr_discount;
  let dsrLostDays = 0;
  let stats;
  setStage('conferencia_ponto');
  if (conference) {
    const audited = validateConference(conference, {
      employee: emp,
      schedule,
      competence,
      marks: marks.items,
      vacations: vacations.items,
      tolerance: table?.tolerance_minutes,
    });
    if (audited.problems.length) {
      return Response.json({ error: 'conferencia_incompleta', problems: audited.problems }, { status: 422 });
    }
    stats = audited.stats;
    calendarPaidDays = audited.paid_days;
    effectiveUnpaid = audited.unpaid_days;
    dsrLostDays = audited.dsr_lost_days;
    // DSR automático: cada semana com falta injustificada perde um dia de descanso.
    const divisor = Number(table?.absence_divisor) || 30;
    dsrDiscount = Math.round((Number(emp.base_salary) || 0) / divisor * dsrLostDays * 100) / 100;
  } else if (inputs.provisional) {
    problems.push(...audit.problems);
    const pending = audit.days.filter((day) => day.kind === 'pendencia').map((day) => day.date);
    if (pending.length) {
      return Response.json({
        error: 'ponto_pendente',
        problems: pending.map((date) => 'Marcação incompleta em ' + date + ': corrija na Correção de Ponto antes de gerar a folha.'),
        pending_dates: pending,
      }, { status: 422 });
    }
    const presumed = audit.days.filter((day) => day.kind === 'falta_presumida').map((day) => day.date);
    if (presumed.length) {
      return Response.json({
        error: 'conferencia_necessaria',
        problems: [
          'A apuração encontrou ' + presumed.length + ' dia(s) sem marcação (' +
          presumed.join(', ') + '). Confira a frequência, justifique o que estiver comprovado e autorize a conferência antes de aplicar descontos.',
        ],
        presumed_dates: presumed,
      }, { status: 422 });
    }
    stats = audit.stats;
    calendarPaidDays = audit.paid_days;
    if (stats?.overtime > 0) {
      problems.push('Há horas extras registradas. O reflexo no DSR não está cadastrado e não pode ser presumido.');
    }
    if (stats?.late > 0) {
      problems.push('Há atrasos que exigem apuração de DSR antes de gerar a folha.');
    }
  } else {
    // Fluxo manual de conferência (histórico): datas e DSR informados pelo RH.
    const review = reviewAttendance(
      marks.items,
      schedule,
      competence,
      calendarPaidDays,
      effectiveUnpaid,
      table?.tolerance_minutes,
      emp.admission_date,
    );
    problems.push(...review.problems);
    stats = review.stats;
  }
  if (
    ![dsr_extra, dsrDiscount].every((v) =>
      Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < .00001
    ) ||
    (dsr_extra > 0 && !stats?.overtime) || (dsrDiscount > 0 && !stats?.absences && !stats?.late)
  ) {
    problems.push(
      'Informe o reflexo de extras e a perda de DSR conferidos, inclusive zero quando inaplicáveis.',
    );
  }
  // A rotina automática não conhece reflexos de extras/atrasos não conferidos.
  if (closing && (stats?.overtime > 0 || stats?.late > 0)) problems.push('Há horas extras ou atrasos que exigem conferência dos reflexos no DSR antes do fechamento.');
  if (problems.length) return incomplete(problems, check.codes.length ? { table_codes: check.codes } : null);
  stats.dsrExtra = dsr_extra;
  stats.dsrDiscount = dsrDiscount;
  setStage('motor_calculo');
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
  if (closing && (!data.legal_table_id || data.earnings?.some(item => item.description?.includes('estimativa')))) return fail(422, 'valores_inconsistentes');
  const now = new Date().toISOString();
  setStage('gravacao_folha');
  const fields = {
    ...data,
    ...(closing ? { status: 'finalizada', reviewed_by: actor.full_name || actor.id, reviewer_id: actor.id, reviewed_at: now, finalized_at: now, finalizer_id: actor.id } : {}),
    input_review: {
      payment_date: inputs.provisional && !closing ? '' : payment_date,
      calculation_reference_date: inputs.provisional ? payment_date : null,
      payment_date_confirmed: closing || !inputs.provisional,
      tax_dependents,
      paid_days: calendarPaidDays,
      unpaid_days: effectiveUnpaid,
      dsr_extra,
      dsr_discount: dsrDiscount,
      dsr_lost_days: dsrLostDays,
      actor_id: actor.id,
      source: inputs.provisional ? 'automatic' : 'manual',
      attendance_source: conference ? 'conferencia' : 'ponto',
      conference_id: conference?.id || '',
      conference_authorized_by: conference?.authorized_by_name || '',
      conference_authorized_at: conference?.authorized_at || '',
      conference_basis: conference?.basis || '',
      admission_partial: admittedThisMonth,
      version: inputs.provisional ? 2 : 1,
    },
  };
  if (draft) {
    const result = await entities.Payroll.updateMany({
      ...query, id: draft.id, competence, status: 'rascunho',
    }, { $set: fields });
    if (result.updated !== 1) return fail(409, 'situacao_invalida');
    return ok({ payroll: { ...draft, ...fields } });
  }
  return ok({ payroll: await entities.Payroll.create({ ...fields, ...query }) });
}

export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store', 'X-ContaFlow-Payroll-Release': PAYROLL_SERVICE_RELEASE },
    });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'requisicao_invalida');
  let stage = 'autorizacao';
  const setStage = (next) => { stage = next; };
  try {
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { companyId, entities, actor } = admin;
    const action = body.action;
    // Diagnóstico autenticado, somente leitura: não acessa ponto nem gera folha.
    if (action === 'release') return ok({ service: 'payrollService', release: PAYROLL_SERVICE_RELEASE, attendance_preview: true, close_validated: true });
    if (!['calculate', 'calculateAndFinalize', 'view', 'confirmPaymentDate', 'approve', 'finalize'].includes(action)) return fail(400, 'acao_invalida');
    // O cliente informa a versão que espera; se o servidor estiver em outra, nada é
    // calculado nem gravado. Protege contra cliente e serviço em versões diferentes.
    if (body.expected_release && body.expected_release !== PAYROLL_SERVICE_RELEASE) {
      return fail(409, 'versao_desatualizada');
    }
    if (actor.access_role === 'gerente' && action !== 'calculate') return fail(403, 'sem_permissao');
    if (action === 'calculateAndFinalize' && (!['master', 'admin'].includes(actor.access_role) || body.automatic !== true || !validDate(body.payment_date) || body.expected_release !== PAYROLL_SERVICE_RELEASE)) return fail(422, 'fechamento_nao_confirmado');
    if (action !== 'view' && body.expected_company_id !== companyId) return fail(409, 'empresa_alterada');
    const existingOperation = ['confirmPaymentDate', 'approve', 'finalize'].includes(action);
    setStage('consulta_folha');
    const target = existingOperation ? await scopedRecord(entities.Payroll, body.payroll_id, companyId) : null;
    if (existingOperation && !target) return fail(404, 'folha_inexistente');
    const competence = existingOperation ? target.competence : body.competence;
    if (!validMonth(competence)) return fail(400, 'competencia_invalida');
    setStage('funcionario');
    const employee = await scopedRecord(
      entities.Employee,
      existingOperation ? target.employee_id : body.employee_id,
      companyId,
    );
    if (!employee || employee.access_role === 'master') return fail(404, 'funcionario_inexistente');
    const query = { company_id: companyId, employee_id: employee.id, competence };
    const process = async () => {
      setStage('historico_folha');
      if (await hasUnscopedHistory(entities.Payroll, { employee_id: employee.id, competence })) {
        return fail(409, 'historico_sem_empresa');
      }
      setStage('consulta_folha');
      const rows = await entities.Payroll.filter(query, { limit: 2 });
      if (rows.next_cursor || rows.items.length > 1) return fail(409, 'folhas_duplicadas');
      const row = rows.items[0];
      if (action === 'view') return ok({ payroll: row || null });
      if (action === 'calculate' || action === 'calculateAndFinalize') {
        if (row) return ok({ payroll: row, existing: true, existing_final: row.status === 'finalizada' });
        return await calculate(admin, employee, body, setStage);
      }
      if (!row || row.id !== target.id || row.status !== (action === 'finalize' ? 'aprovada' : 'rascunho')) {
        return fail(409, 'situacao_invalida');
      }
      if (action === 'confirmPaymentDate') {
        const review = row.input_review;
        if (review?.version !== 2 || review.payment_date_confirmed === true || review.payment_date) {
          return fail(409, 'situacao_invalida');
        }
        return await calculate(admin, employee, {
          competence,
          payment_date: body.payment_date,
          tax_dependents: review.tax_dependents,
          paid_days: review.paid_days,
          unpaid_days: review.unpaid_days,
          dsr_extra: review.dsr_extra,
          dsr_discount: review.dsr_discount,
          reviewed_inputs: true,
        }, setStage, row);
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
      setStage('transicao_status');
      const result = await entities.Payroll.updateMany({ ...query, id: row.id, status: row.status }, {
        $set: fields,
      });
      if (result.updated !== 1) return fail(409, 'situacao_invalida');
      return ok({ payroll: { ...row, ...fields } });
    };
    if (action === 'view') return await process();
    setStage('bloqueio_funcionario');
    return await withEmployeeLock(entities, employee, process);
  } catch (error) {
    // Não registrar payload, CPF, salário, senha ou token. A etapa é uma enumeração
    // interna fixa; o cliente recebe apenas um código seguro para localizar o log.
    console.error('ContaFlow payrollService erro interno', {
      stage, type: error instanceof Error ? error.name : 'erro_desconhecido',
      status: Number.isInteger(error?.status) ? error.status : null,
    });
    return Response.json({
      error: 'falha_servidor', stage, release: PAYROLL_SERVICE_RELEASE,
    }, { status: 500 });
  }
}