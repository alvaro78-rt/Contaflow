import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyPayrollRelease, EXPECTED_PAYROLL_RELEASE } from '../src/lib/payrollServiceVersion.js';

test('identifica a lógica atual sem autenticação adicional', () => {
  assert.equal(classifyPayrollRelease({ data: { ok: true, release: EXPECTED_PAYROLL_RELEASE } }), 'current');
});
test('detecta versão anterior autenticada', () => {
  assert.equal(classifyPayrollRelease({ data: { ok: true, release: 'legacy' } }), 'outdated');
});
test('detecta endpoint antigo sem ação release', () => {
  assert.equal(classifyPayrollRelease(null, { response: { status: 400, data: { error: 'acao_invalida' } } }), 'outdated');
  assert.equal(classifyPayrollRelease(null, { response: { status: 404 } }), 'outdated');
});
test('não confunde falha de autenticação/rede com versão antiga', () => {
  assert.equal(classifyPayrollRelease(null, { response: { status: 401, data: { error: 'sessao_invalida' } } }), 'unknown');
  assert.equal(classifyPayrollRelease(null, new Error('network')), 'unknown');
});

test('botao de processar so envia calculo depois de validar release do backend', () => {
  const source = readFileSync(new URL('../src/pages/PayrollGenerate.jsx', import.meta.url), 'utf8');
  const preflight = source.indexOf('if (!await checkBackend())');
  const calculate = source.indexOf("action: 'calculate'");
  assert.ok(preflight >= 0);
  assert.ok(calculate > preflight);
  assert.match(source, /Verificar backend \(sem gravar\)/);
  assert.match(source, /Processamento bloqueado/);
});

test('release esperado corresponde exatamente a marca do backend atual', () => {
  const backend = readFileSync(new URL('../base44/functions/payrollService/entry.ts', import.meta.url), 'utf8');
  assert.ok(backend.includes(EXPECTED_PAYROLL_RELEASE));
  assert.match(backend, /if \(action === 'release'\)/);
});
