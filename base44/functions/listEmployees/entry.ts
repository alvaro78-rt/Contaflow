import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { employeeAdmin, employeeDetails, employeeRow, fail, ok, scopedRecord } from '../../shared/employeeAdmin.ts';
import { onlyDigits } from '../../shared/cpf.ts';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');

  try {
    const body = await req.json().catch(() => null);
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { companyId, entities } = admin;

    if (body.id !== undefined) {
      const employee = await scopedRecord(entities.Employee, body.id, companyId);
      if (!employee || employee.access_role === 'master') return fail(404, 'funcionario_inexistente');
      if (admin.actor.access_role === 'gerente' && employee.id !== admin.actor.id &&
          (employee.access_role || 'funcionario') !== 'funcionario') return fail(403,'perfil_protegido');
      return ok({ employee: employeeDetails(employee) });
    }

    const query = { company_id: companyId, access_role: { $ne: 'master' } };
    const term = typeof body.term === 'string' ? body.term.trim().slice(0, 100) : '';
    if (body.by === 'cpf' && term) query.cpf = { $regex: onlyDigits(term) || '^$a' };
    if (body.by === 'name' && term) query.full_name = { $regex: escapeRegex(term), $options: 'i' };
    if (typeof body.position_id === 'string' && body.position_id) query.position_id = body.position_id;
    if (body.status === 'ativo') query.$or = [{ status: 'ativo' }, { status: { $exists: false } }];
    if (body.status === 'afastado' || body.status === 'desligado') query.status = body.status;
    const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 200);
    const { items, next_cursor } = await entities.Employee.filter(query, { sort: 'full_name', limit, cursor });
    return ok({
      employees: items.filter((e) => e.company_id === companyId && e.access_role !== 'master').map(employeeRow),
      next_cursor: next_cursor || null,
    });
  } catch {
    return fail(500, 'falha_servidor');
  }
}
