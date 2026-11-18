import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const client = createClient({
  appId,
  token,
  functionsVersion,
  // Em hospedagem externa, as chamadas precisam chegar ao backend Base44.
  serverUrl: appBaseUrl || 'https://app.base44.com',
  appBaseUrl
});

// Acesso sem filtro de empresa: telas de entrada e a área da conta mestre.
export const unscoped = client;

const SCOPED = new Set(['Employee', 'Position', 'WorkSchedule', 'Rubric', 'Payroll', 'TimeRecord', 'Vacation', 'ThirteenthSalary', 'Termination']);

const activeCompanyId = () => {
  try {
    return JSON.parse(localStorage.getItem('folha_session'))?.company_id || null;
  } catch {
    return null;
  }
};

const withCompany = (query, companyId) => ({ ...(query || {}), company_id: companyId });

const scopeEntity = (name, entity) => new Proxy(entity, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value !== 'function') return value;
    const companyId = SCOPED.has(name) ? activeCompanyId() : null;
    if (!companyId) return value.bind(target);
    switch (prop) {
      case 'create':
        return (data) => value.call(target, withCompany(data, companyId));
      case 'bulkCreate':
        return (rows) => value.call(target, (rows || []).map((row) => withCompany(row, companyId)));
      case 'filter':
        return (query, options) => value.call(target, withCompany(query, companyId), options);
      case 'count':
        return (query) => value.call(target, withCompany(query, companyId));
      case 'aggregate':
        return (options) => value.call(target, { ...options, query: withCompany(options?.query, companyId) });
      case 'deleteMany':
        return (query) => value.call(target, withCompany(query, companyId));
      case 'updateMany':
        return (query, update) => value.call(target, withCompany(query, companyId), update);
      default:
        return value.bind(target);
    }
  }
});

const scopedEntities = new Proxy(client.entities, {
  get(target, prop) {
    const entity = target[prop];
    if (!entity || typeof entity !== 'object') return entity;
    return scopeEntity(prop, entity);
  }
});

export const base44 = new Proxy(client, {
  get(target, prop) {
    if (prop === 'entities') return scopedEntities;
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  }
});