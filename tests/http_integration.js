import assert from 'node:assert/strict';
import { attendance, fixture } from './fixture.js';
import { newPasswordHash } from '../base44/shared/passwords.ts';
import authCpf from '../base44/functions/authCpf/entry.ts';
import createCompany from '../base44/functions/createCompany/entry.ts';
import manageCompany from '../base44/functions/manageCompany/entry.ts';
import enterCompany from '../base44/functions/enterCompany/entry.ts';
import listCompanies from '../base44/functions/listCompanies/entry.ts';
import listEmployees from '../base44/functions/listEmployees/entry.ts';
import payrollService from '../base44/functions/payrollService/entry.ts';
import employeePortal from '../base44/functions/employeePortal/entry.ts';
import rhService from '../base44/functions/rhService/entry.ts';
import diagnostics from '../base44/functions/diagnostics/entry.ts';
import companyAccess from '../base44/functions/companyAccess/entry.ts';
import { EXPECTED_PAYROLL_RELEASE } from '../src/lib/payrollServiceVersion.js';

Deno.test('integração HTTP local: login, criação e seleção de empresa, funcionários, folha e contracheque', async () => {
  const db = fixture();
  const cpf = '52998224725';
  const password = 'senha-ficticia-exclusiva-deste-teste';
  db.Employee[0].dependents = [];
  db.Employee.push({
    id: 'master', full_name: 'Mestre de teste', access_role: 'master', cpf,
    password_hash: await newPasswordHash(password),
  });
  attendance(db);
  const routes = {
    authCpf, createCompany, manageCompany, enterCompany, listCompanies, listEmployees, payrollService, employeePortal,
  };
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, (request) => {
    const name = new URL(request.url).pathname.split('/').at(-1);
    return Object.hasOwn(routes, name) ? routes[name](request) : new Response(null, { status: 404 });
  });
  const url = `http://127.0.0.1:${server.addr.port}/functions/`;
  const invoke = async (functionName, body, expectedStatus = 200) => {
    const response = await fetch(url + functionName, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, `${functionName}/${body.action || 'default'}: ${payload.error || ''}`);
    return payload;
  };

  try {
    const probe = await fetch(url + 'payrollService');
    assert.equal(probe.status, 405);
    assert.equal(probe.headers.get('X-ContaFlow-Payroll-Release'), EXPECTED_PAYROLL_RELEASE);
    await probe.body.cancel();
    const { token } = await invoke('authCpf', { action: 'login', cpf, password });
    const { companies } = await invoke('listCompanies', { token });
    assert.deepEqual(companies.map(({ id }) => id).sort(), ['A']);
    // Empresa B é de outro proprietário: não aparece, não abre e não muda de estado.
    await invoke('enterCompany', { token, company_id: 'B' }, 403);
    await invoke('manageCompany', { action: 'delete', id: 'B', token }, 403);
    await invoke('manageCompany', { action: 'restore', id: 'B', token }, 403);
    const companyInput = {
      name: 'Empresa fictícia', owner_name: 'Pessoa de teste', owner_cpf: '15350946056', owner_password: password,
    };
    await invoke('createCompany', { ...companyInput, token: 'worker' }, 403);
    const { company } = await invoke('createCompany', { ...companyInput, token });
    const resumed = await invoke('createCompany', { ...companyInput, token });
    assert.equal(resumed.company.id, company.id);
    const { token: ownerToken } = await invoke('authCpf', {
      action: 'login', cpf: companyInput.owner_cpf, password,
    });
    const ownerEmployees = await invoke('listEmployees', { token: ownerToken });
    assert.ok(ownerEmployees.employees.every(({ id }) => id !== 'worker' && id !== 'other'));
    db.Company.push({ id: 'inactive', status: 'inativa', owner_cpf: cpf });
    await invoke('enterCompany', { token, company_id: 'inactive' }, 403);
    await invoke('manageCompany', { action: 'restore', id: 'inactive', token: 'worker' }, 403);
    await invoke('manageCompany', { action: 'restore', id: 'inactive', token });
    await invoke('enterCompany', { token, company_id: 'inactive' });
    await invoke('enterCompany', { token, company_id: 'A' });
    const { employees } = await invoke('listEmployees', { token });
    assert.ok(employees.some(({ id }) => id === 'worker'));
    assert.ok(employees.every(({ id }) => id !== 'other'));
    await invoke('payrollService', { action: 'release' }, 401);
    const scope = { token, expected_company_id: 'A' };
    const { payroll } = await invoke('payrollService', {
      ...scope, action: 'calculate', automatic: true, competence: '2026-01', employee_id: 'worker',
    });
    const target = { ...scope, payroll_id: payroll.id };
    await invoke('payrollService', { ...target, action: 'approve' }, 422);
    await invoke('payrollService', { ...target, action: 'confirmPaymentDate', payment_date: '2026-02-05' });
    await invoke('payrollService', { ...target, action: 'approve' });
    await invoke('payrollService', { ...target, action: 'finalize' });
    const payslip = { action: 'payslip', competence: '2026-01' };
    assert.equal((await invoke('employeePortal', { ...payslip, token: 'worker' })).payroll.id, payroll.id);
    assert.equal((await invoke('employeePortal', { ...payslip, token: 'other' })).payroll, null);
    assert.equal(db.Payroll.length, 1);
  } finally {
    await server.shutdown();
  }
});

