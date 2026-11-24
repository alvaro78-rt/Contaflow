import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('sem marcações comprovadas o serviço recusa gerar folha, sem prévia nem persistência', () => {
  const src = read('../base44/functions/payrollService/entry.ts');
  const start = src.indexOf('if (!conference && marks.items.length === 0 && !draft) {');
  const section = src.slice(start, src.indexOf('let calendarPaidDays ='));
  assert.ok(start > 0);
  assert.match(section, /ponto_sem_registros/);
  assert.match(section, /status: 422/);
  assert.doesNotMatch(section, /buildPayroll|Payroll\.create|preview_only/);
  // A frequência só é apurada por conferência autorizada ou por marcações completas.
  assert.match(src, /AttendanceConference\.filter/);
  assert.match(src, /status: 'autorizada'/);
  assert.match(src, /validateConference\(conference/);
  assert.match(src, /attendance_source: conference \? 'conferencia' : 'ponto'/);
});

test('inclusão manual de ponto exige justificativa e chama função autorizada do servidor', () => {
  const src = read('../src/components/time/TimeMarkForm.jsx');
  assert.match(src, /rh\(session, 'addMark'/);
  assert.match(src, /reason: reason\.trim\(\)/);
  assert.doesNotMatch(src, /base44\.entities\.TimeRecord\.create/);
  assert.doesNotMatch(src, /Simular leitura biométrica/);
});

test('correção de marcação também usa backend auditado', () => {
  const src = read('../src/pages/TimeCorrection.jsx');
  assert.match(src, /rh\(session, 'correctMark'/);
  assert.doesNotMatch(src, /base44\.entities\.TimeRecord\.update/);
});

test('tela de folha orienta consulta do ponto, não exibe simulação como folha real', () => {
  const src = read('../src/pages/PayrollGenerate.jsx');
  assert.match(src, /Conferir ponto do mês/);
  assert.match(src, /!response\.data\.payroll\.id/);
  assert.doesNotMatch(src, /setMessage\('Prévia não salva/);
});

test('o recibo não exibe valores de prévias antigas como se fossem folha real', () => {
  const src = read('../src/components/payroll/PayrollSheet.jsx');
  assert.match(src, /if \(p\.preview_only\)/);
  assert.doesNotMatch(src, /SIMULAÇÃO — NÃO É FOLHA DE PAGAMENTO/);
});
