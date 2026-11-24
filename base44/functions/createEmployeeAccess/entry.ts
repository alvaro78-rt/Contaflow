import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { pbkdf2Async } from 'npm:@noble/hashes@2.2.0/pbkdf2.js';
import { sha256 } from 'npm:@noble/hashes@2.2.0/sha2.js';

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

// Mesma receita do cliente: SHA-256 de "cpf::senha" em hexadecimal.
async function hashPassword(cpf, password) {
  const bytes = new TextEncoder().encode(`${onlyDigits(cpf)}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a.length || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


// Mesma validação de dígitos verificadores usada no cliente.
function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const ITERATIONS = 100000;
const LEGACY_ITERATIONS = 120000;
const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function derive(password, salt, iterations) {
  const passwordBytes = new TextEncoder().encode(password);
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g) || [], (hex) => parseInt(hex, 16));

  // O runtime hospedado aceita até 100 mil iterações. A implementação JS
  // verifica hashes antigos acima desse limite sem alterar a senha da conta.
  if (iterations > ITERATIONS) {
    return toHex(await pbkdf2Async(sha256, passwordBytes, saltBytes, { c: iterations, dkLen: 32 }));
  }

  const key = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256);
  return toHex(bits);
}

async function newPasswordHash(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(String(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(stored, cpf, password) {
  const value = String(stored || '');
  if (!value) return false;
  if (value.startsWith('pbkdf2$')) {
    const [, iterations, salt, hash] = value.split('$');
    const count = Number(iterations);
    if (!Number.isInteger(count) || count < 1 || count > LEGACY_ITERATIONS ||
      !/^[0-9a-f]{32}$/i.test(salt || '') || !/^[0-9a-f]{64}$/i.test(hash || '')) return false;
    return safeEqual(await derive(String(password), salt, count), hash);
  }
  return safeEqual(await hashPassword(cpf, password), value);
}

// Validação única da sessão por CPF: o token vem do corpo, mas quem é o usuário
// e qual empresa ele alcança saem sempre do banco (AuthSession + Employee).
async function loadSession(base44, token) {
  const value = String(token || '').trim();
  if (!value) return { status: 401, error: 'sessao_invalida' };

  const { items } = await base44.asServiceRole.entities.AuthSession.filter({ token: value }, { limit: 1 });
  const session = items[0];
  if (!session || !session.employee_id) return { status: 401, error: 'sessao_invalida' };
  const expiresAt = Date.parse(session.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { status: 401, error: 'sessao_expirada' };
  }

  const actor = await base44.asServiceRole.entities.Employee
    .get(session.employee_id)
    .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  if (!actor || (actor.credential_version || '') !== (session.credential_version || '')) return { status: 401, error: 'sessao_invalida' };
  if (actor.status === 'desligado') return { status: 403, error: 'conta_desligada' };

  return { session, actor };
}

// Empresa em uso: o mestre usa a empresa escolhida na sessão; os demais, o próprio vínculo.
function scopeCompany(session, actor) {
  if (actor.access_role === 'master') return String(session.company_id || '');
  return String(actor.company_id || '');
}

const MANAGEMENT_ROLES = ['master', 'admin', 'gerente'];

// Titular: o CPF registrado na empresa é o mesmo da conta.
const isCompanyOwner = (actor, company) => {
  const actorCpf = onlyDigits(actor?.cpf);
  const ownerCpf = onlyDigits(company?.owner_cpf);
  return Boolean(actorCpf) && Boolean(ownerCpf) && actorCpf === ownerCpf;
};

// Gestor autorizado: vínculo explícito gravado na empresa no momento em que ela
// foi cadastrada. Nunca é inferido nem criado automaticamente.
const isCompanyManager = (actor, company) => {
  const actorCpf = onlyDigits(actor?.cpf);
  if (!actorCpf) return false;
  return (Array.isArray(company?.managed_by_cpf) ? company.managed_by_cpf : [])
    .some((value) => onlyDigits(value) === actorCpf);
};

// Empresa sem titular registrado: dados preservados, acesso bloqueado até a validação.
const hasPendingOwnership = (company) => !onlyDigits(company?.owner_cpf);

// Leitura e entrada na empresa exigem vínculo confirmado (titular ou gestor).
const canReadCompany = (actor, company) =>
  isCompanyOwner(actor, company) || isCompanyManager(actor, company);

// Desativar ou reativar exige o mesmo vínculo: não existe exceção.
const canManageCompany = (actor, company) =>
  isCompanyOwner(actor, company) || isCompanyManager(actor, company);

// Autorizar a concessão de gestão exige vínculo com a empresa: o titular
// registrado ou um administrador da própria empresa. Ter criado o registro
// não autoriza nada.
const canAuthorizeCompany = (actor, company) => {
  const actorCpf = onlyDigits(actor?.cpf);
  if (!actorCpf) return false;
  if (isCompanyOwner(actor, company)) return true;
  return actor?.access_role === 'admin' && String(actor?.company_id || '') === String(company?.id || '');
};

const fail = (status, error) => Response.json({ error }, { status });
const ok = (data) => Response.json({ ok: true, ...data });

async function employeeAdmin(base44, token) {
  const loaded = await loadSession(base44, token);
  if (loaded.error) return { response: fail(loaded.status, loaded.error) };
  const { session, actor } = loaded;
  const companyId = scopeCompany(session, actor);
  if (!companyId) return { response: fail(403, 'sem_empresa') };
  if (!MANAGEMENT_ROLES.includes(actor.access_role)) return { response: fail(403, 'sem_permissao') };
  const company = await base44.asServiceRole.entities.Company.get(companyId)
    .catch(e => e.status === 404 ? null : Promise.reject(e));
  if (!company || company.status === 'inativa') return { response: fail(403, 'sem_empresa') };
  // A conta mestre escolhe a empresa na sessão, então o vínculo é conferido aqui.
  // Para os demais perfis a empresa vem do próprio cadastro do funcionário.
  if (actor.access_role === 'master' && !canReadCompany(actor, company)) {
    return { response: fail(403, 'empresa_nao_autorizada') };
  }
  return { actor, companyId, entities: base44.asServiceRole.entities };
}

async function scopedRecord(entity, id, companyId) {
  if (typeof id !== 'string' || !id || id.length > 128) return null;
  const row = await entity.get(id).catch((error) => {
    if (error.status === 404) return null;
    throw error;
  });
  return row?.company_id === companyId ? row : null;
}

function employeeRow(employee) {
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

function employeeDetails(employee) {
  const details = employeeRow(employee);
  for (const field of [...TEXT_FIELDS, ...DATE_FIELDS, 'weekly_hours', 'dependents']) {
    if (employee[field] != null) details[field] = employee[field];
  }
  return details;
}

function employeeInput(input) {
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

function managedEmployee(actor, target, role, status) {
  const targetRole = target?.access_role || 'funcionario';
  if (targetRole === 'master') return false;
  if (actor.access_role === 'gerente' && (targetRole !== 'funcionario' || role !== 'funcionario')) return false;
  if (target?.id === actor.id && (role !== targetRole || status === 'desligado')) return false;
  return targetRole !== 'admin' || (role === 'admin' && status !== 'desligado');
}


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
    if (body.expected_company_id && body.expected_company_id !== companyId) return fail(409, 'empresa_alterada');
    if (action === 'check') return ok({});
    if (!['quick', 'save', 'delete'].includes(action)) return fail(400, 'acao_invalida');
    const existing = body.id === undefined ? null : await scopedRecord(Employee, body.id, companyId);
    if ((body.id !== undefined || action === 'delete') && !existing) return fail(404, 'funcionario_inexistente');

    if (action === 'delete') {
      if (existing.id === actor.id || ['admin', 'master'].includes(existing.access_role) ||
        !managedEmployee(actor, existing, existing.access_role || 'funcionario', existing.status)) {
        return fail(403, 'exclusao_bloqueada');
      }
      const history = await Promise.all(HISTORY.map(async (entity) => {
        const rows = await entities[entity].filter({ employee_id: existing.id }, 'id', 1);
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
    // O acesso inicial é sempre definido pelo gestor, inclusive no cadastro completo.
    if ((action === 'quick' || !existing || password) && (password.length < 6 || password.length > 128)) {
      return fail(400, 'senha_invalida');
    }
    // Nunca confiar no campo username enviado pelo navegador; o login é por CPF.
    data.username = cpf;

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
      const password_hash = await newPasswordHash(password);
      if (target) {
        const changed = await Employee.updateMany({id:target.id,company_id:companyId,cpf,status:{$ne:'desligado'},
          $and:[
            {$or:[{access_role:'funcionario'},{access_role:null},{access_role:{$exists:false}}]},
            {$or:[{password_hash:''},{password_hash:null},{password_hash:{$exists:false}}]},
          ]},{$set:{password_hash, username:cpf, credential_version:crypto.randomUUID()}});
        if (changed.updated !== 1) return fail(409,'cpf_ja_tem_acesso');
        return ok({employee:employeeRow({...target,password_hash})});
      }
      const employee = await createChecked(Employee, { ...data, cpf, username:cpf, company_id: companyId, access_role: 'funcionario', status: 'ativo', password_hash });
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
    if (password) {
      if (existing?.id === actor.id || (existing?.access_role === 'admin' && actor.access_role !== 'master'))
        return fail(403, 'perfil_protegido');
      data.password_hash = await newPasswordHash(password);
      data.credential_version = crypto.randomUUID();
    }

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
