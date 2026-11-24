import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { getMockClient } from './memory-sdk.js';
import { recordBenefit } from '../base44/shared/benefitRecords.js';

// Banco fictício em memória: nenhuma escrita toca os dados de produção.
const setup = () => {
  const db = fixture();
  const entities = getMockClient().asServiceRole.entities;
  const employee = db.Employee.find((e) => e.id === 'worker');
  return { db, entities, employee };
};

Deno.test('13º isolado: bruto, INSS, IRRF, parcelas e persistência', async () => {
  const { db, entities, employee } = setup();
  const response = await recordBenefit({ entities, companyId: 'A', actor: { id: 'rh' } }, employee, {
    module: 'decimo',
    record: {
      year: '2026', months_worked: 12, remuneration: 5000, advance: 0, tax_dependents: 0,
      payment_date: '2026-12-20', reference: 'Recibo fictício de 13º', confirmed: true,
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.record.gross, 5000);
  assert.equal(payload.record.inss, 501.5);
  assert.equal(payload.record.irrf, 0);
  assert.equal(payload.record.net_salary, 4498.5);
  assert.equal(payload.record.second_parcel, 4498.5);
  assert.equal(payload.record.company_id, 'A');
  assert.equal(db.ThirteenthSalary.length, 1);
});

Deno.test('férias isoladas: 30 dias persistidos com status programada', async () => {
  const { db, entities, employee } = setup();
  const response = await recordBenefit({ entities, companyId: 'A', actor: { id: 'rh' } }, employee, {
    module: 'ferias',
    record: {
      acquired_start: '2025-01-01', acquired_end: '2025-12-31',
      start_date: '2026-01-05', end_date: '2026-02-03', abono_days: 0,
      earnings: [{ description: 'Férias 30 dias', value: 5000 }],
      deductions: [{ description: 'INSS', value: 501.5 }],
      total_earnings: 5000, total_deductions: 501.5, net_salary: 4498.5,
      payment_date: '2026-01-02', reference: 'Recibo fictício de férias', confirmed: true,
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.record.days, 30);
  assert.equal(payload.record.status, 'programada');
  assert.equal(payload.record.competence, '2026-01');
  assert.equal(db.Vacation.length, 1);
});

Deno.test('rescisão isolada: registrada e recibo inconsistente é recusado', async () => {
  const { db, entities, employee } = setup();
  const recibo = {
    earnings: [{ description: 'Saldo de salário', value: 5000 }],
    deductions: [{ description: 'INSS', value: 501.5 }],
    total_earnings: 5000, total_deductions: 501.5, net_salary: 4498.5,
    payment_date: '2026-06-30', reference: 'TRCT fictício', confirmed: true,
    termination_date: '2026-06-30', type: 'sem_justa_causa', notice: 'indenizado',
  };
  const errado = await recordBenefit({ entities, companyId: 'A', actor: { id: 'rh' } }, employee, {
    module: 'rescisao', record: { ...recibo, net_salary: 4000 },
  });
  assert.equal(errado.status, 422);
  const certo = await recordBenefit({ entities, companyId: 'A', actor: { id: 'rh' } }, employee, {
    module: 'rescisao', record: recibo,
  });
  const payload = await certo.json();
  assert.equal(certo.status, 200, JSON.stringify(payload));
  assert.equal(payload.record.status, 'registrada');
  assert.equal(payload.record.competence, '2026-06');
  assert.equal(db.Termination.length, 1);
});
