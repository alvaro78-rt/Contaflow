import { round2 } from '@/lib/format';
import { calcInss, calcIrrf, fgtsRateFor } from '@/lib/payroll';

const DAY = 86400000;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const addMonths = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY) + 1;

// Meses do período com pelo menos 15 dias trabalhados (regra dos avos).
export function monthsWithQuinzena(start, end) {
  if (!start || !end || start > end) return 0;
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let total = 0;
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    const lastDay = new Date(y, m, 0).getDate();
    const from = start > `${prefix}-01` ? start : `${prefix}-01`;
    const to = end < `${prefix}-${lastDay}` ? end : `${prefix}-${lastDay}`;
    if (daysBetween(from, to) >= 15) total += 1;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return total;
}

export const thirteenthMonths = (admission, date, year) => {
  const start = admission && admission > `${year}-01-01` ? admission : `${year}-01-01`;
  return monthsWithQuinzena(start, date);
};

// Início do período aquisitivo em curso (último aniversário de admissão).
export const currentAcquisitionStart = (admission, date) => {
  if (!admission || !date) return null;
  const [ay, am, ad] = admission.split('-').map(Number);
  const year = Number(date.slice(0, 4));
  const mm = String(am).padStart(2, '0');
  const dd = String(ad).padStart(2, '0');
  const thisYear = `${year}-${mm}-${dd}`;
  if (thisYear <= date && thisYear >= admission) return thisYear;
  const previous = `${year - 1}-${mm}-${dd}`;
  return previous >= admission ? previous : admission;
};

export const fullYears = (from, to) => {
  if (!from || !to) return 0;
  let years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  if (to.slice(5) < from.slice(5)) years -= 1;
  return Math.max(0, years);
};

const base = (employee, positionName, table) => ({
  employee_id: employee.id,
  employee_name: employee.full_name,
  employee_cpf: employee.cpf,
  position_name: positionName || '',
  department: employee.department || '',
  base_salary: round2(Number(employee.base_salary) || 0),
  legal_table_label: table?.label || '',
});

const totals = (earnings, deductions) => {
  const total_earnings = round2(earnings.reduce((a, b) => a + b.value, 0));
  const total_deductions = round2(deductions.reduce((a, b) => a + b.value, 0));
  return { earnings, deductions, total_earnings, total_deductions, net_salary: round2(total_earnings - total_deductions) };
};

// Férias: 30 dias corridos, 1/3 constitucional, abono de até 10 dias (isento) e
// pagamento em dobro quando o período concessivo já venceu (CLT, art. 137).
export function calcVacation({ employee, table, positionName, acquiredStart, acquiredEnd, startDate, days, abonoDays }) {
  const salary = Number(employee.base_salary) || 0;
  const daily = salary / 30;
  const abono = Math.min(10, Math.max(0, Number(abonoDays) || 0));
  const gozo = Math.min(30 - abono, Math.max(0, Number(days) || 0));

  const vacationValue = round2(daily * gozo);
  const third = round2(vacationValue / 3);
  const abonoValue = round2(daily * abono);
  const abonoThird = round2(abonoValue / 3);

  const concessiveEnd = acquiredEnd ? addDays(addMonths(acquiredEnd, 12), -1) : '';
  const expired = !!concessiveEnd && todayIso() > concessiveEnd;
  const double = expired ? round2(vacationValue + third) : 0;

  const taxable = round2(vacationValue + third + double);
  const inss = calcInss(taxable, table?.inss_bands);
  const dependents = (employee.dependents || []).length;
  const irrf = calcIrrf({ earnings: taxable, inss, dependents, table });
  const fgtsRate = fgtsRateFor(employee, table);

  const earnings = [
    { description: `Férias — ${gozo} dia(s)`, value: vacationValue },
    { description: '1/3 constitucional', value: third },
  ];
  if (double > 0) earnings.push({ description: 'Dobra de férias vencidas (art. 137)', value: double });
  if (abono > 0) {
    earnings.push({ description: `Abono pecuniário — ${abono} dia(s) (isento)`, value: abonoValue });
    earnings.push({ description: '1/3 do abono (isento)', value: abonoThird });
  }
  const deductions = [{ description: 'INSS', value: inss }];
  if (irrf.tax > 0) deductions.push({ description: 'IRRF', value: irrf.tax });

  return {
    ...base(employee, positionName, table),
    competence: startDate ? startDate.slice(0, 7) : '',
    acquired_start: acquiredStart || '',
    acquired_end: acquiredEnd || '',
    concessive_end: concessiveEnd,
    start_date: startDate || '',
    end_date: startDate && gozo > 0 ? addDays(startDate, gozo - 1) : '',
    days: gozo,
    abono_days: abono,
    expired,
    ...totals(earnings, deductions),
    informatives: [{ description: `FGTS sobre férias (${Math.round(fgtsRate * 100)}%)`, value: round2(taxable * fgtsRate) }],
    calc_memory: {
      daily: round2(daily),
      taxable_base: taxable,
      irrf_base: irrf.base,
      abono_value: round2(abonoValue + abonoThird),
      fgts_rate: fgtsRate,
      fgts_value: round2(taxable * fgtsRate),
      dependents,
    },
    status: 'programada',
  };
}

