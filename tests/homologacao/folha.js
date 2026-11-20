import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { attendance, fixture } from '../fixture.js';
import { openFixtureDatabase } from './sqlite-sdk.js';

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'npm:@base44/sdk@0.8.54') {
      return next(new URL('./sqlite-sdk.js', import.meta.url).href, context);
    }
    return next(specifier, context);
  },
});
const { default: payroll } = await import('../../base44/functions/payrollService/entry.ts');
const { default: portal } = await import('../../base44/functions/employeePortal/entry.ts');
hook.deregister();

test('folha e contracheque por HTTP com SQLite e empresas fictícias', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'contaflow-homologacao-'));
  const path = join(directory, 'ficticio.sqlite');
  const rows = fixture();
  rows.Employee[0].dependents = [];
  attendance(rows);
  const db = openFixtureDatabase(path, rows);
  const routes = new Map([['/payroll', payroll], ['/portal', portal]]);
  const server = createServer(async (req, res) => {
    const handler = routes.get(req.url);
    if (!handler) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await Array.fromAsync(req);
      const response = await handler(new Request('http://127.0.0.1' + req.url, {
        method: 'POST', body: Buffer.concat(body),
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(500).end();
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const invoke = async (route, body, status = 200) => {
      const response = await fetch(origin + route, { method: 'POST', body: JSON.stringify(body) });
      const payload = await response.json();
      assert.equal(response.status, status, payload.error);
      return payload;
    };
    const scope = { token: 'rh', expected_company_id: 'A' };
    const input = { action: 'calculate', automatic: true, competence: '2026-01', employee_id: 'worker' };
    await invoke('/payroll', { ...scope, ...input, token: 'worker' }, 403);
    await invoke('/payroll', { ...scope, ...input, employee_id: 'other' }, 404);
    const { payroll: draft } = await invoke('/payroll', { ...scope, ...input });
    const target = { ...scope, payroll_id: draft.id };
    await invoke('/payroll', { ...target, action: 'approve' }, 422);
    await invoke('/payroll', { ...target, action: 'confirmPaymentDate', payment_date: '2026-02-05' });
    await invoke('/payroll', { ...target, action: 'approve' });
    await invoke('/payroll', { ...target, action: 'finalize' });
    const payslip = { action: 'payslip', competence: input.competence };
    assert.equal((await invoke('/portal', { ...payslip, token: 'worker' })).payroll.id, draft.id);
    assert.equal((await invoke('/portal', { ...payslip, token: 'other' })).payroll, null);

    const reopened = new DatabaseSync(path, { readOnly: true });
    try {
      const saved = reopened.prepare("SELECT data FROM records WHERE entity = 'Payroll'").all();
      assert.equal(saved.length, 1);
      assert.equal(JSON.parse(saved[0].data).status, 'finalizada');
    } finally {
      reopened.close();
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    await rm(directory, { recursive: true });
  }
});
