import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCompaniesError } from '../src/lib/companiesError.js';

test('lista de empresas identifica 403 sem expor dados da resposta', () => {
  const result = describeCompaniesError({
    response: { status: 403, data: { error: 'somente_mestre', token: 'SEGREDO' } },
  });
  assert.match(result.message, /conta mestre/);
  assert.equal(result.details, 'Código: somente_mestre');
  assert.doesNotMatch(JSON.stringify(result), /SEGREDO/);
});

test('erro do servidor e da funcao nao publicada produzem dicas diferentes', () => {
  assert.match(describeCompaniesError({ response: { status: 500 } }).message, /listCompanies/);
  assert.match(describeCompaniesError({ response: { status: 404 } }).message, /listCompanies/);
});

test('nao mostra mensagens desconhecidas ou URL interna', () => {
  const result = describeCompaniesError({ response: { status: 418, data: { error: 'https://privado.local/segredo' } } });
  assert.equal(result.details, 'HTTP 418');
  assert.doesNotMatch(JSON.stringify(result), /privado/);
});