Deno.test('titularidade: mestre não lista, não abre, não desativa e não reativa empresa de outro dono', async () => {
  const db = fixture();
  const password = 'senha-ficticia-exclusiva-deste-teste';
  const cpfA = '52998224725';
  const cpfB = '39053344705';
  db.Employee.push(
    { id: 'masterA', full_name: 'Mestre A', access_role: 'master', cpf: cpfA, password_hash: await newPasswordHash(password) },
    { id: 'masterB', full_name: 'Mestre B', access_role: 'master', cpf: cpfB, password_hash: await newPasswordHash(password) },
  );
  const routes = {
    authCpf, createCompany, manageCompany, enterCompany, listCompanies,
    listEmployees, payrollService, rhService, diagnostics,
  };
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, (request) => {
    const name = new URL(request.url).pathname.split('/').at(-1);
    return Object.hasOwn(routes, name) ? routes[name](request) : new Response(null, { status: 404 });
  });
  const url = `http://127.0.0.1:${server.addr.port}/functions/`;
  const invoke = async (functionName, body, expectedStatus = 200) => {
    const response = await fetch(url + functionName, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, `${functionName}/${body.action || 'default'}: ${payload.error || ''}`);
    return payload;
  };

  try {
    const { token: tokenA } = await invoke('authCpf', { action: 'login', cpf: cpfA, password });
    const { token: tokenB } = await invoke('authCpf', { action: 'login', cpf: cpfB, password });

    assert.deepEqual((await invoke('listCompanies', { token: tokenA })).companies.map(({ id }) => id), ['A']);
    assert.deepEqual((await invoke('listCompanies', { token: tokenB })).companies.map(({ id }) => id), ['B']);

    await invoke('enterCompany', { token: tokenA, company_id: 'B' }, 403);
    await invoke('enterCompany', { token: tokenB, company_id: 'A' }, 403);
    await invoke('manageCompany', { token: tokenA, action: 'delete', id: 'B' }, 403);
    await invoke('manageCompany', { token: tokenB, action: 'delete', id: 'A' }, 403);
    await invoke('manageCompany', { token: tokenA, action: 'restore', id: 'B' }, 403);
    await invoke('manageCompany', { token: tokenB, action: 'restore', id: 'A' }, 403);

    assert.equal(db.Company.find(({ id }) => id === 'B').status, 'ativa');
    assert.equal(db.Company.find(({ id }) => id === 'A').status, 'ativa');

    // Cada dono opera normalmente dentro da própria empresa.
    await invoke('enterCompany', { token: tokenA, company_id: 'A' });
    await invoke('manageCompany', { token: tokenA, action: 'delete', id: 'A' });
    assert.equal(db.Company.find(({ id }) => id === 'A').status, 'inativa');
    assert.equal(db.Company.find(({ id }) => id === 'B').status, 'ativa');

    // Cadastrar a empresa do cliente NÃO concede acesso ao criador.
    const companyInput = {
      name: 'Empresa do cliente', owner_name: 'Cliente de teste', owner_cpf: '15350946056', owner_password: password,
    };
    const { company } = await invoke('createCompany', { ...companyInput, token: tokenB });
    const created = db.Company.find(({ id }) => id === company.id);
    assert.deepEqual(created.managed_by_cpf || [], [], 'criador não se torna gestor');
    assert.equal(created.owner_cpf, companyInput.owner_cpf, 'titularidade não é alterada pelo criador');
    await invoke('enterCompany', { token: tokenB, company_id: company.id }, 403);
    await invoke('enterCompany', { token: tokenA, company_id: company.id }, 403);

    await invoke('manageCompany', { token: tokenA, action: 'restore', id: 'A' });

    // Sessão apontando para empresa de outro dono não lê funcionários, folha nem relatórios.
    const sessionA = db.AuthSession.find((row) => row.employee_id === 'masterA');
    sessionA.company_id = 'B';
    await invoke('listEmployees', { token: tokenA }, 403);
    await invoke('payrollService', { token: tokenA, action: 'release' }, 403);
    await invoke('rhService', { token: tokenA, action: 'time', employee_id: 'worker' }, 403);
    sessionA.company_id = 'A';
    const ownEmployees = await invoke('listEmployees', { token: tokenA });
    assert.ok(Array.isArray(ownEmployees.employees));

    // Empresa sem titular: dados preservados, nenhum dado pessoal exposto.
    db.Company.push({ id: 'semTitular', status: 'ativa' });
    db.Employee.push({
      id: 'pendente', company_id: 'semTitular', access_role: 'funcionario',
      full_name: 'Fantasma Pendente', cpf: '39053344705', status: 'ativo',
    });
    db.TimeRecord.push({
      id: 'mk-pendente', company_id: 'semTitular', employee_id: 'ghost-pendente',
      date: '2026-10-01', kind: 'entry', original_time: '08:00',
    });
    assert.deepEqual((await invoke('listCompanies', { token: tokenA })).companies.map(({ id }) => id), ['A']);
    await invoke('enterCompany', { token: tokenA, company_id: 'semTitular' }, 403);

    const diag = await invoke('diagnostics', { token: tokenA });
    const pendente = diag.pending_companies.find((row) => row.ownership === 'sem_titular' && row.counts.employees === 1);
    assert.ok(pendente, 'empresa sem titular aparece no diagnóstico mínimo');
    assert.equal('id' in pendente, false, 'sem identificador de empresa de terceiro');
    assert.equal(pendente.counts.time_records, 1);
    assert.equal(JSON.stringify(diag.pending_companies).includes('Fantasma'), false);
    assert.equal(JSON.stringify(diag.pending_companies).includes('39053344705'), false);
    assert.equal(diag.integrity.employees, 3, 'só entram funcionários de empresa com vínculo');
    assert.equal(diag.environment.function, 'diagnostics');
    assert.equal(diag.release, EXPECTED_PAYROLL_RELEASE);
  } finally {
    await server.shutdown();
  }
});

