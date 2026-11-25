// Cópia do motor de cálculo da folha para uso no navegador (modo demonstração).
// Mantém as mesmas fórmulas de base44/shared/payrollCalculation.js; a paridade numérica
// entre as duas versões é verificada em tests/demo-payroll.test.js.
import { DEFAULT_PARAMS, dayStats, monthStats } from './payroll.js';

export { DEFAULT_PARAMS, dayStats, monthStats };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const paramsFromTable = (table) => ({
  tolerance: table?.tolerance_minutes ?? DEFAULT_PARAMS.tolerance,
  overtimeCapMin: table?.overtime_cap_minutes ?? DEFAULT_PARAMS.overtimeCapMin,
  overtimeRate: Number(table?.overtime_rate) || 1.5,
  fgtsRate: Number(table?.fgts_rate) || 0.08,
  absenceDivisor: Number(table?.absence_divisor) || 30,
});

// INSS progressivo por faixas (cada faixa tributa só a parcela que está nela).
export function calcInss(base, bands = []) {
  const sorted = [...(bands || [])].sort((a, b) => Number(a.limit) - Number(b.limit));
  let prev = 0;
  let total = 0;
  for (const band of sorted) {
    const limit = Number(band.limit);
    if (base > prev) total += Math.floor(Math.round((Math.min(base, limit) - prev) * 100) * Math.round(band.rate * 10000) / 10000);
    prev = limit;
  }
  return total / 100;
}

// IRRF pela faixa em que a base se enquadra: base × alíquota − parcela a deduzir.
export function irrfTax(base, bands = []) {
  const sorted = [...(bands || [])].sort((a, b) => Number(a.limit) - Number(b.limit));
  const band = sorted.find((b) => base <= Number(b.limit)) || sorted[sorted.length - 1];
  if (!band) return 0;
  return round2(Math.max(0, base * Number(band.rate || 0) - Number(band.deduction || 0)));
}

export function calcIrrf({ earnings, inss, dependents, table, paymentDate }) {
  if (!table) return { tax: 0, base: 0 };
  const dependentsDeduction = (Number(table.irrf_dependent_deduction) || 0) * (Number(dependents) || 0);
  const legalDeductions = Number(inss || 0) + dependentsDeduction;
  const simplified = Number(table.irrf_simplified_discount) || 0;
  const base = round2(Math.max(0, earnings - Math.max(legalDeductions, simplified)));
  const grossTax = irrfTax(base, table.irrf_bands);
  const reduction = paymentDate?.startsWith('2026-') && earnings <= 7350
    ? (earnings <= 5000 ? 312.89 : round2(978.62 - 0.133145 * earnings)) : 0;
  return { tax: round2(Math.max(0, grossTax - reduction)), base };
}

// FGTS: 8% regra geral, 2% para aprendiz e não aplicável a estágio (sem vínculo de emprego).
export function fgtsRateFor(employee, table) {
  const contract = (employee?.contract_type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (contract.includes('estagio')) return 0;
  if (contract.includes('aprendiz')) return 0.02;
  return Number(table?.fgts_rate) || DEFAULT_PARAMS.fgtsRate;
}

export function buildPayroll({ employee, positionName, competence, stats, rubrics = [], table, paymentDate, taxDependents, admissionDate = '', throughDay }) {
  const p = paramsFromTable(table);
  const salary = Number(employee.base_salary) || 0;
  const [year, month] = competence.split('-').map(Number);
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const partialMonth = admissionDate.startsWith(competence + '-') && admissionDate > competence + '-01';
  const firstDay = partialMonth ? Number(admissionDate.slice(8, 10)) : 1;
  const lastDay = throughDay ?? calendarDays;
  const payableCalendarDays = Math.max(0, lastDay - firstDay + 1);
  const proportionSalary = round2(salary * payableCalendarDays / calendarDays);
  const weekly = Number(employee.weekly_hours) || 44;
  const monthlyHours = weekly * 5; // 44h/semana = 220h/mês
  const hourly = salary / monthlyHours;

  const earnings = [{
    description: payableCalendarDays < calendarDays ? `Salário proporcional (estimativa ${payableCalendarDays}/${calendarDays} dias)` : 'Salário-base',
    value: proportionSalary,
  }];
  const overtimeValue = round2((stats.overtime / 60) * hourly * p.overtimeRate);
  if (overtimeValue > 0) {
    const percent = Math.round((p.overtimeRate - 1) * 100);
    earnings.push({ description: `Horas extras ${percent}% (${fmtMin(stats.overtime)}h)`, value: overtimeValue });
  }
  if (stats.dsrExtra > 0) earnings.push({ description: 'Reflexo de extras no DSR', value: stats.dsrExtra });
  const fixed = (cat) => rubrics.filter((r) => r.category === cat && r.auto_apply && r.fixed_value > 0)
    .map((r) => ({ description: r.name, value: round2(r.fixed_value) }));
  earnings.push(...fixed('provento'));
  const total_earnings = round2(earnings.reduce((a, b) => a + b.value, 0));

  const deductions = [];
  if (stats.absences > 0) {
    deductions.push({
      description: `Faltas (${stats.absences} dia(s))`,
      value: round2((salary / p.absenceDivisor) * stats.absences),
    });
  }
  if (stats.late > 0) deductions.push({ description: `Atrasos (${fmtMin(stats.late)}h)`, value: round2((stats.late / 60) * hourly) });
  if (stats.dsrDiscount > 0) deductions.push({ description: 'Perda de DSR conferida', value: stats.dsrDiscount });
  const taxable = round2(total_earnings - deductions.reduce((a, b) => a + b.value, 0));
  const inss = calcInss(taxable, table.inss_bands);
  const dependents = taxDependents;
  const irrf = calcIrrf({ earnings: taxable, inss, dependents, table, paymentDate });
  deductions.push({ description: 'INSS', value: inss });
  if (irrf.tax > 0) deductions.push({ description: 'IRRF', value: irrf.tax });
  deductions.push(...fixed('desconto'));
  const total_deductions = round2(deductions.reduce((a, b) => a + b.value, 0));

  const fgtsRate = fgtsRateFor(employee, table);
  const fgtsValue = round2(taxable * fgtsRate);
  const informatives = [
    {
      description: fgtsRate > 0 ? `FGTS ${(fgtsRate * 100).toFixed(0)}% — depósito do empregador` : 'FGTS — não aplicável (estágio)',
      value: fgtsValue,
    },
    ...fixed('informativa'),
  ];

  return {
    employee_id: employee.id,
    employee_name: employee.full_name,
    employee_cpf: employee.cpf,
    position_name: positionName || '',
    department: employee.department || '',
    competence,
    base_salary: round2(salary),
    earnings,
    deductions,
    informatives,
    total_earnings,
    total_deductions,
    net_salary: round2(total_earnings - total_deductions),
    calc_memory: {
      inss_base: taxable,
      irrf_base: irrf.base,
      irrf_dependents: dependents,
      fgts_base: taxable,
      fgts_rate: fgtsRate,
      hourly_rate: round2(hourly),
      overtime_rate: p.overtimeRate,
    },
    legal_table_id: table?.id || '',
    legal_table_label: table?.label || '',
    time_summary: { worked: stats.worked, late: stats.late, overtime: stats.overtime, absences: stats.absences },
    status: 'rascunho',
  };
}