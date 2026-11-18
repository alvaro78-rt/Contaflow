import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isValidCpf, onlyDigits } from '../../shared/cpf.ts';
import { newPasswordHash, verifyPassword } from '../../shared/passwords.ts';
import { employeeAdmin, employeeDetails, employeeInput, employeeRow, fail, managedEmployee, ok, scopedRecord } from '../../shared/employeeAdmin.ts';

const ROLES = ['admin', 'gerente', 'funcionario'];
const STATUSES = ['ativo', 'afastado', 'desligado'];
const HISTORY = ['Payroll', 'TimeRecord', 'Vacation', 'ThirteenthSalary', 'Termination'];

async function createChecked(Employee, fields) {
  const created = await Employee.create(fields);
  const matches = await Employee.filter({ cpf: fields.cpf }, 'created_date', 100);
  const conflicts = matches.filter((row) => row.id === created.id || row.company_id === fields.company_id ||
    (fields.password_hash && row.password_hash));
  conflicts.sort((a, b) => String(a.created_date ?? '').localeCompare(String(b.created_date ?? '')) || a.id.localeCompare(b.id));

  // Em criações simultâneas, só desfaz a linha criada por esta chamada.
  if (conflicts[0] && conflicts[0].id !== created.id) {
    await Employee.delete(created.id);
    return null;
  }
  return created;
}

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');

  try {
    const body = await req.json().catch(() => null);
    const admin = await employeeAdmin(createClientFromRequest(req), body?.token);
    if (admin.response) return admin.response;
    const { actor, companyId, entities } = admin;
    const { Employee } = entities;
    const action = body.action ?? 'quick';
    if (!['quick', 'save', 'delete'].includes(action)) return fail(400, 'acao_invalida');
    const existing = body.id === undefined ? null : await scopedRecord(Employee, body.id, companyId);
    if ((body.id !== undefined || action === 'delete') && !existing) return fail(404, 'funcionario_inexistente');

    if (action === 'delete') {
      if (existing.id === actor.id || ['admin', 'master'].includes(existing.access_role) ||
        !managedEmployee(actor, existing, existing.access_role || 'funcionario', existing.status)) {
        return fail(403, 'exclusao_bloqueada');
      }
      const history = await Promise.all(HISTORY.map(async (entity) => {
        const rows = await entities[entity].filter({ company_id: companyId, employee_id: existing.id }, 'id', 1);
        return rows.length > 0;
      }));
      if (history.some(Boolean)) return fail(409, 'funcionario_com_historico');
      await Employee.delete(existing.id);
      return ok({});
    }

    if (action === 'save' && (!body.employee || typeof body.employee !== 'object' || Array.isArray(body.employee))) {
      return fail(400, 'dados_invalidos');
    }
    const input = action === 'save' ? body.employee : body;
    const data = action === 'save' ? employeeInput(input) : { full_name: String(input.full_name ?? '').trim() };
    const cpf = onlyDigits(input.cpf);
    const password = typeof body.password === 'string' ? body.password : '';
    if (data.full_name?.length < 3 || !data.full_name || data.full_name.length > 200) return fail(400, 'nome_invalido');
    if (!isValidCpf(cpf)) return fail(400, 'cpf_invalido');
    if ((action === 'quick' || password) && (password.length < 6 || password.length > 128)) {
      return fail(400, 'senha_invalida');
    }

    const matches = await Employee.filter({ cpf }, 'created_date', 100);
    const accounts = matches.filter((e) => e.id !== existing?.id && e.password_hash);
    if (action === 'quick') {
      if (existing) return fail(400, 'acao_invalida');
      const local = matches.filter((e) => e.company_id === companyId);
      if (local.length > 1) return fail(409, 'cpf_duplicado');
      const target = local[0];
      if (target && (target.access_role || 'funcionario') !== 'funcionario') return fail(403, 'sem_permissao');
      if (target?.status === 'desligado') return fail(409, 'funcionario_desligado');
      if (accounts.length) {
        if (accounts.length === 1 && accounts[0].id === target?.id && data.full_name === target.full_name &&
          await verifyPassword(target.password_hash, cpf, password)) {
          return ok({ employee: employeeRow(target) });
        }
        return fail(409, 'cpf_ja_tem_acesso');
      }
      const password_hash = newPasswordHash(password);
      const employee = target
        ? await Employee.update(target.id, { password_hash })
        : await createChecked(Employee, { ...data, cpf, company_id: companyId, access_role: 'funcionario', status: 'ativo', password_hash });
      return employee ? ok({ employee: employeeRow(employee) }) : fail(409, 'cpf_duplicado');
    }

    if (matches.some((e) => e.id !== existing?.id && e.company_id === companyId)) return fail(409, 'cpf_duplicado');
    if ((password || existing?.password_hash) && accounts.length) return fail(409, 'cpf_ja_tem_acesso');
    const role = data.access_role || existing?.access_role || 'funcionario';
    const status = data.status || existing?.status || 'ativo';
    if (!ROLES.includes(role) || !STATUSES.includes(status)) return fail(400, 'dados_invalidos');
    if (!managedEmployee(actor, existing, role, status)) return fail(403, 'perfil_protegido');
    if (existing?.password_hash && existing.cpf !== cpf && !password) return fail(400, 'cpf_exige_senha');

    const today = new Date().toISOString().slice(0, 10);
    for (const date of [data.birth_date, data.admission_date, data.status_date]) {
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date || date > today)) return fail(400, 'data_invalida');
    }
    data.pis = onlyDigits(data.pis);
    if (data.pis && data.pis.length !== 11) return fail(400, 'pis_invalido');
    if (!data.admission_date || !data.position_id || !data.schedule_id || !(data.base_salary > 0) ||
      (data.weekly_hours !== undefined && data.weekly_hours <= 0)) return fail(400, 'contrato_incompleto');
    const [position, schedule] = await Promise.all([
      scopedRecord(entities.Position, data.position_id, companyId),
      scopedRecord(entities.WorkSchedule, data.schedule_id, companyId),
    ]);
    if (!position || !schedule) return fail(400, 'contrato_invalido');

    if (data.username) {
      const duplicates = await Employee.filter({ company_id: companyId, username: data.username }, 'id', 2);
      if (duplicates.some((e) => e.id !== existing?.id)) return fail(409, 'usuario_duplicado');
    }
    if (password) data.password_hash = newPasswordHash(password);

    // O vínculo é derivado da sessão. A edição preserva os campos de acesso omitidos.
    const fields = { ...data, cpf, access_role: role, status };
    const employee = existing
      ? await Employee.update(existing.id, fields)
      : await createChecked(Employee, { ...fields, company_id: companyId });
    return employee ? ok({ employee: employeeDetails(employee) }) : fail(409, 'cpf_duplicado');
  } catch {
    return fail(500, 'falha_servidor');
  }
}
