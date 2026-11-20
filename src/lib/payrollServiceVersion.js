// Versão funcional do endpoint de folha. Não representa a versão do site na Vercel.
export const EXPECTED_PAYROLL_RELEASE = '2026-11-20-payroll-attendance-v1';

// Diferencia a função antiga de falhas de autenticação/rede sem fazer alterações.
export function classifyPayrollRelease(response, error = null) {
  const actual = response?.data?.release;
  if (actual === EXPECTED_PAYROLL_RELEASE) return 'current';
  if (typeof actual === 'string' && actual.length > 0) return 'outdated';
  const code = error?.response?.data?.error ?? error?.data?.error;
  const status = error?.response?.status ?? error?.status;
  if (code === 'acao_invalida' || status === 404) return 'outdated';
  return 'unknown';
}
