import assert from 'node:assert/strict';
import { attendance, calc, fixture, table } from './fixture.js';
import { getMockClient } from './memory-sdk.js';
import portal from '../base44/functions/employeePortal/entry.ts';
import payroll from '../base44/functions/payrollService/entry.ts';
import rh from '../base44/functions/rhService/entry.ts';
import auth from '../base44/functions/authCpf/entry.ts';
import listCompanies from '../base44/functions/listCompanies/entry.ts';
import { hashPassword } from '../base44/shared/authHelpers.ts';
import { calcInss, calcIrrf } from '../base44/shared/payrollCalculation.js';
import { newPasswordHash, verifyPassword } from '../base44/shared/passwords.ts';
import { authorizeOwner, checkRecoveryKey, attemptRecovery } from '../base44/shared/masterSwap.ts';
import { consumeAuthAttempt, clearAuthAttempts } from '../base44/shared/loginThrottle.js';

async function call(fn, action, fields = {}, token = 'rh') {
  const req = new Request('http://local.test/', {
    method: 'POST',
    body: JSON.stringify({ token, expected_company_id: 'A', action, ...fields }),
  });
  const res = await fn(req);
  return { status: res.status, ...await res.json() };
}
Deno.test('INSS trunca por faixa, IRRF aplica as três faixas de redução de 2026', () => {
  assert.equal(calcInss(8475.55, table.inss_bands), 988.07);
  const tax = (earnings, inss) =>
    calcIrrf({ earnings, inss, dependents: 0, table, paymentDate: '2026-01-02' }).tax;
  assert.equal(tax(5000, 0), 0);
  assert.equal(tax(6000, 649.6), 382.88);
  assert.equal(tax(7607.20, 0), 1016.27);
});
Deno.test('ponto do servidor serializa duplo clique e mantém o vínculo autenticado', async () => {
  const db = fixture();
  const punch = () =>
    call(portal, 'clock', { kind: 'entry', employee_id: 'other', company_id: 'B', time: '99:99' }, 'worker');
  const pair = await Promise.all([punch(), punch()]);
  assert.deepEqual(pair.map((r) => r.status).sort(), [200, 409]);
  assert.equal(db.TimeRecord.length, 1);
  assert.equal(db.TimeRecord[0].employee_id, 'worker');
  assert.equal(db.TimeRecord[0].company_id, 'A');
  assert.match(db.TimeRecord[0].original_time, /^\d\d:\d\d$/);
  assert.equal((await call(portal, 'attendance', {}, 'worker')).time.records.length, 1);
  assert.equal((await call(portal, 'clock', { kind: 'break_end' }, 'worker')).status, 409);
  db.Employee[0].status = 'afastado';
  assert.equal((await punch()).status, 403);
});
Deno.test('RH preserva original, autoria, versões e bloqueio da competência', async () => {
  const db = fixture();
  const params = {
    employee_id: 'worker',
    date: '2026-01-05',
    kind: 'entry',
    time: '08:00',
    reason: 'Conferência do registro',
  };
  assert.equal((await call(rh, 'addMark', params)).status, 200);
  const id = db.TimeRecord[0].id;
  const correction = { ...params, id, previous: '08:00', revision: 1, time: '08:05' };
  assert.equal((await call(rh, 'correctMark', correction)).status, 200);
  assert.equal(db.TimeRecord[0].original_time, '08:00');
  assert.equal(db.TimeRecord[0].corrections.at(-1).actor_id, 'rh');
  assert.equal((await call(rh, 'correctMark', correction)).status, 409);
  assert.equal((await call(rh, 'addMark', { ...params, employee_id: 'other' })).status, 404);
  assert.equal((await call(rh, 'addMark', params, 'manager')).status, 403);
  db.Payroll.push({ company_id: 'A', employee_id: 'worker', competence: '2026-01', status: 'aprovada' });
  assert.equal((await call(rh, 'correctMark', correction)).error, 'folha_existente');
});
Deno.test('folha interrompe cálculo com dia incompleto, calendário pendente ou tabela divergente', async () => {
  const db = fixture();
  attendance(db);
  const exit = db.TimeRecord.pop();
  assert.equal((await call(payroll, 'calculate', calc)).status, 422);
  db.TimeRecord.push(exit);
  assert.equal((await call(payroll, 'calculate', { ...calc, paid_days: [] })).status, 422);
  db.LegalTable[0].inss_bands[0].rate = .10;
  assert.equal((await call(payroll, 'calculate', calc)).status, 422);
  assert.equal(db.Payroll.length, 0);
});
Deno.test('folha salva uma vez, exige aprovação e entrega o contracheque só ao titular', async () => {
  const db = fixture();
  attendance(db);
  const results = await Promise.all([call(payroll, 'calculate', calc), call(payroll, 'calculate', calc)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(db.Payroll.length, 1);
  const row = db.Payroll[0], fields = { payroll_id: row.id, reviewer: 'nome do navegador' };
  assert.equal((await call(payroll, 'finalize', fields)).status, 409);
  assert.equal((await call(portal, 'payslip', { competence: calc.competence }, 'worker')).payroll, null);
  assert.equal((await call(payroll, 'approve', fields, 'manager')).status, 403);
  assert.equal((await call(payroll, 'approve', fields)).payroll.reviewed_by, 'Teste rh');
  const original = structuredClone(row.earnings);
  assert.equal((await call(payroll, 'finalize', fields)).payroll.status, 'finalizada');
  assert.equal((await call(payroll, 'calculate', calc)).existing_final, true);
  assert.deepEqual(row.earnings, original);
  assert.equal((await call(portal, 'payslip', { competence: calc.competence }, 'worker')).payroll.id, row.id);
  assert.equal(
    (await call(portal, 'payslip', { competence: calc.competence, employee_id: 'worker' }, 'other')).payroll,
    null,
  );
});
Deno.test('rubricas e histórico filtram a empresa e o perfil e rejeitam incidência indefinida', async () => {
  const db = fixture();
  db.Payroll.push({ id: 'a', company_id: 'A' }, { id: 'b', company_id: 'B' });
  assert.equal((await call(rh, 'history', {}, 'worker')).status, 403);
  assert.deepEqual((await call(rh, 'history')).items.map((r) => r.id), ['a']);
  const record = {
    name: 'Adicional',
    category: 'provento',
    fixed_value: 100,
    auto_apply: true,
    description: '',
  };
  assert.equal((await call(rh, 'saveRubric', { record })).status, 400);
  assert.equal(
    (await call(rh, 'saveRubric', { record: { ...record, incidence_reviewed: true }, company_id: 'B' }))
      .status,
    200,
  );
  assert.equal(db.Rubric[0].company_id, 'A');
  assert.equal((await call(rh, 'saveRubric', { expected_company_id: 'B', record })).status, 409);
});
Deno.test('pagamento de férias exige recibo conciliado, preserva valores e impede sobreposição', async () => {
  const db = fixture();
  const record = {
    reference: 'Recibo fictício',
    confirmed: true,
    payment_date: '2026-02-01',
    acquired_start: '2025-01-01',
    acquired_end: '2025-12-31',
    start_date: '2026-02-04',
    end_date: '2026-03-05',
    abono_days: 0,
    earnings: [{ description: 'Verbas do recibo', value: 4000 }],
    deductions: [{ description: 'Descontos do recibo', value: 300 }],
    total_earnings: 4000,
    total_deductions: 300,
    net_salary: 3700,
  };
  const save = (r) => call(rh, 'recordBenefit', { module: 'ferias', employee_id: 'worker', record: r });
  assert.equal((await save({ ...record, net_salary: 3699 })).status, 422);
  assert.equal((await save(record)).status, 200);
  assert.equal((await save(record)).status, 422);
  const id = db.Vacation[0].id;
  assert.equal((await call(rh, 'payBenefit', { module: 'ferias', id, paid_at: '2026-02-01' })).status, 200);
  assert.equal(db.Vacation[0].net_salary, 3700);
  assert.equal(db.Vacation[0].paid_by, 'rh');
});
Deno.test('13º abate a parcela real e rescisão documental preserva o vínculo', async () => {
  const db = fixture();
  const annual = {
    year: '2026',
    months_worked: 12,
    remuneration: 5000,
    advance: 1740,
    tax_dependents: 0,
    reference: 'Apuração',
    payment_date: '2026-12-18',
    confirmed: true,
  };
  const post = (module, record) => call(rh, 'recordBenefit', { module, employee_id: 'worker', record });
  assert.equal((await post('decimo', { ...annual, advance: null })).status, 422);
  const saved = await post('decimo', annual);
  assert.equal(saved.status, 200);
  assert.equal(saved.record.second_parcel, Math.round((saved.record.net_salary - 1740) * 100) / 100);
  assert.equal((await post('decimo', annual)).status, 409);
  const trct = {
    reference: 'TRCT fictício',
    confirmed: true,
    payment_date: '2026-02-04',
    termination_date: '2026-02-01',
    type: 'pedido',
    notice: 'trabalhado',
    earnings: [{ description: 'Saldo conferido', value: 300 }],
    deductions: [],
    total_earnings: 300,
    total_deductions: 0,
    net_salary: 300,
  };
  assert.equal((await post('rescisao', trct)).status, 200);
  assert.equal((await post('rescisao', trct)).status, 409);
  assert.equal(db.Employee[0].status, 'ativo');
});
Deno.test('senha exige credencial atual, preserva outras contas e invalida sessões antigas', async () => {
  const db = fixture();
  const employee = db.Employee[0];
  employee.cpf = '00000000000';
  employee.password_hash = await hashPassword(employee.cpf, 'anterior');
  const change = (current) =>
    call(auth, 'changePassword', { current, password: 'nova-senha', employee_id: 'other' }, 'worker');
  assert.equal((await change('incorreta')).status, 403);
  assert.equal((await change('anterior')).status, 200);
  assert.equal(await verifyPassword(employee.password_hash, employee.cpf, 'nova-senha'), true);
  assert.equal((await call(portal, 'summary', {}, 'worker')).status, 401);
  assert.equal(db.Employee[3].password_hash, undefined);
  assert.equal(await verifyPassword(await newPasswordHash('outra'), '', 'errada'), false);
});
Deno.test('faltas classificadas reduzem bases e extras não são truncadas no limite de jornada', async () => {
  const db = fixture();
  attendance(db);
  db.TimeRecord.splice(0, 4);
  db.TimeRecord.find((r) => r.date === '2026-01-05' && r.kind === 'exit').original_time = '20:00';
  const r = await call(payroll, 'calculate', {
    ...calc,
    unpaid_days: ['2026-01-02'],
    dsr_extra: 20,
    dsr_discount: 30,
  });
  assert.equal(r.status, 200);
  assert.equal(r.payroll.time_summary.overtime, 180);
  assert.equal(r.payroll.time_summary.absences, 1);
  assert.equal(
    r.payroll.calc_memory.inss_base,
    Math.round((r.payroll.total_earnings - 166.67 - 30) * 100) / 100,
  );
  assert.equal(r.payroll.calc_memory.fgts_base, r.payroll.calc_memory.inss_base);
});
Deno.test('histórico legado sem empresa bloqueia novas folhas e não expõe valores', async () => {
  const db = fixture();
  attendance(db);
  db.Payroll.push({
    id: 'legacy',
    employee_id: 'worker',
    competence: calc.competence,
    status: 'finalizada',
    net_salary: 1700,
  });
  assert.equal((await call(payroll, 'calculate', calc)).error, 'historico_sem_empresa');
  const result = await call(portal, 'payslip', { competence: calc.competence }, 'worker');
  assert.equal(result.error, 'historico_sem_empresa');
  assert.equal(result.payroll, undefined);
  assert.equal(db.Payroll.length, 1);
  assert.equal(db.Payroll[0].net_salary, 1700);
});
Deno.test('sessão expirada, empresa inativa e vínculo desligado impedem operações', async () => {
  const db = fixture();
  db.AuthSession[1].expires_at = '2001-01-01';
  assert.equal((await call(rh, 'history')).status, 401);
  db.Company[0].status = 'inativa';
  assert.equal((await call(portal, 'attendance', {}, 'worker')).status, 403);
  db.Company[0].status = 'ativa';
  db.Employee[0].status = 'desligado';
  assert.equal((await call(portal, 'clock', { kind: 'entry' }, 'worker')).status, 403);
  assert.equal(db.TimeRecord.length, 0);
});
Deno.test('folha legada e totais divergentes conservam status e valores', async () => {
  const db = fixture();
  attendance(db);
  const saved = (await call(payroll, 'calculate', calc)).payroll;
  const row = db.Payroll[0];
  row.net_salary += 1;
  assert.equal((await call(payroll, 'approve', { payroll_id: saved.id })).error, 'valores_inconsistentes');
  assert.equal(row.status, 'rascunho');
  row.net_salary -= 1;
  delete row.input_review;
  assert.equal((await call(payroll, 'approve', { payroll_id: saved.id })).status, 422);
  assert.equal((await call(payroll, 'calculate', calc)).payroll.net_salary, saved.net_salary);
});
Deno.test('regras globais exigem mestre e dados de outra empresa ficam fora da consulta de ponto', async () => {
  const db = fixture();
  assert.equal((await call(rh, 'saveLegalTable', { record: table })).status, 403);
  assert.equal((await call(rh, 'time', { employee_id: 'other', competence: '2026-01' })).status, 404);
  db.AuthSession.push({
    id: 'masterSession',
    employee_id: 'master',
    token: 'master',
    company_id: 'A',
    expires_at: '2099-01-01',
  });
  db.Employee.push({ id: 'master', access_role: 'master' });
  assert.equal((await call(rh, 'history', { expected_company_id: 'B' }, 'master')).status, 409);
  assert.equal((await call(rh, 'history', {}, 'master')).status, 200);
});
Deno.test('modo automático usa dados salvos e gera somente rascunho com referência provisória', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  attendance(db);
  const res = await call(payroll, 'calculate', {
    competence: '2026-01', employee_id: 'worker', automatic: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.payroll.status, 'rascunho');
  assert.equal(res.payroll.input_review.source, 'automatic');
  assert.deepEqual(res.payroll.input_review.paid_days, ['2026-01-01']);
  assert.equal(res.payroll.input_review.tax_dependents, 0);
  assert.equal(res.payroll.input_review.payment_date, '');
  assert.equal(res.payroll.input_review.payment_date_confirmed, false);
  assert.equal((await call(payroll, 'approve', { payroll_id: res.payroll.id })).status, 422);
});

Deno.test('modo automático não presume dependentes, folgas nem marcações ausentes', async () => {
  const db = fixture();
  attendance(db);
  const blank = await call(payroll, 'calculate', {
    competence: '2026-01', employee_id: 'worker', automatic: true,
  });
  assert.equal(blank.status, 422);
  assert.equal(db.Payroll.length, 0);
  db.Employee[0].dependents = [];
  db.TimeRecord.splice(0, 4); // Jan 2 is an ordinary workday, not a national holiday
  const unclassified = await call(payroll, 'calculate', {
    competence: '2026-01', employee_id: 'worker', automatic: true,
  });
  assert.equal(unclassified.status, 422);
  assert.ok(unclassified.problems?.some((p) => p.includes('2026-01-02')));
  assert.equal(db.Payroll.length, 0);
});

Deno.test('modo automático reconhece feriado nacional de outubro sem tratar como falta', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  for (let day = 1; day <= 31; day++) {
    const date = '2026-10-' + String(day).padStart(2, '0');
    if ([0, 6].includes(new Date(date).getUTCDay()) || date === '2026-10-12') continue;
    for (const [kind, original_time] of [
      ['entry', '08:00'], ['break_start', '12:00'],
      ['break_end', '13:00'], ['exit', '17:00'],
    ]) db.TimeRecord.push({ company_id: 'A', employee_id: 'worker', date, kind, original_time });
  }
  const res = await call(payroll, 'calculate', {
    competence: '2026-10', employee_id: 'worker', automatic: true,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.payroll.input_review.paid_days, ['2026-10-12']);
  assert.equal(res.payroll.time_summary.absences, 0);
});

Deno.test('modo automático não calcula como jornada comum trabalho em feriado nacional', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  attendance(db);
  for (const [kind, original_time] of [
    ['entry', '08:00'], ['break_start', '12:00'],
    ['break_end', '13:00'], ['exit', '17:00'],
  ]) db.TimeRecord.push({ company_id: 'A', employee_id: 'worker', date: '2026-01-01', kind, original_time });
  const res = await call(payroll, 'calculate', {
    competence: '2026-01', employee_id: 'worker', automatic: true,
  });
  assert.equal(res.status, 422);
  assert.ok(res.problems?.some((p) => p.includes('feriado nacional')));
  assert.equal(db.Payroll.length, 0);
});

Deno.test('folha bloqueia competência totalmente anterior à admissão sem criar registro', async () => {
  const db = fixture();
  db.Employee[0].admission_date = '2026-11-10';
  // O aviso de admissão deve ter prioridade mesmo sem dependentes cadastrados.
  const result = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(result.status, 422);
  assert.equal(result.error, 'competencia_anterior_admissao');
  assert.equal(db.Payroll.length, 0);
});

Deno.test('admissão durante outubro calcula rascunho proporcional, sem contar dias anteriores', async () => {
  const db = fixture();
  db.Employee[0].admission_date = '2026-10-16';
  db.Employee[0].dependents = [];
  for (let day = 16; day <= 31; day++) {
    const date = '2026-10-' + String(day).padStart(2, '0');
    if ([0, 6].includes(new Date(date).getUTCDay())) continue;
    for (const [kind, original_time] of [
      ['entry', '08:00'], ['break_start', '12:00'],
      ['break_end', '13:00'], ['exit', '17:00'],
    ]) db.TimeRecord.push({ company_id: 'A', employee_id: 'worker', date, kind, original_time });
  }
  const result = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(result.status, 200);
  assert.equal(result.payroll.earnings[0].value, 2580.65);
  assert.equal(result.payroll.base_salary, 5000);
  assert.match(result.payroll.earnings[0].description, /estimativa 16\/31 dias/);
  assert.deepEqual(result.payroll.input_review.paid_days, []);
  assert.equal(result.payroll.input_review.admission_partial, true);
  assert.equal((await call(payroll, 'approve', { payroll_id: result.payroll.id })).status, 422);
});

Deno.test('marcações anteriores à admissão bloqueiam rascunho e não são descartadas silenciosamente', async () => {
  const db = fixture();
  db.Employee[0].admission_date = '2026-10-16';
  db.Employee[0].dependents = [];
  for (const [kind, original_time] of [['entry', '08:00'], ['exit', '17:00']]) {
    db.TimeRecord.push({
      company_id: 'A', employee_id: 'worker', date: '2026-10-15', kind, original_time,
    });
  }
  const result = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(result.status, 422);
  assert.equal(db.Payroll.length, 0);
});

Deno.test('sem qualquer ponto, mostra apenas prévia não salva e nunca permite aprovação', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  const result = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(result.status, 200);
  assert.equal(result.preview_only, true);
  assert.equal(result.payroll.preview_only, true);
  assert.equal(result.payroll.attendance_pending, true);
  assert.equal(result.payroll.id, null);
  assert.equal(result.payroll.time_summary.absences, 0); // não apurado, NÃO significa ausência zero
  assert.equal(db.Payroll.length, 0); // nenhuma folha financeira criada
  assert.equal((await call(payroll, 'approve', { payroll_id: 'inexistente' })).status, 404);
});

