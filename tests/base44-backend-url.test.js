import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBase44BackendUrl, CONTAFLOW_BACKEND_ORIGIN } from '../src/lib/base44BackendUrl.js';

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
