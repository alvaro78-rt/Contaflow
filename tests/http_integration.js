import assert from 'node:assert/strict';
import { attendance, fixture } from './fixture.js';
import { newPasswordHash } from '../base44/shared/passwords.ts';
import authCpf from '../base44/functions/authCpf/entry.ts';
import enterCompany from '../base44/functions/enterCompany/entry.ts';
import listCompanies from '../base44/functions/listCompanies/entry.ts';
import listEmployees from '../base44/functions/listEmployees/entry.ts';
import payrollService from '../base44/functions/payrollService/entry.ts';
import employeePortal from '../base44/functions/employeePortal/entry.ts';
import { EXPECTED_PAYROLL_RELEASE } from '../src/lib/payrollServiceVersion.js';

Deno.test('integração HTTP local: login, empresa, permissões, folha e contracheque', async () => {
  const db = fixture();
  const cpf = '52998224725';
  const password = 'senha-ficticia-exclusiva-deste-teste';
  db.Employee[0].dependents = [];
  db.Employee.push({
    id: 'master', full_name: 'Mestre de teste', access_role: 'master', cpf,
    password_hash: await newPasswordHash(password),
  });
  attendance(db);
  const routes = { authCpf, enterCompany, listCompanies, listEmployees, payrollService, employeePortal };
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
    assert.deepEqual(companies.map(({ id }) => id).sort(), ['A', 'B']);
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
