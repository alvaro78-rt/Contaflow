import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { onlyDigits } from '../../shared/authHelpers.ts';
import { attemptRecovery } from '../../shared/masterSwap.ts';

export default async function (req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'metodo_invalido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  try {
    const identity = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!identity) {
      return Response.json({ error: 'nao_autenticado' }, { status: 401 });
    }

    // Proprietário do app vem de Segredos (APP_OWNER_USER_ID) — nunca do código,
    // nunca do corpo da requisição. Ausente ou vazia, a recuperação não inicia.
    let ownerUserId = '';
    try {
      ownerUserId = String(secrets.get('APP_OWNER_USER_ID') || '').trim();
    } catch {
      ownerUserId = '';
    }
    if (!ownerUserId) {
      return Response.json({ error: 'configuracao_ausente' }, { status: 503 });
    }

    let expectedKey = '';
    try {
      expectedKey = secrets.get('MASTER_RECOVERY_KEY') || '';
    } catch {
      expectedKey = '';
    }

    const body = await req.json().catch(() => ({}));

    const store = {
      listMasters: async () => (
        await base44.asServiceRole.entities.Employee.filter({ access_role: 'master' }, { limit: 50 })
      ).items,
      findByCpf: async (cpf) => (
        await base44.asServiceRole.entities.Employee.filter({ cpf }, { limit: 20 })
      ).items,
      listClaims: async (fp) => (
        await base44.asServiceRole.entities.MasterRecovery.filter(
          { key_fingerprint: fp },
          { sort: 'created_date', limit: 20 },
        )
      ).items,
      getClaim: async (id) => base44.asServiceRole.entities.MasterRecovery.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
      createClaim: async (data) => base44.asServiceRole.entities.MasterRecovery.create(data),
      updateClaim: async (id, data) => base44.asServiceRole.entities.MasterRecovery.update(id, data),
      deleteClaim: async (id) => base44.asServiceRole.entities.MasterRecovery.delete(id),
      createEmployee: async (data) => base44.asServiceRole.entities.Employee.create(data),
      updateEmployee: async (id, data) => base44.asServiceRole.entities.Employee.update(id, data),
      deleteEmployee: async (id) => base44.asServiceRole.entities.Employee.delete(id),
      purgeSessions: async (employeeId) => base44.asServiceRole.entities.AuthSession.deleteMany({ employee_id: employeeId }),
    };

    const result = await attemptRecovery({
      identity,
      ownerUserId,
      expectedKey,
      suppliedKey: body?.key,
      newMaster: {
        fullName: body?.full_name,
        cpf: onlyDigits(body?.cpf),
        password: body?.password,
      },
      store,
      now: Date.now(),
    });

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: 'falha_servidor', message: error.message }, { status: 500 });
  }
}