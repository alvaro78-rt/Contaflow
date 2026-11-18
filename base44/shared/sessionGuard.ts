// Validação única da sessão por CPF: o token vem do corpo, mas quem é o usuário
// e qual empresa ele alcança saem sempre do banco (AuthSession + Employee).
export async function loadSession(base44, token) {
  const value = String(token || '').trim();
  if (!value) return { status: 401, error: 'sessao_invalida' };

  const { items } = await base44.asServiceRole.entities.AuthSession.filter({ token: value }, { limit: 1 });
  const session = items[0];
  if (!session || !session.employee_id) return { status: 401, error: 'sessao_invalida' };
  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return { status: 401, error: 'sessao_expirada' };
  }

  const actor = await base44.asServiceRole.entities.Employee
    .get(session.employee_id)
    .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  if (!actor) return { status: 401, error: 'sessao_invalida' };
  if (actor.status === 'desligado') return { status: 403, error: 'conta_desligada' };

  return { session, actor };
}

// Empresa em uso: o mestre usa a empresa escolhida na sessão; os demais, o próprio vínculo.
export function scopeCompany(session, actor) {
  if (actor.access_role === 'master') return String(session.company_id || '');
  return String(actor.company_id || '');
}

export const MANAGEMENT_ROLES = ['master', 'admin', 'gerente'];