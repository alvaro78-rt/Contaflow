import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('o painel e o login exibem a marca ContaFlow, sem a marca antiga', () => {
  for (const path of [
    'src/components/Layout.jsx',
    'src/components/auth/AuthShell.jsx',
    'src/pages/Companies.jsx',
    'index.html',
  ]) {
    const value = source(path);
    assert.doesNotMatch(value, /Folha<|Ledger|Base44 APP/);
    assert.match(value, /ContaFlow|Conta<span/);
  }
});

test('a conta mestre tem acesso a criar empresas a partir do painel', () => {
  const value = source('src/components/dashboard/CompanyPanel.jsx');
  assert.match(value, /session\?\.master/);
  assert.match(value, /to="\/empresas#criar"/);
  assert.match(value, /to="\/empresas"/);
  assert.match(value, /visibleModules\.map/);
});

test('trocar de empresa nao altera a sessao antes da escolha', () => {
  const value = source('src/components/Layout.jsx');
  assert.match(value, /navigate\('\/empresas'\)/);
  assert.doesNotMatch(value, /enterCompany/);
  assert.doesNotMatch(value, /login\(\{ \.\.\.session, company_id: ''/);
});

test('tela de empresas mantem criacao, entrada, desativacao e restauracao', () => {
  const companies = source('src/pages/Companies.jsx');
  const app = source('src/App.jsx');
  assert.match(companies, /id="criar"/);
  assert.match(companies, /manage\('create'\)/);
  assert.match(companies, /manage\('delete'/);
  assert.match(companies, /manage\('restore'/);
  assert.match(companies, /functions\.invoke\('enterCompany'/);
  assert.match(app, /<RequireMaster \/>/);
  assert.match(app, /path="\/empresas"/);
});
