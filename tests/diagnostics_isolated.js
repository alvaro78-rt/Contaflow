import assert from 'node:assert/strict';
import { attendance, calc, fixture } from './fixture.js';
import diagnostics from '../base44/functions/diagnostics/entry.ts';
import payrollService from '../base44/functions/payrollService/entry.ts';
import { EXPECTED_PAYROLL_RELEASE } from '../src/lib/payrollServiceVersion.js';

// Dados fictícios em ambiente isolado (memória). Nenhum registro real é tocado.
function withOrphans() {
  const db = fixture();
  attendance(db);
  const days = ['2026-01-05', '2026-01-06', '2026-01-07'];
  for (const date of days) {
    for (const [kind, time] of [['entry', '08:00'], ['break_start', '12:00'], ['break_end', '13:00'], ['exit', '17:00']]) {
      const row = { id: date + kind, company_id: 'A', employee_id: 'ghost', date, kind, original_time: time };
      db.TimeRecord.push(row);
      // Duplicidade intencional: mesma data + tipo repetidos.
      db.TimeRecord.push({ ...row, id: row.id + '-dup' });
    }
  }
  db.TimeRecord.push({ id: 'ghost-b', company_id: 'B', employee_id: 'ghost-b', date: '2026-01-05', kind: 'entry', original_time: '08:00' });
  db.Payroll.push({
    id: 'pghost', company_id: 'A', employee_id: 'ghost', competence: '2026-09',
    employee_name: 'Carlos Fantasma', employee_cpf: '00000000000', position_name: 'Auxiliar', status: 'finalizada',
  });
  return db;
}

function serve(routes) {
  return Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, (request) => {
    const name = new URL(request.url).pathname.split('/').at(-1);
    return Object.hasOwn(routes, name) ? routes[name](request) : new Response(null, { status: 404 });
  });
}

async function invokeAt(url, functionName, body) {
  const response = await fetch(url + functionName, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

Deno.test('diagnóstico somente leitura: autorização, versão publicada e reconciliação de órfãos', async () => {
  const db = withOrphans();
  const server = serve({ diagnostics });
  const url = `http://127.0.0.1:${server.addr.port}/functions/`;
  try {
    assert.equal((await invokeAt(url, 'diagnostics', {})).status, 401);
    assert.equal((await invokeAt(url, 'diagnostics', { token: 'manager' })).status, 403);
    assert.equal((await invokeAt(url, 'diagnostics', { token: 'worker' })).status, 403);

    const { status, payload } = await invokeAt(url, 'diagnostics', { token: 'rh' });
    assert.equal(status, 200);
    assert.equal(payload.read_only, true);
    assert.equal(payload.release, EXPECTED_PAYROLL_RELEASE);
    assert.equal(payload.session.scope, 'empresa_da_sessao');

    const orphan = payload.orphan_employees.find((row) => row.employee_id === 'ghost');
    assert.ok(orphan, 'marcações órfãs da empresa da sessão aparecem no relatório');
    assert.equal(orphan.total, 24);
    assert.equal(orphan.days, 3);
    assert.equal(orphan.duplicate_keys, 12);
    assert.equal(orphan.company.id, 'A');
    assert.equal(orphan.company.status, 'ativa');
    assert.equal(orphan.evidence[0].name, 'Carlos Fantasma');
    assert.equal(payload.time_records.linked_to_employee, db.TimeRecord.filter((r) => r.employee_id === 'worker').length);
    assert.equal(payload.time_records.orphan, 24);
    assert.ok(payload.orphan_payrolls.some((row) => row.name === 'Carlos Fantasma'));
  } finally {
    await server.shutdown();
  }
});

Deno.test('diagnóstico respeita o isolamento entre empresas', async () => {
  const db = withOrphans();
  const server = serve({ diagnostics });
  const url = `http://127.0.0.1:${server.addr.port}/functions/`;
  try {
    const own = await invokeAt(url, 'diagnostics', { token: 'rh' });
    assert.equal(own.payload.orphan_employees.length, 1);
    assert.equal(own.payload.orphan_employees[0].employee_id, 'ghost');
    // Admin não recebe detalhe nem contagem de empresa de terceiro.
    assert.deepEqual(own.payload.pending_companies, []);
    assert.equal(own.payload.pending_companies_total, 0);

    const other = await invokeAt(url, 'diagnostics', { token: 'other' });
    assert.equal(other.status, 403, 'funcionário sem gestão não acessa o diagnóstico');

    // Uma empresa sem órfãos não enxerga os órfãos da outra.
    db.Employee.find((row) => row.id === 'rh').company_id = 'B';
    const moved = await invokeAt(url, 'diagnostics', { token: 'rh' });
    assert.equal(moved.payload.orphan_employees.length, 1);
    assert.equal(moved.payload.orphan_employees[0].employee_id, 'ghost-b');
  } finally {
    await server.shutdown();
  }
});

Deno.test('marcações órfãs não entram no cálculo da folha de funcionário atual', async () => {
  const clean = fixture();
  attendance(clean);
  const dirty = withOrphans();
  const serverClean = serve({ payrollService });
  const serverDirty = serve({ payrollService });
  const scope = { ...calc, token: 'rh', expected_company_id: 'A', action: 'calculate' };
  try {
    const base = await invokeAt(`http://127.0.0.1:${serverClean.addr.port}/functions/`, 'payrollService', scope);
    const contaminated = await invokeAt(`http://127.0.0.1:${serverDirty.addr.port}/functions/`, 'payrollService', scope);
    assert.equal(base.status, 200);
    assert.equal(contaminated.status, 200);
    assert.deepEqual(contaminated.payload.payroll.time_summary, base.payload.payroll.time_summary);
    assert.equal(contaminated.payload.payroll.net_salary, base.payload.payroll.net_salary);
  } finally {
    await serverClean.shutdown();
    await serverDirty.shutdown();
  }
});
