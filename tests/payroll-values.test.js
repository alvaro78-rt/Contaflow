import test from 'node:test';
import assert from 'node:assert/strict';
import { table } from './fixture.js';
import { buildPayroll, calcInss, calcIrrf, fgtsRateFor } from '../base44/shared/payrollCalculation.js';

// Valores conferidos à mão com as faixas da tabela legal de 2026 (test/fixture.js).
const employee = (overrides = {}) => ({
  id: 'emp-1', full_name: 'Funcionário Fictício', cpf: '52998224725',
  base_salary: 5000, weekly_hours: 44, contract_type: 'CLT', ...overrides,
});
const zeroStats = { worked: 0, late: 0, overtime: 0, absences: 0 };
const build = (overrides, paymentDate = '2026-02-05') => buildPayroll({
  employee: employee(overrides), positionName: '', competence: '2026-01',
  stats: zeroStats, table, paymentDate, taxDependents: 0,
});
const deduction = (payroll, name) => payroll.deductions.find((d) => d.description === name)?.value;

test('INSS progressivo por faixa: R$ 5.000,00 resulta em R$ 501,50', () => {
  assert.equal(calcInss(5000, table.inss_bands), 501.5);
});

test('INSS respeita o teto da última faixa: R$ 12.000,00 resulta em R$ 988,07', () => {
  assert.equal(calcInss(12000, table.inss_bands), 988.07);
});

test('IRRF de R$ 5.000,00 em 2026 é zerado pelo redutor, com base de R$ 4.392,80', () => {
  const { tax, base } = calcIrrf({ earnings: 5000, inss: 501.5, dependents: 0, table, paymentDate: '2026-02-05' });
  assert.equal(base, 4392.8);
  assert.equal(tax, 0);
});

test('IRRF sem redutor em R$ 12.000,00 resulta em R$ 2.119,55', () => {
  const { tax, base } = calcIrrf({ earnings: 12000, inss: 988.07, dependents: 0, table, paymentDate: '2026-02-05' });
  assert.equal(base, 11011.93);
  assert.equal(tax, 2119.55);
});

test('FGTS: 8% no regime CLT, 2% no aprendiz e nenhum no estágio', () => {
  assert.equal(fgtsRateFor(employee(), table), 0.08);
  assert.equal(fgtsRateFor(employee({ contract_type: 'Aprendiz' }), table), 0.02);
  assert.equal(fgtsRateFor(employee({ contract_type: 'Estágio' }), table), 0);
});

test('folha de R$ 5.000,00 persiste INSS, IRRF e FGTS coerentes com a memória de cálculo', () => {
  const payroll = build({});
  assert.equal(deduction(payroll, 'INSS'), 501.5);
  assert.equal(deduction(payroll, 'IRRF'), undefined);
  assert.equal(payroll.calc_memory.inss_base, 5000);
  assert.equal(payroll.calc_memory.fgts_base, 5000);
  assert.equal(payroll.calc_memory.fgts_rate, 0.08);
  assert.equal(payroll.informatives.find((i) => i.description.startsWith('FGTS')).value, 400);
  assert.equal(payroll.net_salary, 4498.5);
  assert.equal(payroll.legal_table_label, '2026');
});

test('folha de R$ 12.000,00 aplica INSS, IRRF e FGTS sobre a mesma base', () => {
  const payroll = build({ base_salary: 12000 });
  assert.equal(deduction(payroll, 'INSS'), 988.07);
  assert.equal(deduction(payroll, 'IRRF'), 2119.55);
  assert.equal(payroll.informatives.find((i) => i.description.startsWith('FGTS')).value, 960);
  assert.equal(payroll.net_salary, 8892.38);
});

test('uma falta desconta 1/30 do salário e recalcula as bases sobre o valor tributável', () => {
  const payroll = buildPayroll({
    employee: employee(), positionName: '', competence: '2026-01',
    stats: { ...zeroStats, absences: 1 }, table, paymentDate: '2026-02-05', taxDependents: 0,
  });
  assert.equal(deduction(payroll, 'Faltas (1 dia(s))'), 166.67);
  assert.equal(payroll.calc_memory.inss_base, 4833.33);
  assert.equal(deduction(payroll, 'INSS'), 478.16);
});
