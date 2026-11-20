import test from 'node:test';
import assert from 'node:assert/strict';
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
