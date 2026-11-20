import test from 'node:test';
import assert from 'node:assert/strict';
import { describePayrollServerFailure } from '../src/lib/payrollFailure.js';

test('identifica falha na consulta de folha e impede nova tentativa cega', () => {
  const result = describePayrollServerFailure({ error: 'falha_servidor', stage: 'consulta_folha' }, 500);
  assert.match(result.message, /histórico/);
  assert.equal(result.stage, 'consulta_folha');
});
test('erro ao gravar avisa para consultar histórico', () => {
  const result = describePayrollServerFailure({ error: 'falha_servidor', stage: 'gravacao_folha' }, 500);
  assert.match(result.message, /folhas anteriores/);
});
test('nao mostra informações arbitrárias recebidas da API', () => {
  const result = describePayrollServerFailure({ error: 'falha_servidor', stage: 'TOKEN-CPF-SENHA' }, 500);
  assert.equal(result.stage, 'versao_sem_diagnostico');
  assert.doesNotMatch(JSON.stringify(result), /TOKEN-CPF-SENHA/);
});
test('respostas normais nao sao classificadas como falha 500', () => {
  assert.equal(describePayrollServerFailure({ error: 'sessao_expirada' }, 401), null);
});
