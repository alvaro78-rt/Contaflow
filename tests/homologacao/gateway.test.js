import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createGateway, fakeAccounts, fakePassword } from './gateway.js';

test('login e módulos do ContaFlow usam o banco SQLite isolado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'contaflow-gateway-'));
  const path = join(directory, 'ficticio.sqlite');
  let gateway = await createGateway(path);
  const server = createServer(async (req, res) => {
    try {
      const name = req.url.slice(1);
      const response = await gateway.invoke(name, new Request('http://127.0.0.1' + req.url, {
        method: 'POST', body: Buffer.concat(await Array.fromAsync(req)),
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(500).end();
    }
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const invoke = async (name, payload, status = 200) => {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name, {
        method: 'POST', body: JSON.stringify(payload),
      });
      const data = await response.json();
      assert.equal(response.status, status, name + '/' + (payload.action || '') + ': ' + data.error);
      return data;
    };
    const login = (role) => invoke('authCpf', { action: 'login', cpf: fakeAccounts[role], password: fakePassword });
    const { token } = await login('master');
    const { token: worker } = await login('worker');
    const { token: rh } = await login('rh');
    const companies = await invoke('listCompanies', { token });
    assert.deepEqual(companies.companies.map(({ id }) => id).sort(), ['A', 'B']);
    await invoke('enterCompany', { token, company_id: 'A' });
    const panel = await invoke('companyDashboard', { token });
    assert.equal(panel.company.id, 'A');
    const { employees } = await invoke('listEmployees', { token });
    assert.ok(employees.some(({ id }) => id === 'worker'));
    assert.ok(employees.every(({ id }) => id !== 'other'));
    const scope = { token: rh, expected_company_id: 'A' };
    const period = { employee_id: 'worker', competence: '2026-01' };
    const marks = await invoke('rhService', { ...scope, ...period, action: 'time' });
    assert.ok(marks.items.length > 0);
    await invoke('rhService', { ...scope, ...period, action: 'time', token: worker }, 403);
    await invoke('rhService', { ...scope, action: 'legalTables' });
    const { payroll } = await invoke('payrollService', { ...scope, ...period, action: 'calculate', automatic: true });
    const target = { ...scope, payroll_id: payroll.id };
    await invoke('payrollService', { ...target, action: 'confirmPaymentDate', payment_date: '2026-02-05' });
    await invoke('payrollService', { ...target, action: 'approve' });
    await invoke('payrollService', { ...target, action: 'finalize' });
    gateway.close();
    gateway = await createGateway(path);
    const result = await invoke('employeePortal', { token: worker, action: 'payslip', competence: period.competence });
    assert.equal(result.payroll.id, payroll.id);
    await invoke('authCpf', { token: worker, action: 'logout' });
    await invoke('employeePortal', { token: worker, action: 'attendance' }, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    gateway.close();
    await rm(directory, { recursive: true });
  }
});