Deno.test('ponto parcialmente registrado não vira simulação de frequência zerada', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  db.TimeRecord.push({
    company_id: 'A', employee_id: 'worker', date: '2026-10-01',
    kind: 'entry', original_time: '08:00',
  });
  const result = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(result.status, 422);
  assert.equal(result.preview_only, undefined);
  assert.equal(db.Payroll.length, 0);
});

Deno.test('recuperação de mestre exige identidade da plataforma e proprietário correto', async () => {
  assert.equal(authorizeOwner(null, 'owner-user').status, 401);
  assert.equal(authorizeOwner({ id: 'other-user', role: 'admin' }, 'owner-user').status, 403);
  assert.equal(authorizeOwner({ id: 'owner-user', role: 'user' }, 'owner-user').status, 403);
  assert.equal(authorizeOwner({ id: 'owner-user', role: 'admin' }, 'owner-user').ok, true);
  assert.equal(checkRecoveryKey('', 'example-key').status, 400);
  assert.equal(checkRecoveryKey('example-key', '').status, 503);
  assert.equal(checkRecoveryKey('wrong-key', 'example-key').status, 403);
});

Deno.test('recuperação inválida nunca consulta nem modifica a base de dados', async () => {
  let accesses = 0;
  const store = new Proxy({}, { get() { accesses++; throw new Error('Store must not be accessed'); } });
  const common = {
    ownerUserId: 'owner-user', expectedKey: 'example-key', suppliedKey: 'example-key',
    newMaster: { fullName: 'Teste Mestre', cpf: '00000000000', password: 'example-pass' },
    store, now: Date.now(),
  };
  const unauth = await attemptRecovery({ ...common, identity: null });
  assert.equal(unauth.status, 401);
  const wrongOwner = await attemptRecovery({ ...common, identity: { id: 'not-owner', role: 'admin' } });
  assert.equal(wrongOwner.status, 403);
  const wrongKey = await attemptRecovery({
    ...common, identity: { id: 'owner-user', role: 'admin' }, suppliedKey: 'wrong-key',
  });
  assert.equal(wrongKey.status, 403);
  assert.equal(accesses, 0);
});

