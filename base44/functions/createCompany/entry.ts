import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { onlyDigits, isValidCpf } from '../../shared/cpf.ts';
import { newPasswordHash, verifyPassword } from '../../shared/passwords.ts';
import { loadSession } from '../../shared/sessionGuard.ts';

const fail = (status, error) => Response.json({ error }, { status });
const blank = (field) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] });
const clean = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');
  try {
    const body = await req.json().catch(() => ({}));
    const client = createClientFromRequest(req);
    const loaded = await loadSession(client, body?.token);
    if (loaded.error) return fail(loaded.status, loaded.error);
    if (loaded.actor.access_role !== 'master') return fail(403, 'somente_mestre');

    const name = clean(body.name);
    const ownerName = clean(body.owner_name);
    const cpf = onlyDigits(body.owner_cpf);
    const password = body.owner_password;
    if (name.length < 2 || name.length > 150 || ownerName.length < 3 || ownerName.length > 200 || !isValidCpf(cpf)) {
      return fail(400, 'dados_invalidos');
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) return fail(400, 'senha_curta');

    const { Employee, Company } = client.asServiceRole.entities;
    const findOwners = () => Employee.filter({ cpf }, 'created_date', 2);
    const companyKey = { name, owner_cpf: cpf };
    const companies = await Company.filter({ owner_cpf: cpf }, 'created_date', 2);
    if (companies.length > 1 || (companies[0] && companies[0].name !== name)) return fail(409, 'cpf_ja_tem_acesso');
    let company = companies[0];
    if (company?.status === 'inativa') return fail(409, 'empresa_inativa');
    if (company?.owner_name && clean(company.owner_name) !== ownerName) return fail(409, 'dono_divergente');

    let owners = await findOwners();
    if (!owners.length) {
      // Só os campos da chave são escritos. Repetir a reserva nunca redefine senha ou vínculo.
      const claim = await Employee.upsert([{ cpf, full_name: ownerName, access_role: 'admin' }], { key: ['cpf', 'full_name', 'access_role'] });
      owners = await findOwners();
      if (owners.length > 1 && claim.created === 1) {
        // Remove somente a reserva vazia desta chamada se outro cadastro do CPF já existe.
        await Employee.deleteMany({ id: claim.records[0].id, cpf, access_role: 'admin',
          $and: [blank('company_id'), blank('password_hash')] });
        return fail(409, 'cpf_ja_tem_acesso');
      }
    }
    let owner = owners[0];
    if (owners.length !== 1 || owner.access_role !== 'admin' || clean(owner.full_name) !== ownerName ||
        owner.status === 'desligado') return fail(409, 'cpf_ja_tem_acesso');

    // Uma atualização condicional escolhe a empresa antes de criar qualquer Company.
    // A reserva não tem senha e não pode iniciar sessão.
    const reservation = 'criando:' + name;
    if (!owner.company_id && !owner.password_hash) {
      await Employee.updateMany({ id: owner.id, access_role: 'admin', $and: [blank('company_id'), blank('password_hash')] },
        { $set: { company_id: reservation } });
      owner = await Employee.get(owner.id);
    }
    if (!company && owner.company_id !== reservation) {
      [company] = await Company.filter(companyKey, 'created_date', 1);
    }
    if (owner.company_id !== reservation && (!company || owner.company_id !== company.id)) {
      return fail(409, 'cpf_ja_tem_acesso');
    }

    if (!company) {
      const result = await Company.upsert([companyKey], { key: ['name', 'owner_cpf'] });
      company = result.records[0];
    }
    // Cadastrar a empresa NÃO concede acesso a ela. O vínculo de gestão
    // (managed_by_cpf) só pode ser gravado com autorização do titular legítimo,
    // nunca por quem apenas criou o registro.
    const resumed = Boolean(owners[0]?.password_hash || companies.length);
    if (!owner.password_hash) {
      await Employee.updateMany({ id: owner.id, cpf, access_role: 'admin', status: { $ne: 'desligado' },
        company_id: owner.company_id, ...blank('password_hash') },
        { $set: { company_id: company.id, status: 'ativo', password_hash: await newPasswordHash(password) } });
    }
    owner = await Employee.get(owner.id);
    if (owner.company_id !== company.id || owner.access_role !== 'admin' || owner.status === 'desligado' ||
        !await verifyPassword(owner.password_hash, cpf, password)) return fail(409, 'dono_divergente');

    if (!company.owner_name) await Company.update(company.id, { owner_name: ownerName });
    return Response.json({ ok: true, resumed, company: { id: company.id, name, owner_name: ownerName, owner_cpf: cpf, status: company.status || 'ativa' } });
  } catch {
    return fail(503, 'confirmacao_pendente');
  }
}
