import { EXPECTED_PAYROLL_RELEASE } from '../src/lib/payrollServiceVersion.js';

const origin = new URL(process.env.BASE44_SITE_URL || 'https://contabilidade-1.base44.app');
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.base44.app') || origin.username || origin.password) {
  throw new Error('Informe uma origem HTTPS *.base44.app em BASE44_SITE_URL.');
}
const checks = process.argv.slice(2);
if (checks.some((check) => !['backend', 'frontend'].includes(check))) {
  throw new Error('Use verificar-publicacao.mjs [backend] [frontend].');
}

const get = (path) => fetch(new URL(path, origin), {
  headers: { 'Cache-Control': 'no-cache' },
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
});

if (!checks.length || checks.includes('backend')) {
  const response = await get('/functions/payrollService');
  const active = response.headers.get('X-ContaFlow-Payroll-Release');
  await response.body?.cancel();
  if (response.status !== 405 || active !== EXPECTED_PAYROLL_RELEASE) {
    console.error(`payrollService: HTTP ${response.status}. Versão recebida: ${active ?? 'cabeçalho ausente'}. Versão esperada: ${EXPECTED_PAYROLL_RELEASE}.`);
    process.exitCode = 1;
  } else {
    console.log(`payrollService público: ${active}`);
  }
}

if (!checks.length || checks.includes('frontend')) {
  const response = await get('/login');
  const html = await response.text();
  if (!response.ok || !/<meta\s+name=["']contaflow-interface["']\s+content=["']contaflow["']/i.test(html)) {
    console.error(`Interface ContaFlow ainda não confirmada em /login (HTTP ${response.status}).`);
    process.exitCode = 1;
  } else {
    console.log('Interface ContaFlow confirmada em /login.');
  }
}
