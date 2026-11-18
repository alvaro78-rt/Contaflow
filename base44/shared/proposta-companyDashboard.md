# Leitura no servidor — APLICADA

A função `companyDashboard` foi criada em `base44/functions/companyDashboard/entry.ts` e o retorno de
`listCompanies` já inclui `owner_linked`. O cadastro de empresa segue bloqueado no servidor
(`CRIACAO_LIBERADA = false` em `createCompany`). O texto abaixo fica como referência do que foi implementado.

## 1. Nova função `companyDashboard` (1ª leitura do painel do dono)

Criar em `base44/functions/companyDashboard/entry.ts`.

Deriva empresa e perfil da sessão validada; devolve somente o que o painel usa.

```ts
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Leitura do primeiro painel do dono. Empresa e perfil vêm da sessão validada aqui,
// nunca do navegador. Campos devolvidos: company, profile, counts, competence, payroll.
export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    if (!token) return Response.json({ error: 'sessao_invalida' }, { status: 401 });

    const { items: sessions } = await base44.asServiceRole.entities.AuthSession.filter({ token }, { limit: 1 });
    const session = sessions[0];
    if (!session || !session.employee_id) {
      return Response.json({ error: 'sessao_invalida' }, { status: 401 });
    }
    if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return Response.json({ error: 'sessao_expirada' }, { status: 401 });
    }

    const actor = await base44.asServiceRole.entities.Employee
      .get(session.employee_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!actor) return Response.json({ error: 'sessao_invalida' }, { status: 401 });
    if (!actor.company_id) return Response.json({ error: 'sem_empresa' }, { status: 403 });

    // A empresa é sempre a do cadastro: o corpo da requisição não escolhe empresa.
    const company = await base44.asServiceRole.entities.Company
      .get(actor.company_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!company) return Response.json({ error: 'empresa_nao_encontrada' }, { status: 404 });

    const d = new Date();
    const competence = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    const [ativos, afastados, semAcesso, folhas, finalizadas] = await Promise.all([
      base44.asServiceRole.entities.Employee.count({ company_id: company.id, status: 'ativo' }),
      base44.asServiceRole.entities.Employee.count({ company_id: company.id, status: 'afastado' }),
      base44.asServiceRole.entities.Employee.count({ company_id: company.id, password_hash: { $exists: false } }),
      base44.asServiceRole.entities.Payroll.count({ company_id: company.id, competence }),
      base44.asServiceRole.entities.Payroll.count({ company_id: company.id, competence, status: 'finalizada' }),
    ]);

    const agg = await base44.asServiceRole.entities.Payroll.aggregate({
      query: { company_id: company.id, competence },
      sum: ['total_earnings', 'total_deductions', 'net_salary'],
    });
    const row = (agg && agg.rows && agg.rows[0]) || {};

    return Response.json({
      ok: true,
      company: { id: company.id, name: company.name || '', status: company.status || 'ativa' },
      profile: { name: actor.full_name || '', role: actor.access_role || 'funcionario' },
      counts: { ativos, afastados, sem_acesso: semAcesso },
      competence,
      payroll: {
        folhas,
        finalizadas,
        proventos: row.sum_total_earnings || 0,
        descontos: row.sum_total_deductions || 0,
        liquido: row.sum_net_salary || 0,
      },
      read_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}
```

Depois de aprovada e publicada, o painel do dono já lê sozinho: `OwnerPanel` chama
`companyDashboard` e hoje mostra “leitura ainda não aprovada” enquanto a função não existir.

## 2. Ajuste em `listCompanies` (confirmar o vínculo do dono)

Acrescentar ao retorno, para o mestre conseguir fechar o “cadastro pendente de confirmação”:

```ts
const { items: owners } = await base44.asServiceRole.entities.Employee.filter(
  { company_id: { $in: items.map((c) => c.id) }, access_role: 'admin' },
  { limit: 500 },
);

const companies = items.map((c) => ({
  id: c.id,
  name: c.name || '',
  owner_name: c.owner_name || '',
  owner_cpf: c.owner_cpf || '',
  status: c.status || 'ativa',
  owner_linked: owners.some((o) => o.company_id === c.id && o.cpf === c.owner_cpf && Boolean(o.password_hash)),
}));
```

Com `owner_linked`, o formulário passa a confirmar o vínculo pela lista em vez de indicar
“cadastro pendente de confirmação”. Enquanto não for aprovado, a lista não confirma nada.