Deno.test('concessão de gestão exige autorização comprovada e fica auditada', async () => {
  const db = fixture();
  const password = 'senha-ficticia-exclusiva-deste-teste';
  const cpfTitular = '15350946056';
  const cpfAdmin = '11144477735';
  const cpfMestre = '06213684409';
  const cpfDonoY = '14717871413';
  db.Company.push(
    { id: 'X', name: 'Empresa X', status: 'ativa', owner_cpf: cpfTitular, owner_name: 'Titular X' },
    { id: 'Y', name: 'Empresa Y', status: 'ativa', owner_cpf: cpfDonoY, owner_name: 'Dono Y' },
  );
  db.Employee.push(
    { id: 'titularX', full_name: 'Titular X', cpf: cpfTitular, access_role: 'admin', company_id: 'X', status: 'ativo', password_hash: await newPasswordHash(password) },
    { id: 'adminX', full_name: 'Admin X', cpf: cpfAdmin, access_role: 'admin', company_id: 'X', status: 'ativo', password_hash: await newPasswordHash(password) },
    { id: 'donoY', full_name: 'Dono Y', cpf: cpfDonoY, access_role: 'admin', company_id: 'Y', status: 'ativo', password_hash: await newPasswordHash(password) },
    { id: 'mestreZ', full_name: 'Mestre Z', cpf: cpfMestre, access_role: 'master', status: 'ativo', password_hash: await newPasswordHash(password) },
  );
  const routes = { authCpf, companyAccess, listCompanies, enterCompany };
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, (request) => {
    const name = new URL(request.url).pathname.split('/').at(-1);
    return Object.hasOwn(routes, name) ? routes[name](request) : new Response(null, { status: 404 });
  });
  const url = `http://127.0.0.1:${server.addr.port}/functions/`;
  const invoke = async (functionName, body, expectedStatus = 200) => {
    const response = await fetch(url + functionName, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, `${functionName}/${body.action || 'default'}: ${payload.error || ''}`);
    return payload;
  };

  try {
    const login = async (cpf) => (await invoke('authCpf', { action: 'login', cpf, password })).token;
    const tTitular = await login(cpfTitular);
    const tAdmin = await login(cpfAdmin);
    const tMestre = await login(cpfMestre);
    const tDonoY = await login(cpfDonoY);

    // Sem vínculo não se concede nada; ninguém concede a si mesmo.
    await invoke('companyAccess', { action: 'grant', token: tMestre, company_id: 'X', manager_cpf: cpfMestre }, 403);
    await invoke('companyAccess', { action: 'grant', token: tDonoY, company_id: 'X', manager_cpf: cpfMestre }, 403);
    await invoke('companyAccess', { action: 'grant', token: tTitular, company_id: 'X', manager_cpf: cpfTitular }, 400);
    await invoke('companyAccess', { action: 'grant', token: tTitular, company_id: 'X', manager_cpf: cpfAdmin }, 409);

    // Antes da autorização o mestre não lista nem abre a empresa.
    assert.deepEqual((await invoke('listCompanies', { token: tMestre })).companies.map(({ id }) => id), []);
    await invoke('enterCompany', { token: tMestre, company_id: 'X' }, 403);

    // Autorização dada pelo titular registrado.
    const granted = await invoke('companyAccess', { action: 'grant', token: tTitular, company_id: 'X', manager_cpf: cpfMestre });
    assert.deepEqual(granted.company.managers.map(({ cpf }) => cpf), [cpfMestre]);
    const after = db.Company.find(({ id }) => id === 'X');
    assert.deepEqual(after.managed_by_cpf, [cpfMestre]);
    assert.equal(after.owner_cpf, cpfTitular, 'titularidade não é alterada');
    assert.deepEqual(
      { action: after.access_audit[0].action, by: after.access_audit[0].by_cpf, source: after.access_audit[0].source },
      { action: 'grant', by: cpfTitular, source: 'titular' },
    );

    // O acesso passa a valer imediatamente.
    assert.deepEqual((await invoke('listCompanies', { token: tMestre })).companies.map(({ id }) => id), ['X']);
    await invoke('enterCompany', { token: tMestre, company_id: 'X' });

    // Administrador da empresa também autoriza; a auditoria registra a origem.
    assert.equal((await invoke('companyAccess', { action: 'grant', token: tAdmin, company_id: 'X', manager_cpf: cpfMestre })).resumed, true);
    await invoke('companyAccess', { action: 'revoke', token: tAdmin, company_id: 'X', manager_cpf: cpfMestre });
    const revoked = db.Company.find(({ id }) => id === 'X');
    assert.deepEqual(revoked.managed_by_cpf, []);
    assert.equal(revoked.access_audit.at(-1).source, 'administrador_da_empresa');
    assert.equal(revoked.access_audit.length, 2, 'concessão e revogação ficam registradas');

    // Revogado, o mestre perde a empresa na hora.
    await invoke('enterCompany', { token: tMestre, company_id: 'X' }, 403);
    assert.deepEqual((await invoke('listCompanies', { token: tMestre })).companies.map(({ id }) => id), []);
  } finally {
    await server.shutdown();
  }
});
