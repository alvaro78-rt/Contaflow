import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { employeeAdmin, fail, ok, scopedRecord } from '../../shared/employeeAdmin.ts';
import { monthRange, validMonth, withEmployeeLock } from '../../shared/attendance.js';
import { auditMonth, localToday } from '../../shared/attendanceAudit.js';
import {
  SITUATIONS,
  SITUATION_VALUES,
  conferenceSummary,
  validateConference,
} from '../../shared/conferenceAttendance.js';

// Conferência mensal de frequência: o mês chega apurado automaticamente
// (presenças, atrasos, extras, faltas presumidas, férias e pendências). O RH só
// decide sobre as faltas presumidas e autoriza a apuração. Sem autorização a
// folha não aplica descontos; nenhum horário é inventado.

const AUTHORIZERS = ['master', 'admin'];

const incomplete = (problems) => Response.json({ error: 'cadastro_incompleto', problems }, { status: 422 });

function cleanDays(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 40).map((day) => ({
    date: typeof day?.date === 'string' ? day.date : '',
    situation: typeof day?.situation === 'string' ? day.situation : '',
    justification: typeof day?.justification === 'string' ? day.justification.trim().slice(0, 500) : '',
    evidence_uri: typeof day?.evidence_uri === 'string' ? day.evidence_uri.trim().slice(0, 500) : '',
    evidence_name: typeof day?.evidence_name === 'string' ? day.evidence_name.trim().slice(0, 200) : '',
  }));
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const publicConference = (row) => row && ({
  id: row.id,
  competence: row.competence,
  status: row.status,
  days: row.days || [],
  basis: row.basis || '',
  evidence_uri: row.evidence_uri || '',
  evidence_name: row.evidence_name || '',
  summary: row.summary || conferenceSummary(row.days || []),
  saved_by_name: row.saved_by_name || '',
  saved_at: row.saved_at || '',
  authorized_by_name: row.authorized_by_name || '',
  authorized_by_role: row.authorized_by_role || '',
  authorized_at: row.authorized_at || '',
  revoked_at: row.revoked_at || '',
  revoked_by_name: row.revoked_by_name || '',
  revoke_reason: row.revoke_reason || '',
});

async function context(admin, body) {
  const { companyId, entities, actor } = admin;
  if (!validMonth(body.competence)) return { response: fail(400, 'competencia_invalida') };
  const employee = await scopedRecord(entities.Employee, body.employee_id, companyId);
  if (!employee || employee.access_role === 'master') return { response: fail(404, 'funcionario_inexistente') };
  const range = monthRange(body.competence);
  const query = { company_id: companyId, employee_id: employee.id };
  const [schedule, position, marks, vacations, rows] = await Promise.all([
    scopedRecord(entities.WorkSchedule, employee.schedule_id, companyId),
    scopedRecord(entities.Position, employee.position_id, companyId),
    entities.TimeRecord.filter({ ...query, date: range }, { limit: 500 }),
    entities.Vacation.filter(
      { ...query, start_date: { $lte: range.$lte }, end_date: { $gte: range.$gte } },
      { limit: 5 },
    ),
    entities.AttendanceConference.filter({ ...query, competence: body.competence }, { limit: 2 }),
  ]);
  if (marks.next_cursor) return { response: fail(409, 'limite_consulta') };
  return {
    companyId,
    entities,
    actor,
    employee,
    schedule,
    position,
    competence: body.competence,
    range,
    closed: range.$lte < localToday(),
    marks: marks.items,
    vacations: vacations.items,
    conference: rows.items.find((row) => row.status === 'autorizada') || rows.items[0] || null,
    duplicates: rows.items.length > 1,
  };
}

const auditOf = (ctx) => auditMonth({
  marks: ctx.marks,
  schedule: ctx.schedule,
  competence: ctx.competence,
  vacations: ctx.vacations,
  admissionDate: ctx.employee.admission_date,
  employeeStatus: ctx.employee.status,
  statusDate: ctx.employee.status_date,
  today: localToday(),
});

async function view(ctx) {
  const audit = auditOf(ctx);
  const decisions = new Map((ctx.conference?.days || []).map((day) => [day.date, day]));
  const days = audit.days.map((day) => {
    const decision = decisions.get(day.date);
    return {
      ...day,
      editable: day.kind === 'falta_presumida',
      situation: decision?.situation || '',
      justification: decision?.justification || '',
      evidence_uri: decision?.evidence_uri || '',
      evidence_name: decision?.evidence_name || '',
    };
  });
  const counts = days.reduce((acc, day) => {
    acc[day.kind] = (acc[day.kind] || 0) + 1;
    return acc;
  }, { presenca: 0, falta_presumida: 0, pendencia: 0, folga: 0, feriado: 0, ferias: 0, afastamento: 0, futuro: 0 });
  return ok({
    employee: {
      id: ctx.employee.id,
      full_name: ctx.employee.full_name || '',
      cpf: ctx.employee.cpf || '',
      department: ctx.employee.department || '',
      position_name: ctx.position?.name || '',
    },
    schedule: ctx.schedule && {
      name: ctx.schedule.name || '',
      work_days: ctx.schedule.work_days || [],
      entry_time: ctx.schedule.entry_time,
      exit_time: ctx.schedule.exit_time,
      break_start: ctx.schedule.break_start || '',
      break_end: ctx.schedule.break_end || '',
    },
    competence: ctx.competence,
    closed: ctx.closed,
    marks_count: ctx.marks.length,
    conference: publicConference(ctx.conference),
    duplicates: ctx.duplicates,
    days,
    counts,
    stats: audit.stats,
    problems: audit.problems,
    situations: SITUATIONS,
    can_authorize: ctx.closed && AUTHORIZERS.includes(ctx.actor.access_role) &&
      ctx.employee.status === 'ativo' && ctx.employee.contract_type === 'CLT' &&
      audit.stats.pending === 0,
    can_revoke: AUTHORIZERS.includes(ctx.actor.access_role) && ctx.conference?.status === 'autorizada',
  });
}

