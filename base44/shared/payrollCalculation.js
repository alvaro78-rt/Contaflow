// Reused by authenticated Base44 payroll function; no browser-side SDK or UI dependencies.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Parâmetros usados apenas quando o item não existe na tabela legal vigente.
export const DEFAULT_PARAMS = {
  tolerance: 5,
  overtimeCapMin: 120,
  overtimeRate: 1.5,
  fgtsRate: 0.08,
  absenceDivisor: 30,
};

export const paramsFromTable = (table) => ({
  tolerance: table?.tolerance_minutes ?? DEFAULT_PARAMS.tolerance,
  overtimeCapMin: table?.overtime_cap_minutes ?? DEFAULT_PARAMS.overtimeCapMin,
  overtimeRate: Number(table?.overtime_rate) || DEFAULT_PARAMS.overtimeRate,
  fgtsRate: Number(table?.fgts_rate) || DEFAULT_PARAMS.fgtsRate,
  absenceDivisor: Number(table?.absence_divisor) || DEFAULT_PARAMS.absenceDivisor,
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

// O contribuinte usa a opção mais favorável: deduções legais (INSS + dependentes) ou desconto simplificado.
export function calcIrrf({ earnings, inss, dependents, table, paymentDate }) {
  if (!table) return { tax: 0, base: 0 };
  const dependentsDeduction = (Number(table.irrf_dependent_deduction) || 0) * (Number(dependents) || 0);
  const legalDeductions = Number(inss || 0) + dependentsDeduction;
  const simplified = Number(table.irrf_simplified_discount) || 0;
  const base = round2(Math.max(0, earnings - Math.max(legalDeductions, simplified)));
  const grossTax = irrfTax(base, table.irrf_bands);
  const reduction = paymentDate?.startsWith('2026-') && earnings <= 7350
    ? (earnings <= 5000 ? 312.89 : round2(978.62 - .133145 * earnings)) : 0;
  return { tax: round2(Math.max(0, grossTax - reduction)), base };
}

// FGTS: 8% regra geral, 2% para aprendiz e não aplicável a estágio (sem vínculo de emprego).
export function fgtsRateFor(employee, table) {
  const contract = (employee?.contract_type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (contract.includes('estagio')) return 0;
  if (contract.includes('aprendiz')) return 0.02;
  return Number(table?.fgts_rate) || DEFAULT_PARAMS.fgtsRate;
}

export const toMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const effectiveTime = (r) => r?.corrected_time || r?.original_time || null;

export function groupByDay(records) {
  const days = {};
  records.forEach((r) => {
    days[r.date] = days[r.date] || {};
    days[r.date][r.kind] = r;
  });
  return days;
}

export function scheduledMinutes(s) {
  const gross = toMin(s.exit_time) - toMin(s.entry_time);
  const brk = s.break_start && s.break_end ? toMin(s.break_end) - toMin(s.break_start) : 0;
  return gross - brk;
}

export function dayStats(day, s, params = DEFAULT_PARAMS) {
  const e = toMin(effectiveTime(day.entry));
  const x = toMin(effectiveTime(day.exit));
  if (e == null || x == null || !s) return { worked: 0, late: 0, overtime: 0, incomplete: true };
  const bs = toMin(effectiveTime(day.break_start));
  const be = toMin(effectiveTime(day.break_end));
  const brk = bs != null && be != null ? be - bs : 0;
  const worked = Math.max(0, x - e - brk);
  const lateRaw = e - toMin(s.entry_time);
  const late = lateRaw > params.tolerance ? lateRaw : 0;
  const extra = worked - scheduledMinutes(s);
  const overtime = extra > params.tolerance ? extra : 0;
  return { worked, late, overtime, incomplete: false };
}

export function monthStats(records, schedule, competence, params = DEFAULT_PARAMS, admissionDate = '') {
  const days = groupByDay(records);
  const acc = { worked: 0, late: 0, overtime: 0, absences: 0, absentDates: [] };
  Object.values(days).forEach((d) => {
    const s = dayStats(d, schedule, params);
    acc.worked += s.worked;
    acc.late += s.late;
    acc.overtime += s.overtime;
  });
  if (!schedule) return acc;
  const [y, m] = competence.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  for (let d = 1; d <= last; d++) {
    const iso = `${competence}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    if (iso < today && (!admissionDate || iso >= admissionDate) && (schedule.work_days || []).includes(dow) && !days[iso]) {
      acc.absences += 1;
      acc.absentDates.push(iso);
    }
  }
  return acc;
}

// Dados mínimos sem os quais a folha não pode ser calculada.
export function validatePayrollInput({ employee, schedule, table }) {
  const problems = [];
  if (!employee) problems.push('Selecione o funcionário.');
  if (employee && !(Number(employee.base_salary) > 0)) problems.push('Salário-base não informado — complete o cadastro do funcionário.');
  if (employee && !employee.admission_date) problems.push('Data de admissão não informada — complete o cadastro do funcionário.');
  if (!schedule) problems.push('Jornada de trabalho não definida — sem ela não é possível apurar atrasos, faltas e horas extras.');
  if (!table) problems.push('Nenhuma tabela legal vigente para esta competência. Cadastre ou ajuste a vigência em Parâmetros legais.');
  return problems;
}

export function buildPayroll({ employee, positionName, competence, stats, rubrics = [], table, paymentDate, taxDependents }) {
  const p = paramsFromTable(table);
  const salary = Number(employee.base_salary) || 0;
  const weekly = Number(employee.weekly_hours) || 44;
  const monthlyHours = weekly * 5; // 44h/semana = 220h/mês
  const hourly = salary / monthlyHours;

  const earnings = [{ description: 'Salário-base', value: round2(salary) }];
  const overtimeValue = round2((stats.overtime / 60) * hourly * p.overtimeRate);
  if (overtimeValue > 0) {
    const percent = Math.round((p.overtimeRate - 1) * 100);
    earnings.push({ description: `Horas extras ${percent}% (${fmtMin(stats.overtime)}h)`, value: overtimeValue });
  }
  if (stats.dsrExtra > 0) earnings.push({description:'Reflexo de extras no DSR', value:stats.dsrExtra});
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
  if (stats.dsrDiscount > 0) deductions.push({description:'Perda de DSR conferida',value:stats.dsrDiscount});
  const taxable = round2(total_earnings - deductions.reduce((a,b) => a+b.value,0));
  const inss = calcInss(taxable,table.inss_bands);
  const dependents = taxDependents;
  const irrf = calcIrrf({earnings:taxable,inss,dependents,table,paymentDate});
  deductions.push({description:'INSS',value:inss});
  if (irrf.tax > 0) deductions.push({description:'IRRF',value:irrf.tax});
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