Deno.test('limite de tentativas pré-login responde 429 e expira sem alterar registros', () => {
  const cpf = '81594637205';
  clearAuthAttempts('login', cpf);
  const initial = 1_800_000_000_000;
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(consumeAuthAttempt('login', cpf, initial + i), {
      allowed: true, retryAfterSeconds: 0,
    });
  }
  const blocked = consumeAuthAttempt('login', cpf, initial + 6);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 25 && blocked.retryAfterSeconds <= 30);
  assert.equal(consumeAuthAttempt('login', cpf, initial + 10).allowed, false);
  assert.equal(consumeAuthAttempt('login', cpf, initial + 11 * 60_000).allowed, true);
  clearAuthAttempts('login', cpf);
});

Deno.test('limites de login e ativação são separados e o sucesso limpa o contador', () => {
  const cpf = '81594637206';
  for (let i = 0; i < 6; i++) consumeAuthAttempt('login', cpf, 1_800_000_200_000 + i);
  assert.equal(consumeAuthAttempt('activate', cpf, 1_800_000_200_020).allowed, true);
  clearAuthAttempts('login', cpf);
  assert.equal(consumeAuthAttempt('login', cpf, 1_800_000_200_030).allowed, true);
  clearAuthAttempts('login', cpf);
  clearAuthAttempts('activate', cpf);
});

