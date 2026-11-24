import { onlyDigits } from './cpf.ts';

// Titular: o CPF registrado na empresa é o mesmo da conta.
export const isCompanyOwner = (actor, company) => {
  const actorCpf = onlyDigits(actor?.cpf);
  const ownerCpf = onlyDigits(company?.owner_cpf);
  return Boolean(actorCpf) && Boolean(ownerCpf) && actorCpf === ownerCpf;
};

// Gestor autorizado: vínculo explícito gravado na empresa no momento em que ela
// foi cadastrada. Nunca é inferido nem criado automaticamente.
export const isCompanyManager = (actor, company) => {
  const actorCpf = onlyDigits(actor?.cpf);
  if (!actorCpf) return false;
  return (Array.isArray(company?.managed_by_cpf) ? company.managed_by_cpf : [])
    .some((value) => onlyDigits(value) === actorCpf);
};

// Empresa sem titular registrado: dados preservados, acesso bloqueado até a validação.
export const hasPendingOwnership = (company) => !onlyDigits(company?.owner_cpf);

// Leitura e entrada na empresa exigem vínculo confirmado (titular ou gestor).
export const canReadCompany = (actor, company) =>
  isCompanyOwner(actor, company) || isCompanyManager(actor, company);

// Desativar ou reativar exige o mesmo vínculo: não existe exceção.
export const canManageCompany = (actor, company) =>
  isCompanyOwner(actor, company) || isCompanyManager(actor, company);

// Autorizar a concessão de gestão exige vínculo com a empresa: o titular
// registrado ou um administrador da própria empresa. Ter criado o registro
// não autoriza nada.
export const canAuthorizeCompany = (actor, company) => {
  const actorCpf = onlyDigits(actor?.cpf);
  if (!actorCpf) return false;
  if (isCompanyOwner(actor, company)) return true;
  return actor?.access_role === 'admin' && String(actor?.company_id || '') === String(company?.id || '');
};
