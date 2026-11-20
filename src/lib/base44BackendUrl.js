// Uma chamada a /functions no dominio administrativo app.base44.com pode receber 403
// antes de executar a funcao. Use sempre o dominio publicado do aplicativo.
// Em hospedagens externas (como Vercel), a origem da pagina nao e o backend.
export const CONTAFLOW_BACKEND_ORIGIN = 'https://contabilidade-1.base44.app';

const parseOrigin = (value) => {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
};
const isPlatformHost = (host) => host === 'app.base44.com' || host === 'base44.com';
const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1';

export function resolveBase44BackendUrl({ pageOrigin = '', configuredUrl = '' } = {}) {
  const page = parseOrigin(pageOrigin);
  const configured = parseOrigin(configuredUrl);

  // base44 dev pode disponibilizar um gateway local, se explicitamente configurado.
  if (page && isLocalHost(page.hostname) && configured && isLocalHost(configured.hostname)) {
    return configured.origin;
  }

  // App hospedado pelo Base44: o mesmo dominio deve rotear functions.invoke().
  if (page && page.protocol === 'https:' && page.hostname.endsWith('.base44.app')) {
    return page.origin;
  }

  // Url configurada para o backend: nunca envie funcoes ao dominio de controle.
  if (configured && !isPlatformHost(configured.hostname) && configured.protocol === 'https:' &&
      (configured.hostname.endsWith('.base44.app') || !configured.hostname.endsWith('.vercel.app'))) {
    return configured.origin;
  }

  // No Vercel e em outros sites estaticos, use a origem propria do backend.
  return CONTAFLOW_BACKEND_ORIGIN;
}