Deno.test('login por CPF limita erros e libera acesso com senha correta depois da espera', async () => {
  const cpf = '52998224725';
  const db = fixture();
  db.Employee[0].cpf = cpf;
  db.Employee[0].password_hash = await newPasswordHash('senha-correta-de-teste');
  clearAuthAttempts('login', cpf);
  for (let i = 0; i < 5; i++) {
    const result = await call(auth, 'login', { cpf, password: 'senha-incorreta' });
    assert.equal(result.status, 401);
  }
  const blocked = await call(auth, 'login', { cpf, password: 'senha-correta-de-teste' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.error, 'muitas_tentativas');
  assert.equal(db.AuthSession.some((s) => s.employee_id === 'worker' && s.token !== 'worker'), false);
  clearAuthAttempts('login', cpf);
  const success = await call(auth, 'login', { cpf, password: 'senha-correta-de-teste' });
  assert.equal(success.status, 200);
  assert.equal(success.ok, true);
  assert.equal(success.employee.id, 'worker');
  assert.equal(db.AuthSession.some((s) => s.employee_id === 'worker' && s.token === success.token), true);
  clearAuthAttempts('login', cpf);
});

Deno.test('lista de empresas preserva autorizacao mestre e nao grava nem remove dados', async () => {
  const db = fixture();
  db.Employee.push({ id: 'master', full_name: 'Conta Mestre', access_role: 'master', cpf: '12345678909' });
  db.AuthSession.push({
    id: 'masterSession', employee_id: 'master', token: 'master',
    expires_at: '2099-01-01T00:00:00.000Z',
  });
  db.Company[0].name = 'Empresa A';
  db.Company[1].name = 'Empresa B';
  db.Company[1].status = 'inativa';
  const original = structuredClone(db.Company);

  const all = await call(listCompanies, '', { include_inactive: true }, 'master');
  assert.equal(all.status, 200);
  assert.deepEqual(all.companies.map(c => c.name), ['Empresa A', 'Empresa B']);
  assert.equal(all.companies.find(c => c.name === 'Empresa B').status, 'inativa');

  const active = await call(listCompanies, '', { include_inactive: false }, 'master');
  assert.equal(active.status, 200);
  assert.deepEqual(active.companies.map(c => c.name), ['Empresa A']);
  assert.deepEqual(db.Company, original);

  const denied = await call(listCompanies, '', {}, 'worker');
  assert.equal(denied.status, 403);
  assert.equal(denied.error, 'somente_mestre');
});

Deno.test('erro SDK na consulta de folha retorna etapa segura sem gravar dados', async () => {
  const db = fixture();
  const sdk = getMockClient();
  sdk.asServiceRole.entities.Payroll.filter = () => {
    throw new Error('erro privado contendo CPF ou token hipotetico');
  };
  const res = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(res.status, 500);
  assert.equal(res.error, 'falha_servidor');
  assert.equal(res.stage, 'historico_folha');
  assert.equal(db.Payroll.length, 0);
  assert.equal(db.Employee[0].processing_lock, '');
  assert.equal(JSON.stringify(res).includes('privado'), false);
});

Deno.test('falha no bloqueio de funcionario nao permite gravar folha', async () => {
  const db = fixture();
  const sdk = getMockClient();
  sdk.asServiceRole.entities.Employee.updateMany = () => {
    throw new Error('erro privado de permissao no banco');
  };
  const res = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(res.status, 500);
  assert.equal(res.stage, 'bloqueio_funcionario');
  assert.equal(db.Payroll.length, 0);
  assert.equal(db.Employee[0].processing_lock, undefined);
  assert.equal(JSON.stringify(res).includes('privado'), false);
});

Deno.test('falha de consulta mensal libera bloqueio e preserva folhas existentes', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  const sdk = getMockClient();
  sdk.asServiceRole.entities.Rubric.filter = () => {
    throw new Error('erro privado de banco');
  };
  const res = await call(payroll, 'calculate', {
    employee_id: 'worker', competence: '2026-10', automatic: true,
  });
  assert.equal(res.status, 500);
  assert.equal(res.stage, 'consultas_competencia');
  assert.equal(db.Payroll.length, 0);
  assert.equal(db.Employee[0].processing_lock, '');
});

