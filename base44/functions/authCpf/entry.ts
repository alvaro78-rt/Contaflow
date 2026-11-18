import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { onlyDigits } from '../../shared/authHelpers.ts';
import { isValidCpf } from '../../shared/cpf.ts';
import { newPasswordHash, verifyPassword } from '../../shared/passwords.ts';

// Token opaco de sessão: sem dados do usuário embutidos, só o registro no servidor vale.
const issueToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

// Instalação provisionada: existindo qualquer conta ou empresa, o cadastro inicial não reabre.
const isProvisioned = async (base44) => {
  const [contas, empresas] = await Promise.all([
    base44.asServiceRole.entities.Employee.filter({}, { limit: 1 }),
    base44.asServiceRole.entities.Company.filter({}, { limit: 1 }),
  ]);
  return contas.items.length > 0 || empresas.items.length > 0;
};

export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  try {
    if (action === 'masterExists') {
      // Conta desligada ou excluída não reabre o cadastro: basta existir conta ou empresa.
      return Response.json({ exists: await isProvisioned(base44) });
    }

    if (action === 'activate') {
      const cpf = onlyDigits(body.cpf);
      const birth = String(body.birth_date || '');
      const password = body.password;
      if (!isValidCpf(cpf) || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || body.accepted !== true ||
          typeof password !== 'string' || password.length < 6 || password.length > 128) {
        return Response.json({ error: 'dados_invalidos' }, { status: 400 });
      }
      const { Employee } = base44.asServiceRole.entities;
      const candidates = await Employee.filter({ cpf }, 'created_date', 2);
      const employee = candidates[0];
      const deny = () => Response.json({ error: 'ativacao_indisponivel' }, { status: 409 });
      if (candidates.length !== 1 || !employee.company_id || employee.birth_date !== birth ||
          (employee.access_role || 'funcionario') !== 'funcionario' || employee.status === 'desligado' || employee.password_hash) return deny();

      const company = await base44.asServiceRole.entities.Company.get(employee.company_id).catch(e => e.status === 404 ? null : Promise.reject(e));
      if (!company || company.status === 'inativa') return deny();
      const result = await Employee.updateMany({
        id: employee.id, cpf, birth_date: birth, company_id: employee.company_id, status: { $ne: 'desligado' },
        $and: [
          { $or: [{ access_role: 'funcionario' }, { access_role: { $exists: false } }, { access_role: null }] },
          { $or: [{ password_hash: { $exists: false } }, { password_hash: null }, { password_hash: '' }] },
        ],
      }, { $set: { password_hash: await newPasswordHash(password), terms_accepted: true, terms_accepted_at: new Date().toISOString() } });
      if (result.updated !== 1) return deny();
      return Response.json({ ok: true });
    }

    if (action === 'login') {
      const cpf = onlyDigits(body?.cpf);
      const password = String(body?.password || '');
      if (cpf.length !== 11 || !password) {
        return Response.json({ error: 'credenciais_incompletas' }, { status: 400 });
      }
      // Dígitos verificadores conferidos no servidor, com zeros à esquerda preservados.
      if (!isValidCpf(cpf)) {
        return Response.json({ error: 'cpf_invalido' }, { status: 400 });
      }

      const { items } = await base44.asServiceRole.entities.Employee.filter({ cpf }, { limit: 10 });
      const comSenha = items.filter((item) => item.password_hash);
      // O login pede apenas CPF e senha: o mesmo CPF não pode apontar para duas contas.
      if (comSenha.length > 1) {
        return Response.json({ error: 'cpf_duplicado' }, { status: 409 });
      }

      const emp = comSenha[0];
      const ok = emp ? await verifyPassword(emp.password_hash, cpf, password) : false;
      if (!emp || !ok) {
        const semAcesso = items.length > 0 && comSenha.length === 0;
        return Response.json({ error: semAcesso ? 'sem_acesso' : 'credenciais' }, { status: 401 });
      }

      // Conta desligada não entra, mesmo com a senha certa.
      if (emp.status === 'desligado') {
        return Response.json({ error: 'conta_desligada' }, { status: 403 });
      }

      let companyName = '';
      if (emp.company_id) {
        const company = await base44.asServiceRole.entities.Company
          .get(emp.company_id)
          .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
        if (emp.access_role !== 'master' && (!company || company.status === 'inativa')) {
          return Response.json({ error: 'empresa_inativa' }, { status: 403 });
        }
        companyName = company?.name || '';
      }

      const token = issueToken();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      await base44.asServiceRole.entities.AuthSession.deleteMany({ employee_id: emp.id });
      await base44.asServiceRole.entities.AuthSession.create({
        token,
        employee_id: emp.id,
        role: emp.access_role || 'funcionario',
        expires_at: expiresAt,
      });

      // Nunca devolve hash de senha.
      return Response.json({
        ok: true,
        token,
        expires_at: expiresAt,
        employee: {
          id: emp.id,
          full_name: emp.full_name,
          access_role: emp.access_role || 'funcionario',
          company_id: emp.company_id || '',
          company_name: companyName,
        },
      });
    }

    return Response.json({ error: 'acao_invalida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}