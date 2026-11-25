import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { employeeAdmin, fail, ok, scopedRecord } from '../../shared/employeeAdmin.ts';
import { benefitEntities, recordBenefit } from '../../shared/benefitRecords.js';
import { monthStats } from '../../shared/payrollCalculation.js';
import { auditMonth } from '../../shared/attendanceAudit.js';
import { consistentReceipt, verifiedTable } from '../../shared/payrollReview.js';
import {
  hasUnscopedHistory,
  kinds,
  monthRange,
  validDate,
  validMarks,
  validMonth,
  validTime,
  withEmployeeLock,
} from '../../shared/attendance.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function attendance({ entities, companyId, actor }, body) {
  const employee = await scopedRecord(entities.Employee, body.employee_id, companyId);
  if (!employee || employee.access_role === 'master') return fail(404, 'funcionario_inexistente');
  const query = { company_id: companyId, employee_id: employee.id };
  const month = body.date?.slice(0, 7) || body.competence;
  if (!validMonth(month) || (body.date !== undefined && !validDate(body.date))) {
    return fail(400, 'data_invalida');
  }
  const unresolved = await Promise.all([
    hasUnscopedHistory(entities.Payroll, { employee_id: employee.id, competence: month }),
    hasUnscopedHistory(entities.TimeRecord, {
      employee_id: employee.id,
      date: body.date || monthRange(month),
    }),
  ]);
  if (unresolved.some(Boolean)) return fail(409, 'historico_sem_empresa');
  if (body.action === 'time') {
    const [marks, payrolls, schedule, vacations] = await Promise.all([
      entities.TimeRecord.filter({ ...query, date: body.date || monthRange(month) }, {
        sort: 'date',
        limit: 500,
      }),
      entities.Payroll.filter({ ...query, competence: month }, { limit: 1 }),
      scopedRecord(entities.WorkSchedule, employee.schedule_id, companyId),
      entities.Vacation.filter({
        ...query,
        start_date: { $lte: monthRange(month).$lte },
        end_date: { $gte: monthRange(month).$gte },
      }, { limit: 5 }),
    ]);
    if (marks.next_cursor) return fail(409, 'limite_consulta');
    // Apuração automática do mês: faltas presumidas, pendências, férias e afastamentos.
    const audit = body.date ? null : auditMonth({
      marks: marks.items,
      schedule,
      competence: month,
      vacations: vacations.items,
      admissionDate: employee.admission_date,
      employeeStatus: employee.status,
      statusDate: employee.status_date,
    });
    return ok({ items: marks.items, locked: payrolls.items.length > 0, schedule, audit });
  }
  if (
    !validDate(body.date) || !validTime(body.time) || typeof body.reason !== 'string' ||
    !body.reason.trim() || body.reason.length > 500
  ) return fail(400, 'correcao_invalida');
  return await withEmployeeLock(entities, employee, async () => {
    const payrolls = await entities.Payroll.filter({ ...query, competence: month }, { limit: 1 });
    if (payrolls.items.length) return fail(409, 'folha_existente');
    const day = await entities.TimeRecord.filter({ ...query, date: body.date }, { limit: 10 });
    if (day.next_cursor) return fail(409, 'ponto_requer_conferencia');
    const reason = body.reason.trim();
    const audit = {
      actor_id: actor.id,
      time: body.time,
      justification: reason,
      at: new Date().toISOString(),
    };
    if (body.action === 'addMark') {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());
      if (body.date > today || (employee.admission_date && body.date < employee.admission_date)) {
        return fail(400, 'data_invalida');
      }
      if (!kinds.includes(body.kind) || day.items.some((row) => row.kind === body.kind)) {
        return fail(409, 'marcacao_duplicada');
      }
      const mark = {
        ...query,
        date: body.date,
        kind: body.kind,
        original_time: body.time,
        source: 'rh_manual',
        justification: reason,
        corrections: [{ ...audit, previous: '' }],
      };
      if (!validMarks([...day.items, mark])) return fail(409, 'sequencia_invalida');
      await entities.TimeRecord.create(mark);
    } else {
      const mark = day.items.find((row) => row.id === body.id);
      if (!mark) return fail(404, 'registro_inexistente');
      const previous = mark.corrected_time || mark.original_time;
      if (body.previous !== previous || body.revision !== (mark.corrections || []).length) {
        return fail(409, 'registro_alterado');
      }
      const changed = {
        corrected_time: body.time,
        justification: reason,
        corrections: [...(mark.corrections || []), { ...audit, previous }],
      };
      if (!validMarks(day.items.map((row) => row.id === mark.id ? { ...row, ...changed } : row))) {
        return fail(409, 'sequencia_invalida');
      }
      await entities.TimeRecord.update(mark.id, changed);
    }
    return ok({});
  });
}

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');
  try {
    const body = await req.json();
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { entities, companyId, actor } = admin;
    if (body.expected_company_id !== companyId) return fail(409, 'empresa_alterada');
    if (actor.access_role === 'gerente' && body.action !== 'time') return fail(403, 'sem_permissao');
    if (['time', 'correctMark', 'addMark'].includes(body.action)) return await attendance(admin, body);
    const query = { company_id: companyId };
    if (body.action === 'timeReport') {
      if (!validMonth(body.competence)) return fail(400, 'competencia_invalida');
      const [employees, schedules, marks] = await Promise.all([
        entities.Employee.filter(query, {
          limit: 1000,
          fields: ['id', 'full_name', 'schedule_id', 'admission_date', 'access_role'],
        }),
        entities.WorkSchedule.filter(query, { limit: 500 }),
        entities.TimeRecord.filter({ ...query, date: monthRange(body.competence) }, { limit: 5000 }),
      ]);
      if ([employees, schedules, marks].some((page) => page.next_cursor)) return fail(409, 'limite_consulta');
      const rows = employees.items.filter((e) => e.access_role !== 'master').flatMap((e) => {
        const mine = marks.items.filter((m) => m.employee_id === e.id);
        const schedule = schedules.items.find((s) => s.id === e.schedule_id);
        return mine.length
          ? [{
            e: { id: e.id, full_name: e.full_name },
            n: mine.length,
            st: monthStats(mine, schedule, body.competence, undefined, e.admission_date),
          }]
          : [];
      });
      return ok({ items: rows });
    }
    if (body.action === 'legalTables') {
      const rows = await entities.LegalTable.filter({}, { sort: '-start_competence', limit: 500 });
      if (rows.next_cursor) return fail(409, 'limite_consulta');
      return ok({ items: rows.items });
    }
    if (body.action === 'saveLegalTable') {
      if (actor.access_role !== 'master') return fail(403, 'sem_permissao');
      const t = body.record;
      if (
        !t || !validMonth(t.start_competence) || (t.end_competence && (!validMonth(t.end_competence) ||
          t.end_competence < t.start_competence)) ||
        typeof t.active !== 'boolean' ||
        typeof t.label !== 'string' || !t.label.trim() || t.label.length > 150
      ) return fail(400, 'tabela_invalida');
      if (body.id) {
        const old = await entities.LegalTable.get(body.id).catch((e) =>
          e.status === 404 ? null : Promise.reject(e)
        );
        if (!old) return fail(404, 'registro_inexistente');
        if (t.start_competence !== old.start_competence) return fail(400, 'tabela_invalida');
        // Close a version without replacing the tax values used by historical receipts.
        const saved = await entities.LegalTable.update(old.id, {
          active: t.active,
          end_competence: t.end_competence || '',
        });
        return ok({ record: saved });
      }
      if (!verifiedTable(t, t.start_competence, t.start_competence + '-01')) {
        return fail(422, 'tabela_invalida');
      }
      const fields = {};
      for (
        const key of [
          'label',
          'active',
          'start_competence',
          'end_competence',
          'inss_bands',
          'irrf_bands',
          'irrf_dependent_deduction',
          'irrf_simplified_discount',
          'fgts_rate',
          'overtime_rate',
          'overtime_cap_minutes',
          'tolerance_minutes',
          'absence_divisor',
          'notes',
        ]
      ) {
        fields[key] = t[key];
      }
      return ok({ record: await entities.LegalTable.create(fields) });
    }
    if (['recordBenefit', 'payBenefit'].includes(body.action)) {
      if (!benefitEntities.has(body.module)) return fail(400, 'acao_invalida');
      if (body.action === 'recordBenefit') {
        const emp = await scopedRecord(entities.Employee, body.employee_id, companyId);
        if (!emp || emp.access_role === 'master') return fail(404, 'funcionario_inexistente');
        return await recordBenefit(admin, emp, body);
      }
      const entity = entities[benefitEntities.get(body.module)];
      const row = await scopedRecord(entity, body.id, companyId);
      if (!row || !await scopedRecord(entities.Employee, row.employee_id, companyId)) {
        return fail(404, 'registro_inexistente');
      }
      const expected = body.module === 'ferias' ? 'programada' : 'a_pagar';
      if (
        body.module === 'rescisao' || row.status !== expected || !consistentReceipt(row) ||
        !validDate(body.paid_at) ||
        body.paid_at > new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date())
      ) {
        return fail(409, 'pagamento_invalido');
      }
      const changed = await entity.updateMany({ company_id: companyId, id: row.id, status: expected }, {
        $set: { status: 'paga', paid_at: body.paid_at, paid_by: actor.id },
      });
      return changed.updated === 1 ? ok({}) : fail(409, 'registro_alterado');
    }
    if (body.action === 'saveRubric') {
      const { name, category, fixed_value, auto_apply, description } = body.record || {};
      if (
        typeof name !== 'string' || !name.trim() || name.length > 150 ||
        !['provento', 'desconto', 'informativa', 'redutora'].includes(category) ||
        typeof auto_apply !== 'boolean' ||
        !Number.isFinite(fixed_value) || fixed_value < 0 ||
        Math.abs(fixed_value * 100 - Math.round(fixed_value * 100)) > 0.000001 ||
        (auto_apply && (!fixed_value || category === 'redutora')) || typeof description !== 'string' ||
        description.length > 500
      ) {
        return fail(400, 'rubrica_invalida');
      }
      if (auto_apply && category !== 'informativa' && body.record.incidence_reviewed !== true) {
        return fail(400, 'rubrica_invalida');
      }
      const fields = {
        incidence_reviewed: body.record.incidence_reviewed === true,
        name: name.trim(),
        category,
        fixed_value,
        auto_apply,
        description: description.trim(),
      };
      if (body.id != null) {
        const row = await scopedRecord(entities.Rubric, body.id, companyId);
        if (!row) return fail(404, 'registro_inexistente');
        await entities.Rubric.update(row.id, fields);
      } else await entities.Rubric.create({ ...query, ...fields });
      return ok({});
    }
    let entity, sort;
    if (body.action === 'rubrics') {
      entity = entities.Rubric;
      sort = 'name';
    } else if (body.action === 'history') {
      entity = entities.Payroll;
      sort = '-competence';
      if (body.from || body.to) {
        if (
          (body.from && !validMonth(body.from)) || (body.to && !validMonth(body.to)) ||
          (body.from && body.to && body.to < body.from)
        ) return fail(400, 'competencia_invalida');
        query.competence = {
          ...(body.from ? { $gte: body.from } : {}),
          ...(body.to ? { $lte: body.to } : {}),
        };
      }
      if (body.competence) {
        if (!validMonth(body.competence)) return fail(400, 'competencia_invalida');
        query.competence = body.competence;
      }
      if (body.term) {
        if (typeof body.term !== 'string' || body.term.length > 100) return fail(400, 'consulta_invalida');
        if (/^[\d.\s-]+$/.test(body.term)) {
          query.employee_cpf = { $regex: body.term.replace(/\D/g, '') || '^$' };
        } else query.employee_name = { $regex: escapeRegex(body.term), $options: 'i' };
      }
    } else if (body.action === 'benefits' && benefitEntities.has(body.module)) {
      entity = entities[benefitEntities.get(body.module)];
      sort = '-competence';
    } else return fail(400, 'acao_invalida');
    const page = await entity.filter(query, { sort, limit: 100, cursor: body.cursor });
    // Never return a row solely on the authority of a cursor supplied by the browser.
    if (page.items.some((row) => row.company_id !== companyId)) return fail(403, 'sem_permissao');
    return ok({ items: page.items, next_cursor: page.next_cursor || null });
  } catch {
    return fail(500, 'falha_servidor');
  }
}