Deno.test('versao de payrollService exige autorizacao mas nao altera registros', async () => {
  const db = fixture();
  const res = await call(payroll, 'release');
  assert.equal(res.status, 200);
  assert.match(res.release, /payroll-draft-review-v3/);
  assert.equal(db.Payroll.length, 0);
  assert.equal((await call(payroll, 'release', {}, 'worker')).status, 403);
});

Deno.test('RH confirma data do rascunho automático antes da aprovação, preservando a identidade da folha', async () => {
  const db = fixture();
  db.Employee[0].dependents = [];
  attendance(db);
  const draft = await call(payroll, 'calculate', { competence: '2026-01', employee_id: 'worker', automatic: true });
  const fields = { payroll_id: draft.payroll.id, payment_date: '2026-02-05' };
  const original = structuredClone(db.Payroll);
  assert.equal((await call(payroll, 'confirmPaymentDate', fields, 'manager')).status, 403);
  assert.equal((await call(payroll, 'confirmPaymentDate', { ...fields, expected_company_id: 'B' })).status, 409);
  assert.equal((await call(payroll, 'confirmPaymentDate', { ...fields, payment_date: '2026-01-01' })).status, 422);
  assert.deepEqual(db.Payroll, original);
  const confirmed = await call(payroll, 'confirmPaymentDate', fields);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payroll.id, draft.payroll.id);
  assert.equal(confirmed.payroll.status, 'rascunho');
  assert.equal(confirmed.payroll.input_review.payment_date, fields.payment_date);
  assert.equal(db.Payroll.length, 1);
  assert.equal((await call(payroll, 'confirmPaymentDate', fields)).status, 409);
  assert.equal((await call(payroll, 'approve', fields)).status, 200);
  assert.equal((await call(payroll, 'finalize', fields)).status, 200);
  assert.equal((await call(payroll, 'confirmPaymentDate', fields)).status, 409);
  assert.equal((await call(portal, 'payslip', { competence: '2026-01' }, 'worker')).payroll.id, draft.payroll.id);
});

Deno.test('sonda GET informa apenas a versão e JSON inválido é rejeitado sem usar o SDK', async () => {
  const response = await payroll(new Request('http://local.test/functions/payrollService'));
  assert.equal(response.status, 405);
  assert.match(response.headers.get('X-ContaFlow-Payroll-Release'), /payroll-draft-review-v3/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'metodo_invalido' });
  const malformed = await payroll(new Request('http://local.test/functions/payrollService', { method: 'POST', body: '{' }));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'requisicao_invalida' });
});