// 13º: bruto proporcional aos avos, INSS e IRRF sobre o bruto; a 1ª parcela é
// metade sem descontos e a 2ª parcela recebe os descontos integrais.
export function calcThirteenth({ employee, table, positionName, year, months }) {
  const salary = Number(employee.base_salary) || 0;
  const avos = Math.min(12, Math.max(0, Number(months) || 0));
  const gross = round2((salary * avos) / 12);
  const inss = calcInss(gross, table?.inss_bands);
  const dependents = (employee.dependents || []).length;
  const irrf = calcIrrf({ earnings: gross, inss, dependents, table });
  const first = round2(gross / 2);
  const second = round2(gross - first - inss - irrf.tax);
  const fgtsRate = fgtsRateFor(employee, table);

  const earnings = [{ description: `13º salário — ${avos}/12 avos`, value: gross }];
  const deductions = [{ description: 'INSS', value: inss }];
  if (irrf.tax > 0) deductions.push({ description: 'IRRF', value: irrf.tax });

  return {
    ...base(employee, positionName, table),
    year: String(year),
    competence: `${year}-12`,
    months_worked: avos,
    gross,
    first_parcel: first,
    second_parcel: second,
    inss,
    irrf: irrf.tax,
    ...totals(earnings, deductions),
    informatives: [
      { description: '1ª parcela (até 30/11, sem descontos)', value: first },
      { description: '2ª parcela (com INSS e IRRF)', value: second },
      { description: `FGTS sobre o 13º (${Math.round(fgtsRate * 100)}%)`, value: round2(gross * fgtsRate) },
    ],
    calc_memory: { irrf_base: irrf.base, fgts_rate: fgtsRate, fgts_value: round2(gross * fgtsRate), dependents },
    status: 'a_pagar',
  };
}

export const TERMINATION_TYPE_LABEL = {
  sem_justa_causa: 'Dispensa sem justa causa',
  com_justa_causa: 'Dispensa por justa causa',
  pedido: 'Pedido de demissão',
  acordo: 'Acordo entre as partes',
  termino: 'Término do contrato',
};

