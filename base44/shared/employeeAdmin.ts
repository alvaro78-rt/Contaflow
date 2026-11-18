import { loadSession, MANAGEMENT_ROLES, scopeCompany } from './sessionGuard.ts';

export const fail = (status, error) => Response.json({ error }, { status });
export const ok = (data) => Response.json({ ok: true, ...data });

export async function employeeAdmin(base44, token) {
  const loaded = await loadSession(base44, token);
  if (loaded.error) return { response: fail(loaded.status, loaded.error) };
  const { session, actor } = loaded;
  const companyId = scopeCompany(session, actor);
  if (!companyId) return { response: fail(403, 'sem_empresa') };
  if (!MANAGEMENT_ROLES.includes(actor.access_role)) return { response: fail(403, 'sem_permissao') };
  return { actor, companyId, entities: base44.asServiceRole.entities };
}

export async function scopedRecord(entity, id, companyId) {
  if (typeof id !== 'string' || !id || id.length > 128) return null;
  const row = await entity.get(id).catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });
  return row?.company_id === companyId ? row : null;
}

export function employeeRow(employee) {
  const { id, full_name, cpf, position_id, department, base_salary, access_role, status, password_hash } = employee;
  return { id, full_name, cpf, position_id, department, base_salary, access_role, status: status || 'ativo', tem_acesso: Boolean(password_hash) };
}

const TEXT_FIELDS = [
  'full_name', 'rg', 'pis', 'photo_url', 'marital_status', 'zip_code', 'address',
  'address_number', 'address_complement', 'neighborhood', 'state', 'position_id',
  'department', 'contract_type', 'work_regime', 'schedule_id', 'status', 'status_reason',
  'bank_name', 'bank_agency', 'bank_account', 'pix', 'username', 'access_role',
];
const DATE_FIELDS = ['birth_date', 'admission_date', 'status_date'];

export function employeeDetails(employee) {
  const details = employeeRow(employee);
  for (const field of [...TEXT_FIELDS, ...DATE_FIELDS, 'weekly_hours', 'dependents']) {
    if (employee[field] != null) details[field] = employee[field];
  }
  return details;
}

export function employeeInput(input) {
  const data = {};
  for (const field of TEXT_FIELDS) {
    if (typeof input[field] === 'string') data[field] = input[field].trim();
  }
  for (const field of DATE_FIELDS) {
    if (typeof input[field] === 'string') data[field] = input[field].trim() || null;
  }
  for (const field of ['base_salary', 'weekly_hours']) {
    if (typeof input[field] === 'number' && Number.isFinite(input[field])) data[field] = input[field];
  }
  if (Array.isArray(input.dependents)) {
    data.dependents = input.dependents.map((dependent) => ({
      name: typeof dependent?.name === 'string' ? dependent.name.trim() : '',
      birth_date: typeof dependent?.birth_date === 'string' ? dependent.birth_date : '',
      relationship: typeof dependent?.relationship === 'string' ? dependent.relationship.trim() : '',
    }));
  }
  return data;
}

export function managedEmployee(actor, target, role, status) {
  const targetRole = target?.access_role || 'funcionario';
  if (targetRole === 'master') return false;
  if (actor.access_role === 'gerente' && (targetRole !== 'funcionario' || role !== 'funcionario')) return false;
  if (target?.id === actor.id && (role !== targetRole || status === 'desligado')) return false;
  return targetRole !== 'admin' || (role === 'admin' && status !== 'desligado');
}
