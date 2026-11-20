import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDashboardError } from '../src/lib/dashboardError.js';

test('orienta escolher empresa ao receber sem_empresa', () => {
  const x = describeDashboardError({ response: { status: 403, data: { error: 'sem_empresa' } } });
  assert.equal(x.chooseCompany, true);
  assert.equal(x.details, 'Código: sem_empresa');
});
test('identifica falha de backend e HTTP 500 sem vazar mensagem do servidor', () => {
  const x = describeDashboardError({ response: { status: 500, data: { error: 'falha_servidor', token: 'segredo' } } });
  assert.match(x.message, /companyDashboard/);
  assert.doesNotMatch(JSON.stringify(x), /segredo/);
});
test('mostra HTTP 404 para funcao nao publicada', () => {
  assert.match(describeDashboardError({ response: { status: 404 } }).message, /não foi encontrada/);
});
test('mantem erro desconhecido seguro para o usuario', () => {
  const result = describeDashboardError({ code: 'SQL_PRIVATE_MESSAGE', response: { status: 400 } });
  assert.equal(result.details, 'HTTP 400');
  assert.doesNotMatch(JSON.stringify(result), /SQL_PRIVATE_MESSAGE/);
});
