import assert from 'node:assert/strict';
import test from 'node:test';
import { describeLoginFailure } from '../src/lib/loginDiagnostics.js';

test('identifica bloqueio da plataforma sem vazar dados da chamada', () => {
  const result = describeLoginFailure({ response: { status: 403, data: { cpf: 'SEGREDO', password: 'SENHA' } } });
  assert.match(result.message, /Base44 negou/);
  assert.equal(result.diagnostic, 'authCpf · HTTP 403');
  assert.doesNotMatch(JSON.stringify(result), /SEGREDO|SENHA/);
});
test('mostra falha interna pelo codigo seguro', () => {
  const result = describeLoginFailure({ response: { status: 500, data: { error: 'falha_servidor' } } });
  assert.equal(result.diagnostic, 'authCpf · Código: falha_servidor');
});
test('nao exibe texto arbitrario da resposta', () => {
  const result = describeLoginFailure({ response: { status: 400, data: { error: 'TOKEN_PRIVADO' } } });
  assert.equal(result.diagnostic, 'authCpf · HTTP 400');
});
test('nao confunde tentativas excessivas com senha errada', () => {
  const result = describeLoginFailure({ response: { status: 429, data: { error: 'muitas_tentativas' } } });
  assert.match(result.message, /bloqueio temporário/);
});