// Rescisão: saldo de salário, aviso prévio, férias vencidas e proporcionais com
// 1/3, 13º proporcional, descontos de INSS/IRRF e multa do FGTS.
export function calcTermination({ employee, table, positionName, type, date, notice, vencidasDays, fgtsBalance, extraDiscounts }) {
  const salary = Number(employee.base_salary) || 0;
  const daily = salary / 30;
  const dayOfMonth = Number(date.slice(8, 10));
  const saldo = round2(daily * dayOfMonth);

  const years = fullYears(employee.admission_date, date);
  const noticeDays = notice === 'trabalhado' ? 30 : Math.min(90, 30 + 3 * years);
  const noticeValue = notice === 'indenizado' && type === 'sem_justa_causa'
    ? round2(daily * noticeDays)
    : notice === 'indenizado' && type === 'acordo' ? round2(daily * noticeDays * 0.5) : 0;

  const entitled = type !== 'com_justa_causa';
  const acquisitionStart = currentAcquisitionStart(employee.admission_date, date);
  const vacationMonths = entitled ? Math.min(12, monthsWithQuinzena(acquisitionStart, date)) : 0;
  const vacationValue = round2((salary / 12) * vacationMonths);
  const vacationThird = round2(vacationValue / 3);

  const vencidas = round2(daily * (Number(vencidasDays) || 0));
  const vencidasThird = round2(vencidas / 3);

  const months13 = entitled ? thirteenthMonths(employee.admission_date, date, Number(date.slice(0, 4))) : 0;
  const thirteenth = round2((salary * months13) / 12);

  const fineRate = type === 'sem_justa_causa' ? 0.4 : type === 'acordo' ? 0.2 : 0;
  const fine = round2((Number(fgtsBalance) || 0) * fineRate);

  const dependents = (employee.dependents || []).length;
  const inss = calcInss(saldo, table?.inss_bands);
  const irrf = calcIrrf({ earnings: saldo, inss, dependents, table });
  const inss13 = calcInss(thirteenth, table?.inss_bands);
  const irrf13 = calcIrrf({ earnings: thirteenth, inss: inss13, dependents, table });

  const earnings = [
    { description: `Saldo de salário — ${dayOfMonth} dia(s)`, value: saldo },
    ...(noticeValue > 0 ? [{ description: `Aviso prévio indenizado — ${noticeDays} dia(s)`, value: noticeValue }] : []),
    ...(vencidas > 0 ? [{ description: 'Férias vencidas', value: vencidas }, { description: '1/3 sobre férias vencidas', value: vencidasThird }] : []),
    ...(vacationValue > 0 ? [{ description: `Férias proporcionais — ${vacationMonths}/12`, value: vacationValue }, { description: '1/3 sobre férias proporcionais', value: vacationThird }] : []),
    ...(thirteenth > 0 ? [{ description: `13º proporcional — ${months13}/12`, value: thirteenth }] : []),
    ...(fine > 0 ? [{ description: `Multa do FGTS (${Math.round(fineRate * 100)}%)`, value: fine }] : []),
  ];

  const deductions = [];
  if (inss > 0) deductions.push({ description: 'INSS', value: inss });
  if (irrf.tax > 0) deductions.push({ description: 'IRRF', value: irrf.tax });
  if (inss13 > 0) deductions.push({ description: 'INSS sobre 13º', value: inss13 });
  if (irrf13.tax > 0) deductions.push({ description: 'IRRF sobre 13º', value: irrf13.tax });
  if (Number(extraDiscounts) > 0) deductions.push({ description: 'Outros descontos', value: round2(Number(extraDiscounts)) });

  return {
    ...base(employee, positionName, table),
    competence: date ? date.slice(0, 7) : '',
    termination_date: date || '',
    type,
    notice,
    notice_days: noticeDays,
    notice_value: noticeValue,
    vencidas_days: Number(vencidasDays) || 0,
    months_13: months13,
    months_vacation: vacationMonths,
    fgts_balance: round2(Number(fgtsBalance) || 0),
    fgts_fine_rate: fineRate,
    fgts_fine: fine,
    ...totals(earnings, deductions),
    informatives: [
      ...(type === 'com_justa_causa' ? [{ description: 'Justa causa: sem aviso prévio, férias proporcionais, 13º proporcional e multa do FGTS', value: 0 }] : []),
      ...(notice === 'trabalhado' ? [{ description: 'Aviso prévio trabalhado: os 30 dias já estão no saldo de salário do mês', value: 0 }] : []),
      { description: 'Férias vencidas e proporcionais são indenizatórias (sem INSS e IRRF)', value: 0 },
    ],
    calc_memory: {
      daily: round2(daily),
      salary: round2(salary),
      irrf_base: irrf.base,
      inss_13: inss13,
      irrf_13: irrf13.tax,
      years,
    },
    status: 'registrada',
  };
}