import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBase44AppId, resolveBase44BackendUrl, resolveBase44FunctionsVersion, CONTAFLOW_APP_ID, CONTAFLOW_BACKEND_ORIGIN } from '../src/lib/base44BackendUrl.js';

test('no dominio Base44 usa a origem do proprio site publicado para funcoes', () => {
  assert.equal(resolveBase44BackendUrl({
    pageOrigin: 'https://contabilidade-1.base44.app',
    configuredUrl: 'https://app.base44.com',
  }), CONTAFLOW_BACKEND_ORIGIN);
});

test('ignora dominio administrativo da plataforma (403)', () => {
  assert.equal(resolveBase44BackendUrl({
    pageOrigin: 'https://contaflow-alvaro-8627.vercel.app',
    configuredUrl: 'https://app.base44.com',
  }), CONTAFLOW_BACKEND_ORIGIN);
});

test('site externo sem URL configurada usa backend Base44', () => {
  assert.equal(resolveBase44BackendUrl({ pageOrigin: 'https://contaflow-hazel-nine.vercel.app' }), CONTAFLOW_BACKEND_ORIGIN);
});

test('usa gateway local somente se explicitamente configurado para desenvolvimento', () => {
  assert.equal(resolveBase44BackendUrl({
    pageOrigin: 'http://localhost:5173',
    configuredUrl: 'http://127.0.0.1:4400',
  }), 'http://127.0.0.1:4400');
});

test('dominio personalizado de backend configurado e preservado', () => {
  assert.equal(resolveBase44BackendUrl({
    pageOrigin: 'https://contaflow-alvaro-8627.vercel.app',
    configuredUrl: 'https://app.exemplo.com',
  }), 'https://app.exemplo.com');
});

test('URL invalida nao volta a usar dominio administrativo', () => {
  assert.equal(resolveBase44BackendUrl({
    pageOrigin: 'http://localhost:5173',
    configuredUrl: 'invalid-url',
  }), CONTAFLOW_BACKEND_ORIGIN);
});


test('build hospedado do ContaFlow aponta para o App ID mesmo sem variável da Vercel', () => {
  for (const pageOrigin of [CONTAFLOW_BACKEND_ORIGIN, 'https://contaflow-hazel-nine.vercel.app', 'https://contaflow-2afvx7kdw-alvaro-8627.vercel.app']) {
    assert.equal(resolveBase44AppId({ pageOrigin }), CONTAFLOW_APP_ID);
  }
  assert.equal(resolveBase44AppId({ pageOrigin: 'http://localhost:5173' }), undefined);
  assert.equal(resolveBase44AppId({ pageOrigin: 'https://outra-empresa.vercel.app' }), undefined);
  assert.equal(resolveBase44AppId({ pageOrigin: CONTAFLOW_BACKEND_ORIGIN, configuredAppId: 'app-isolado' }), 'app-isolado');
});

test('somente prévia do Base44 lê versão de funções do endereço', () => {
  const search = '?functions_version=antiga';
  assert.equal(resolveBase44FunctionsVersion({ pageOrigin: CONTAFLOW_BACKEND_ORIGIN, search }), undefined);
  assert.equal(resolveBase44FunctionsVersion({ pageOrigin: 'https://contaflow-hazel-nine.vercel.app', search }), undefined);
  assert.equal(resolveBase44FunctionsVersion({ pageOrigin: 'https://preview--contabilidade-1.base44.app', search }), 'antiga');
  assert.equal(resolveBase44FunctionsVersion({ pageOrigin: 'https://preview-sandbox--6ae7c2d5ff47db9e2bde7c3e.base44.app', search }), 'antiga');
  assert.equal(resolveBase44FunctionsVersion({ pageOrigin: CONTAFLOW_BACKEND_ORIGIN, search, configuredVersion: 'configurada' }), 'configurada');
});
