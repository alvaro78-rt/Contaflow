import assert from 'node:assert/strict';
import test from 'node:test';
import { lastClosedCompetence, payrollFormProblems, suggestedCompetence, competenceAdmissionProblem } from '../src/lib/payrollPreflight.js';

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

test('seleciona a primeira competência possível sem aceitar mês ainda aberto', () => {
  assert.equal(suggestedCompetence('2026-08', '2026-10-16', '2026-10'), '2026-10');
  assert.equal(suggestedCompetence('2026-10', '2026-11-10', '2026-10'), '2026-10');
  assert.equal(suggestedCompetence('2026-10', '2026-07-09', '2026-10'), '2026-10');
});

test('informa admissão posterior ao mês e permite o mês de admissão encerrado', () => {
  assert.match(competenceAdmissionProblem('2026-10', '2026-11-10', '2026-10'), /Ainda não existe/);
  assert.equal(competenceAdmissionProblem('2026-10', '2026-10-16', '2026-10'), '');
  assert.match(competenceAdmissionProblem('2026-09', '2026-10-16', '2026-10'), /2026-10/);
  assert.match(competenceAdmissionProblem('2026-11', '2026-10-16', '2026-10'), /não está encerrada/);
});
