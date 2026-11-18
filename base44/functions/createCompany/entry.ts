import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { hashPassword, onlyDigits } from '../../shared/authHelpers.ts';
import { isValidCpf } from '../../shared/cpf.ts';

// Cadastro de empresa bloqueado no servidor até existir garantia de operação única:
// duas requisições simultâneas podem duplicar a empresa, e uma falha depois do
// Company.create deixa a empresa criada sem dono. Enquanto isto for false, nada é gravado.
const CRIACAO_LIBERADA = false;

const shape = (company: any) => ({
  id: company.id,
  name: company.name || '',
  owner_name: company.owner_name || '',
  owner_cpf: company.owner_cpf || '',
  status: company.status || 'ativa',
});

export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));

    const token = String(body?.token || '').trim();
    const name = String(body?.name || '').trim();
    const ownerName = String(body?.owner_name || '').trim();
    const ownerCpf = onlyDigits(body?.owner_cpf);
    const ownerPassword = String(body?.owner_password || '');

    if (!token) return Response.json({ error: 'sessao_invalida' }, { status: 401 });
    if (name.length < 2 || ownerName.length < 3 || !isValidCpf(ownerCpf)) {
      return Response.json({ error: 'dados_invalidos' }, { status: 400 });
    }
    if (ownerPassword.length < 6) {
      return Response.json({ error: 'senha_curta' }, { status: 400 });
    }

    // 1. Sessão emitida no login por CPF, verificada no servidor.
    const { items: sessions } = await base44.asServiceRole.entities.AuthSession.filter(
      { token },
      { limit: 1 },
    );
    const session = sessions[0];
    if (!session || !session.employee_id) {
      return Response.json({ error: 'sessao_invalida' }, { status: 401 });
    }
    if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return Response.json({ error: 'sessao_expirada' }, { status: 401 });
    }

    // 2. Perfil lido do banco — o navegador não informa papel nenhum.
    const actor = await base44.asServiceRole.entities.Employee
      .get(session.employee_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!actor || actor.access_role !== 'master') {
      return Response.json({ error: 'somente_mestre' }, { status: 403 });
    }

    if (!CRIACAO_LIBERADA) {
      return Response.json({ error: 'criacao_bloqueada' }, { status: 409 });
    }

    // 3. Retomada: empresa já criada numa tentativa anterior (mesmo nome e CPF do dono).
    const { items: existing } = await base44.asServiceRole.entities.Company.filter(
      { name, owner_cpf: ownerCpf },
      { limit: 1 },
    );
    let company = existing[0] || null;
    let resumed = false;

    if (company) {
      const { items: owners } = await base44.asServiceRole.entities.Employee.filter(
        { company_id: company.id, cpf: ownerCpf },
        { limit: 1 },
      );
      if (owners[0]) {
        return Response.json({ ok: true, resumed: true, company: shape(company) });
      }
      resumed = true;
    }

    // CPF com acesso já criado fora desta empresa não pode ser duplicado.
    const { items: sameCpf } = await base44.asServiceRole.entities.Employee.filter(
      { cpf: ownerCpf },
      { limit: 10 },
    );
    const conflito = sameCpf.some((emp) => emp.password_hash && emp.company_id !== company?.id);
    if (conflito) {
      return Response.json({ error: 'cpf_ja_tem_acesso' }, { status: 409 });
    }

    if (!company) {
      company = await base44.asServiceRole.entities.Company.create({
        name,
        owner_name: ownerName,
        owner_cpf: ownerCpf,
        status: 'ativa',
      });
    }

    // 4. Vínculo do dono: só responde sucesso depois que este cadastro existe.
    await base44.asServiceRole.entities.Employee.create({
      company_id: company.id,
      full_name: ownerName,
      cpf: ownerCpf,
      access_role: 'admin',
      status: 'ativo',
      password_hash: await hashPassword(ownerCpf, ownerPassword),
    });

    return Response.json({ ok: true, resumed, company: shape(company) });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}