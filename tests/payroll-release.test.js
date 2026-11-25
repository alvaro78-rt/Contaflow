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

test('tela de folha valida a versao internamente, sem verificacao visivel', () => {
  const source = readFileSync(new URL('../src/pages/PayrollGenerate.jsx', import.meta.url), 'utf8');
  assert.equal(source.includes('checkBackend'), false);
  assert.equal(source.includes('Verificar backend'), false);
  assert.equal(source.includes('Processamento bloqueado'), false);
  assert.equal(source.includes('Diagnóstico técnico'), false);
  // A versão é conferida sozinha antes do cálculo, sem botão e sem exibir a marca.
  assert.match(source, /action: 'release'/);
  assert.match(source, /expected_release: EXPECTED_PAYROLL_RELEASE/);
  assert.ok(source.indexOf("action: 'release'") < source.indexOf("action: 'calculate'"));
  assert.equal(source.includes('{release}'), false);
  assert.equal(source.includes('release}'), false);
  assert.match(source, /action: 'calculate'/);

  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const adminGroup = app.indexOf('<Route element={<AdminOnly />}>');
  const diagnostics = app.indexOf('path="/diagnostico"');
  assert.ok(adminGroup >= 0);
  assert.ok(diagnostics > adminGroup);
  assert.ok(diagnostics < app.indexOf('<Route path="*"'));
});

test('release esperado corresponde exatamente a marca do backend atual', () => {
  // A marca vive em um único módulo compartilhado; o handler precisa consumi-la.
  const shared = readFileSync(new URL('../base44/shared/payrollRelease.ts', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../base44/functions/payrollService/entry.ts', import.meta.url), 'utf8');
  assert.ok(shared.includes(EXPECTED_PAYROLL_RELEASE));
  assert.match(backend, /from '\.\.\/\.\.\/shared\/payrollRelease\.ts'/);
  assert.match(backend, /if \(action === 'release'\)/);
  // Cliente e servidor em versões diferentes não calculam nem gravam nada.
  assert.match(backend, /body\.expected_release !== PAYROLL_SERVICE_RELEASE/);
  assert.match(backend, /versao_desatualizada/);
});
test('falha na consulta de versão impede cálculo em vez de ignorar a proteção', () => {
  const source = readFileSync(new URL('../src/pages/PayrollGenerate.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.catch\(\(\) => null\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*?classifyPayrollRelease\(null, error\)/);
  assert.match(source, /classifyPayrollRelease\(release\) !== 'current'/);
  assert.ok(source.indexOf("classifyPayrollRelease(release) !== 'current'") < source.indexOf("action: 'calculate'"));
});

test('aprovação e finalização também exigem versão conferida antes de enviar gravação', () => {
  const actions = readFileSync(new URL('../src/components/payroll/PayrollActions.jsx', import.meta.url), 'utf8');
  assert.match(actions, /action: 'release'/);
  assert.match(actions, /classifyPayrollRelease\(release\) !== 'current'/);
  assert.match(actions, /expected_release: EXPECTED_PAYROLL_RELEASE/);
  assert.ok(actions.indexOf("action: 'release'") < actions.indexOf("action,\n        expected_release"));
});
