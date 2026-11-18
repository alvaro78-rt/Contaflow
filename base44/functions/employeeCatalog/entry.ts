import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { employeeAdmin, fail, ok, scopedRecord } from '../../shared/employeeAdmin.ts';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');

  try {
    const body = await req.json().catch(() => null);
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { companyId, entities } = admin;
    const query = { company_id: companyId };

    if (!body.action || body.action === 'list') {
      const [positions, schedules] = await Promise.all([
        entities.Position.filter(query, 'name', 500),
        entities.WorkSchedule.filter(query, 'name', 500),
      ]);
      return ok({
        positions: positions.filter((row) => row.company_id === companyId),
        schedules: schedules.filter((row) => row.company_id === companyId),
      });
    }

    if (body.action === 'assignPosition') {
      const employee = await scopedRecord(entities.Employee, body.employee_id, companyId);
      const position = await scopedRecord(entities.Position, body.position_id, companyId);
      if (!employee) return fail(404, 'funcionario_inexistente');
      if (!position) return fail(404, 'cargo_invalido');
      if (employee.access_role === 'master' || employee.status === 'desligado') return fail(403, 'perfil_protegido');
      if (employee.position_id !== position.id) {
        await entities.Employee.update(employee.id, { position_id: position.id });
      }
      const updated = await scopedRecord(entities.Employee, employee.id, companyId);
      if (updated?.position_id !== position.id) return fail(409, 'vinculo_nao_confirmado');
      return ok({ employee_id: employee.id, position_id: position.id });
    }

    if (body.action !== 'savePosition' && body.action !== 'saveSchedule') return fail(400, 'acao_invalida');
    const input = body.record;
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 200) return fail(400, 'nome_invalido');

    const entity = body.action === 'savePosition' ? entities.Position : entities.WorkSchedule;
    const existing = body.id === undefined ? null : await scopedRecord(entity, body.id, companyId);
    if (body.id !== undefined && !existing) return fail(404, 'registro_inexistente');
    let fields;

    if (body.action === 'savePosition') {
      const code = typeof input.code === 'string' ? input.code.trim() : '';
      if (!code || code.length > 50) return fail(400, 'cargo_invalido');
      const matches = await entity.filter({ ...query, code }, 'id', 2);
      if (matches.some((row) => row.id !== existing?.id)) return fail(409, 'cargo_duplicado');
      fields = { name, code };
    } else {
      const { weekly_hours, work_days, entry_time, exit_time, break_start = '', break_end = '' } = input;
      if (!Number.isFinite(weekly_hours) || weekly_hours <= 0 || weekly_hours > 168 ||
        !Array.isArray(work_days) || !work_days.length || work_days.length > 7 ||
        !work_days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
        typeof entry_time !== 'string' || typeof exit_time !== 'string' ||
        !TIME.test(entry_time) || !TIME.test(exit_time) || exit_time <= entry_time ||
        typeof break_start !== 'string' || typeof break_end !== 'string' ||
        Boolean(break_start) !== Boolean(break_end) ||
        (break_start && (!TIME.test(break_start) || !TIME.test(break_end) || break_start < entry_time ||
          break_end > exit_time || break_end <= break_start))) return fail(400, 'jornada_invalida');
      fields = { name, weekly_hours, work_days: [...new Set(work_days)].sort(), entry_time, exit_time, break_start, break_end };
    }
    const record = existing
      ? await entity.update(existing.id, fields)
      : await entity.create({ ...fields, ...query });
    return ok({ record });
  } catch {
    return fail(500, 'falha_servidor');
  }
}