async function persist(ctx, body, authorize) {
  const { entities, companyId, actor, employee, schedule, competence, closed, conference } = ctx;
  if (!closed) return fail(422, 'competencia_aberta');
  if (ctx.duplicates) return fail(409, 'conferencia_duplicada');
  if (!schedule) return incomplete(['Defina a jornada de trabalho do funcionário antes de conferir a frequência.']);
  if (employee.status !== 'ativo' || employee.contract_type !== 'CLT') {
    return incomplete(['A conferência de frequência exige funcionário ativo com contrato CLT.']);
  }
  if (conference?.status === 'autorizada') return fail(409, 'conferencia_autorizada');
  const payrolls = await entities.Payroll.filter(
    { company_id: companyId, employee_id: employee.id, competence },
    { limit: 1 },
  );
  if (payrolls.items.length) return fail(409, 'folha_existente');
  const audit = auditOf(ctx);
  if (!audit.days.length) return incomplete(['Não há dias de jornada nesta competência para conferir.']);
  const byDate = new Map(audit.days.map((day) => [day.date, day]));
  const days = cleanDays(body.days);
  const invalid = days.find((day) => {
    const audited = byDate.get(day.date);
    return !audited || audited.kind !== 'falta_presumida' ||
      (day.situation && !SITUATION_VALUES.includes(day.situation));
  });
  if (invalid) {
    return incomplete(['A conferência só aceita decisões sobre as faltas presumidas apuradas automaticamente.']);
  }
  const fields = {
    company_id: companyId,
    employee_id: employee.id,
    employee_name: employee.full_name || '',
    employee_cpf: employee.cpf || '',
    competence,
    days,
    basis: text(body.basis, 1000),
    evidence_uri: text(body.evidence_uri, 500),
    evidence_name: text(body.evidence_name, 200),
    summary: conferenceSummary(days),
    saved_by_name: actor.full_name || '',
    saved_by_cpf: actor.cpf || '',
    saved_at: new Date().toISOString(),
  };
  if (authorize) {
    const check = validateConference(
      { ...fields, status: 'autorizada' },
      {
        employee,
        schedule,
        competence,
        marks: ctx.marks,
        vacations: ctx.vacations,
      },
    );
    if (check.problems.length) {
      return Response.json({ error: 'conferencia_incompleta', problems: check.problems }, { status: 422 });
    }
    Object.assign(fields, {
      status: 'autorizada',
      authorized_by_name: actor.full_name || '',
      authorized_by_cpf: actor.cpf || '',
      authorized_by_role: actor.access_role,
      authorized_at: fields.saved_at,
      revoked_at: '',
      revoked_by_name: '',
      revoke_reason: '',
    });
  } else {
    fields.status = 'rascunho';
  }
  if (conference) {
    const result = await entities.AttendanceConference.updateMany(
      { id: conference.id, company_id: companyId, status: 'rascunho' },
      { $set: fields },
    );
    if (result.updated !== 1) return fail(409, 'registro_alterado');
    return ok({ conference: publicConference({ ...conference, ...fields }) });
  }
  return ok({ conference: publicConference(await entities.AttendanceConference.create(fields)) });
}

async function revoke(ctx, body) {
  if (!AUTHORIZERS.includes(ctx.actor.access_role)) return fail(403, 'sem_permissao');
  const row = ctx.conference;
  if (!row || row.status !== 'autorizada') return fail(409, 'situacao_invalida');
  const payrolls = await ctx.entities.Payroll.filter(
    { company_id: ctx.companyId, employee_id: ctx.employee.id, competence: ctx.competence },
    { limit: 1 },
  );
  if (payrolls.items.length) return fail(409, 'folha_existente');
  const fields = {
    status: 'rascunho',
    revoked_at: new Date().toISOString(),
    revoked_by_name: ctx.actor.full_name || '',
    revoke_reason: text(body.reason, 500),
  };
  const result = await ctx.entities.AttendanceConference.updateMany(
    { id: row.id, company_id: ctx.companyId, status: 'autorizada' },
    { $set: fields },
  );
  if (result.updated !== 1) return fail(409, 'registro_alterado');
  return ok({ conference: publicConference({ ...row, ...fields }) });
}

export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'requisicao_invalida');
  try {
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const action = body.action;
    if (!['view', 'save', 'authorize', 'revoke'].includes(action)) return fail(400, 'acao_invalida');
    const ctx = await context(admin, body);
    if (ctx.response) return ctx.response;
    if (body.expected_company_id !== ctx.companyId) return fail(409, 'empresa_alterada');
    if (action === 'view') return await view(ctx);
    if (action === 'revoke') return await withEmployeeLock(ctx.entities, ctx.employee, () => revoke(ctx, body));
    return await withEmployeeLock(ctx.entities, ctx.employee, () => persist(ctx, body, action === 'authorize'));
  } catch (error) {
    console.error('ContaFlow attendanceConference erro interno', {
      type: error instanceof Error ? error.name : 'erro_desconhecido',
      status: Number.isInteger(error?.status) ? error.status : null,
    });
    return Response.json({ error: 'falha_servidor' }, { status: 500 });
  }
}
