import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { loadSession } from '../../shared/sessionGuard.ts';
import { onlyDigits } from '../../shared/cpf.ts';
import { canAuthorizeCompany, isCompanyOwner } from '../../shared/companyAccess.ts';

const fail = (status, error) => Response.json({ error }, { status });
const rows = (page) => (Array.isArray(page) ? page : page?.items || []);

// Concessão de gestão (managed_by_cpf) com autorização comprovada: só o titular
// registrado (owner_cpf) ou um administrador da própria empresa concede ou
// revoga, sempre a partir da sessão de quem autoriza. A titularidade nunca é
// alterada e cada operação fica registrada em access_audit.
export default async function (req) {
  if (req.method !== 'POST') return fail(405, 'metodo_invalido');
  try {
    const body = await req.json().catch(() => ({}));
    const client = createClientFromRequest(req);
    const loaded = await loadSession(client, body?.token);
    if (loaded.error) return fail(loaded.status, loaded.error);
    const actor = loaded.actor;
    const { Company, Employee } = client.asServiceRole.entities;

    const describe = async (company) => {
      const managers = (Array.isArray(company.managed_by_cpf) ? company.managed_by_cpf : [])
        .map((value) => onlyDigits(value)).filter(Boolean).slice(0, 5);
      const found = await Promise.allSettled(managers.map((cpf) => Employee.filter({ cpf }, 'created_date', 2)));
      return {
        id: company.id,
        name: company.name || '',
        status: company.status || 'ativa',
        owner_name: company.owner_name || '',
        owner_cpf: company.owner_cpf || '',
        managers: managers.map((cpf, index) => ({
          cpf,
          name: rows(found[index]?.status === 'fulfilled' ? found[index].value : [])
            .find((row) => row.access_role === 'master')?.full_name || '',
        })),
        audit: (Array.isArray(company.access_audit) ? company.access_audit : []).slice(-10).reverse(),
      };
    };

    if (!body?.action || body.action === 'list') {
      const companies = rows(await Company.filter({}, 'name', 200));
      const allowed = companies.filter((company) => canAuthorizeCompany(actor, company));
      return Response.json({ ok: true, companies: await Promise.all(allowed.map(describe)) });
    }
    if (!['grant', 'revoke'].includes(body.action)) return fail(400, 'acao_invalida');

    const companyId = String(body?.company_id || '').trim();
    if (!companyId) return fail(400, 'empresa_invalida');
    const company = await Company.get(companyId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!company) return fail(404, 'empresa_inexistente');
    if (!canAuthorizeCompany(actor, company)) return fail(403, 'sem_permissao');

    const managerCpf = onlyDigits(body?.manager_cpf);
    if (managerCpf.length !== 11) return fail(400, 'cpf_invalido');
    if (managerCpf === onlyDigits(actor.cpf)) return fail(400, 'autoconcessao');

    const current = (Array.isArray(company.managed_by_cpf) ? company.managed_by_cpf : [])
      .map((value) => onlyDigits(value)).filter(Boolean);
    const audit = Array.isArray(company.access_audit) ? company.access_audit : [];
    const entry = {
      action: body.action,
      cpf: managerCpf,
      by_cpf: onlyDigits(actor.cpf),
      by_role: actor.access_role || '',
      source: isCompanyOwner(actor, company) ? 'titular' : 'administrador_da_empresa',
      at: new Date().toISOString(),
    };

    if (body.action === 'grant') {
      const accounts = rows(await Employee.filter({ cpf: managerCpf }, 'created_date', 2));
      if (!accounts.some((row) => row.access_role === 'master' && row.status !== 'desligado')) {
        return fail(409, 'gestor_invalido');
      }
      if (current.includes(managerCpf)) return Response.json({ ok: true, resumed: true, company: await describe(company) });
      await Company.update(company.id, {
        managed_by_cpf: [...current, managerCpf],
        access_audit: [...audit, entry].slice(-50),
      });
    } else {
      if (!current.includes(managerCpf)) return Response.json({ ok: true, resumed: true, company: await describe(company) });
      await Company.update(company.id, {
        managed_by_cpf: current.filter((cpf) => cpf !== managerCpf),
        access_audit: [...audit, entry].slice(-50),
      });
    }

    const updated = await Company.get(company.id);
    return Response.json({ ok: true, company: await describe(updated) });
  } catch {
    return fail(503, 'falha_servidor');
  }
}
