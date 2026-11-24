import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { table } from './fixture.js';
import {
  PREVIEW_LABEL, buildContractualPreview, contractualDays, contractualStats, previewCharge, previewFgts, taxDependentsOf,
} from '../src/lib/payrollPreview.js';
import * as serverEngine from '../base44/shared/payrollCalculation.js';

const employee = (overrides = {}) => ({
  id: 'emp-preview', full_name: 'Funcionário Real', cpf: '52998224725',
  base_salary: 5000, weekly_hours: 44, contract_type: 'CLT',
  position_name: 'Analista', department: 'Administrativo',
  admission_date: '2024-01-02', dependents: [], ...overrides,
});
const schedule = {
  id: 'sch-1', name: '44h', weekly_hours: 44, work_days: [1, 2, 3, 4, 5],
  entry_time: '08:00', break_start: '12:00', break_end: '13:00', exit_time: '17:48',
};
const TODAY = new Date('2026-11-23T12:00:00');
const preview = (overrides = {}, competence = '2026-10') => buildContractualPreview({
  employee: employee(overrides), schedule, positionName: 'Analista', competence, table, today: TODAY,
});

test('prévia conta apenas os dias de jornada da competência', () => {
  assert.equal(contractualDays({ employee: employee(), schedule, competence: '2026-10', today: TODAY }), 22);
  // Admissão no meio do mês: só conta os dias a partir da admissão.
  const tarde = employee({ admission_date: '2026-10-19' });
  assert.equal(contractualDays({ employee: tarde, schedule, competence: '2026-10', today: TODAY }), 10);
  // Mês em curso: dias futuros não entram na conta.
  assert.equal(contractualDays({ employee: employee(), schedule, competence: '2026-11', today: TODAY }), 16);
});

test('prévia é identificada como demonstrativa, sem validade financeira', () => {
  assert.equal(PREVIEW_LABEL, 'Simulação — sem validade financeira');
  assert.equal(preview().preview_label, 'Simulação — sem validade financeira');
});

test('resumo da prévia mostra INSS, IRRF e FGTS, inclusive quando não há desconto', () => {
  const alta = preview({ base_salary: 6000 });
  assert.ok(previewCharge(alta, 'INSS') > 0);
  assert.ok(previewCharge(alta, 'IRRF') > 0);
  assert.equal(previewFgts(alta), 480);
  // Base abaixo da faixa de isenção: IRRF não é descontado e o resumo mostra zero.
  const baixa = preview({ base_salary: 1500, admission_date: '2024-01-02' });
  assert.equal(previewCharge(baixa, 'IRRF'), 0);
});

test('prévia não presume faltas, atrasos nem horas extras', () => {
  const stats = contractualStats({ employee: employee(), schedule, competence: '2026-10', today: TODAY });
  assert.equal(stats.absences, 0);
  assert.equal(stats.late, 0);
  assert.equal(stats.overtime, 0);
  assert.equal(stats.worked, 22 * 528);
});

test('prévia apresenta bruto, INSS, IRRF, FGTS, descontos e líquido', () => {
  const p = preview({ base_salary: 6000 });
  assert.equal(p.preview, true);
  assert.equal(p.status, 'previa');
  assert.equal(p.preview_label, PREVIEW_LABEL);
  assert.equal(p.attendance_pending, true);
  assert.equal(p.id, undefined); // nada gravado: sem identificador de registro
  assert.equal(p.earnings[0].description, 'Salário-base');
  assert.equal(p.earnings[0].value, 6000);
  assert.ok(p.deductions.some((d) => d.description === 'INSS' && d.value > 0));
  assert.ok(p.deductions.some((d) => d.description === 'IRRF' && d.value > 0));
  assert.equal(p.informatives[0].description, 'FGTS 8% — depósito do empregador');
  assert.ok(!p.deductions.some((d) => d.description.startsWith('Faltas')));
  assert.ok(!p.deductions.some((d) => d.description.startsWith('Atrasos')));
  assert.equal(p.net_salary, Math.round((p.total_earnings - p.total_deductions) * 100) / 100);
});

test('prévia usa o mesmo motor de cálculo da folha real', () => {
  const employeeFixture = employee({ base_salary: 4200 });
  const stats = contractualStats({ employee: employeeFixture, schedule, competence: '2026-10', today: TODAY });
  const expected = serverEngine.buildPayroll({
    employee: employeeFixture, positionName: 'Analista', competence: '2026-10', stats, rubrics: [],
    table, paymentDate: '2026-10-05', taxDependents: 0, admissionDate: employeeFixture.admission_date,
  });
  const {
    preview: isPreview, preview_only, preview_label, preview_days, preview_dependents_unknown, attendance_pending, ...rest
  } = preview({ base_salary: 4200 });
  assert.deepEqual({ ...rest, status: 'rascunho' }, expected);
  assert.equal(isPreview, true);
  assert.equal(preview_only, true);
});

test('prévia de admissão no mês mantém o salário proporcional estimado', () => {
  const p = preview({ admission_date: '2026-10-19' });
  assert.ok(p.earnings[0].description.includes('Salário proporcional'));
  assert.ok(p.earnings[0].value < 5000);
});

test('dependentes só entram no IRRF quando classificados', () => {
  assert.equal(taxDependentsOf({ dependents: [] }), 0);
  assert.equal(taxDependentsOf({}), null);
  assert.equal(taxDependentsOf({ dependents: [{ name: 'A', relationship: 'filho' }] }), null);
  assert.equal(taxDependentsOf({ dependents: [{ name: 'A', tax_dependent: true }, { name: 'B', tax_dependent: false }] }), 1);
  assert.equal(taxDependentsOf({ tax_dependents: 2, dependents: [] }), 2);
  assert.equal(preview({ dependents: [{ name: 'A', relationship: 'filho' }] }).preview_dependents_unknown, true);
});

test('prévia não grava nada: módulo sem SDK, backend ou entidades', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/lib/payrollPreview.js', import.meta.url)), 'utf8');
  assert.ok(!source.includes('base44Client'));
  assert.ok(!source.includes('functions.invoke'));
  assert.ok(!source.includes('entities.'));
  assert.ok(!source.includes('fetch('));
});
