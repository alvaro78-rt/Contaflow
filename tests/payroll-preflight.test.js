import assert from 'node:assert/strict';
import test from 'node:test';
import { lastClosedCompetence, payrollFormProblems } from '../src/lib/payrollPreflight.js';

const now = new Date('2026-11-19T21:00:00Z');
const correct = {
  competence: '2026-10',
  paymentDate: '2026-11-05',
  taxDependents: '0',
  dsrExtra: '0',
  dsrDiscount: '0',
  reviewedInputs: true,
};

test('competência padrão é o último mês encerrado no horário de Recife', () => {
  assert.equal(lastClosedCompetence(now), '2026-10');
  assert.equal(lastClosedCompetence(new Date('2026-01-02T12:00:00Z')), '2025-12');
  assert.equal(lastClosedCompetence(new Date('2026-11-01T01:00:00Z')), '2026-09');
});

test('campos confirmados com valores zero são aceitos na apresentação', () => {
  assert.deepEqual(payrollFormProblems(correct, now), []);
});

test('não permite processar competência em aberto', () => {
  const problems = payrollFormProblems({ ...correct, competence: '2026-11' }, now);
  assert.match(problems.join(' '), /ainda não terminou/);
});

test('orienta campos ausentes antes de chamar o servidor', () => {
  const problems = payrollFormProblems({
    competence: '2026-10',
    paymentDate: '',
    taxDependents: '',
    dsrExtra: '',
    dsrDiscount: '',
    reviewedInputs: false,
  }, now);
  assert.equal(problems.length, 5);
});

test('rejeita pagamento anterior ao fechamento, data impossível e DSR fracionado', () => {
  const problems = payrollFormProblems({
    ...correct,
    paymentDate: '2026-10-29',
    dsrExtra: '0.001',
    taxDependents: '1.5',
  }, now);
  assert.equal(problems.length, 3);
  assert.match(payrollFormProblems({ ...correct, paymentDate: '2026-02-31' }, now).join(' '), /data prevista/);
});
