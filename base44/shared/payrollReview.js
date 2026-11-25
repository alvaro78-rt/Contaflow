import { toMin } from './payrollCalculation.js';
import { monthRange, validDate, validMarks, validTime } from './attendance.js';

// Valores publicados para 2026 pelo INSS (Portaria MPS/MF 13) e pela Receita Federal.
const inss2026 = [[1621, .075], [2902.84, .09], [4354.27, .12], [8475.55, .14]];
const irrf2026 = [[2428.8, 0, 0], [2826.65, .075, 182.16], [3751.05, .15, 394.16], [4664.68, .225, 675.49], [
  null,
  .275,
  908.73,
]];

const bandMatches = (bands, reference) =>
  Array.isArray(bands) && bands.length === reference.length &&
  [...bands].sort((a, b) => a.limit - b.limit).every((b, i) => {
    const [limit, rate, deduction] = reference[i];
    return (limit === null ? Number.isFinite(b.limit) && b.limit > 4664.68 : b.limit === limit) &&
      b.rate === rate && (deduction === undefined || b.deduction === deduction);
  });

// Diagnóstico por parâmetro divergente: cada divergência tem mensagem própria.
export function tableParameterProblems(table) {
  if (!table) return ['Nenhuma tabela legal foi selecionada para o cálculo.'];
  const name = `"${table.label || table.start_competence || 'sem nome'}"`;
  const problems = [];
  if (!bandMatches(table.inss_bands, inss2026)) {
    problems.push(`As faixas de INSS da tabela legal ${name} não conferem com a referência oficial de 2026 (limites e alíquotas).`);
  }
  if (!bandMatches(table.irrf_bands, irrf2026)) {
    problems.push(`As faixas, alíquotas ou parcelas a deduzir de IRRF da tabela legal ${name} não conferem com a referência oficial de 2026.`);
  }
  if (table.irrf_dependent_deduction !== 189.59) {
    problems.push(`A dedução por dependente do IRRF da tabela legal ${name} deve ser R$ 189,59 (cadastrada: ${table.irrf_dependent_deduction ?? 'não informada'}).`);
  }
  if (table.irrf_simplified_discount !== 607.2) {
    problems.push(`O desconto simplificado do IRRF da tabela legal ${name} deve ser R$ 607,20 (cadastrado: ${table.irrf_simplified_discount ?? 'não informado'}).`);
  }
  if (table.fgts_rate !== .08) {
    problems.push(`A alíquota de FGTS da tabela legal ${name} deve ser 8% no regime CLT (cadastrada: ${table.fgts_rate ?? 'não informada'}).`);
  }
  if (![table.tolerance_minutes, table.overtime_cap_minutes].every((n) => Number.isInteger(n) && n >= 0)) {
    problems.push(`A tolerância de marcação e o limite diário de horas extras da tabela legal ${name} devem ser minutos inteiros.`);
  }
  if (!Number.isFinite(table.overtime_rate) || table.overtime_rate < 1.5) {
    problems.push(`O adicional de hora extra da tabela legal ${name} deve ser de pelo menos 50%.`);
  }
  if (!Number.isFinite(table.absence_divisor) || table.absence_divisor <= 0) {
    problems.push(`O divisor de faltas da tabela legal ${name} deve ser maior que zero.`);
  }
  return problems;
}

export function verifiedTable(table, competence, payment) {
  if (!table || !validDate(payment) || !competence.startsWith('2026-') || !payment.startsWith('2026-')) {
    return false;
  }
  return tableParameterProblems(table).length === 0;
}

// Apuração de um único dia a partir das marcações: usada pela revisão manual e
// pela apuração automática do mês. Nunca presume horários ausentes.
export function dayReview(records, schedule, date, tolerance = 5) {
  if (!validMarks(records, true)) {
    return { problems: ['Confira entrada, saída e intervalo em ' + date + '.'], worked: 0, late: 0, overtime: 0 };
  }
  const byKind = Object.fromEntries(records.map((r) => [r.kind, r.corrected_time || r.original_time]));
  const expected = {
    entry: schedule.entry_time,
    exit: schedule.exit_time,
    break_start: schedule.break_start,
    break_end: schedule.break_end,
  };
  const variations = Object.entries(expected).map(([kind, t]) => {
    if (!byKind[kind] && !t) return 0;
    return t && byKind[kind] ? Math.abs(toMin(t) - toMin(byKind[kind])) : Infinity;
  });
  if (
    variations.includes(Infinity) || byKind.break_start !== (expected.break_start || undefined) ||
    byKind.break_end !== (expected.break_end || undefined) || byKind.entry < '05:00' ||
    byKind.exit > '22:00'
  ) {
    return {
      problems: ['Intervalo divergente ou jornada noturna em ' + date + '. Faça a apuração complementar.'],
      worked: 0,
      late: 0,
      overtime: 0,
    };
  }
  const start = toMin(byKind.entry), end = toMin(byKind.exit);
  const scheduledStart = toMin(schedule.entry_time), scheduledEnd = toMin(schedule.exit_time);
  if (end <= scheduledStart || start >= scheduledEnd) {
    return {
      problems: ['Turno diferente da jornada cadastrada em ' + date + '.'],
      worked: 0,
      late: 0,
      overtime: 0,
    };
  }
  const pause = byKind.break_start ? toMin(byKind.break_end) - toMin(byKind.break_start) : 0;
  const result = { problems: [], worked: end - start - pause, late: 0, overtime: 0 };
  if (variations.some((n) => n > Math.min(5, tolerance)) || variations.reduce((a, b) => a + b, 0) > 10) {
    result.overtime = Math.max(0, scheduledStart - start) + Math.max(0, end - scheduledEnd);
    result.late = Math.max(0, start - scheduledStart) + Math.max(0, scheduledEnd - end);
  }
  return result;
}

export function reviewAttendance(records, schedule, competence, paidDays, unpaidDays, tolerance = 5, admissionDate = '') {
  const problems = [];
  const stats = { worked: 0, late: 0, overtime: 0, absences: 0 };
  if (
    !schedule?.work_days?.length ||
    !schedule.work_days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
    !validTime(schedule.entry_time) || !validTime(schedule.exit_time) ||
    schedule.entry_time >= schedule.exit_time ||
    Boolean(schedule.break_start) !== Boolean(schedule.break_end) ||
    (schedule.break_start && !(validTime(schedule.break_start) && validTime(schedule.break_end) &&
      schedule.entry_time <= schedule.break_start && schedule.break_start < schedule.break_end &&
      schedule.break_end <= schedule.exit_time))
  ) {
    return { problems: ['Confira os horários e os dias da jornada.'] };
  }
  if (![paidDays, unpaidDays].every((list) => Array.isArray(list) && list.length <= 31)) {
    return { problems: ['Confira as datas de folga e faltas descontáveis.'] };
  }
  const firstDate = validDate(admissionDate) && admissionDate.startsWith(competence + '-')
    ? admissionDate : competence + '-01';
  const classified = [...paidDays, ...unpaidDays];
  if (
    new Set(classified).size !== classified.length || classified.some((d) =>
      !validDate(d) || d < firstDate ||
      !d.startsWith(competence + '-') || !schedule.work_days.includes(new Date(d).getUTCDay())
    )
  ) {
    return { problems: ['Datas duplicadas ou fora dos dias da jornada nesta competência.'] };
  }
  stats.absences = unpaidDays.length;
  const days = new Map();
  for (const row of records) {
    if (!validDate(row.date) || !row.date.startsWith(competence + '-') || row.date < firstDate) {
      return { problems: ['Data de ponto inválida.'] };
    }
    if (!days.has(row.date)) days.set(row.date, []);
    days.get(row.date).push(row);
  }
  for (const [date, marks] of days) {
    const review = dayReview(marks, schedule, date, tolerance);
    problems.push(...review.problems);
    stats.worked += review.worked;
    stats.late += review.late;
    stats.overtime += review.overtime;
    if (!schedule.work_days.includes(new Date(date).getUTCDay()) || classified.includes(date)) {
      problems.push('Trabalho em folga ou feriado exige apuração específica em ' + date + '.');
    }
  }
  const end = Number(monthRange(competence).$lte.slice(-2));
  for (let day = 1; day <= end; day++) {
    const date = competence + '-' + String(day).padStart(2, '0');
    if (
      date >= firstDate && schedule.work_days.includes(new Date(date).getUTCDay()) &&
      !days.has(date) && !classified.includes(date)
    ) {
      problems.push('Dia de jornada sem classificação: ' + date + '.');
    }
  }
  return { problems, stats };
}

export function consistentReceipt(row) {
  const cents = (n) => Math.round(n * 100);
  const sum = (items) => items.reduce((s, item) => s + cents(item.value), 0);
  const money = (n) =>
    Number.isFinite(n) && n >= 0 && Number.isSafeInteger(cents(n)) && Math.abs(n * 100 - cents(n)) < .00001;
  return [row.earnings, row.deductions].every((items) =>
    Array.isArray(items) &&
    items.every((i) => typeof i?.description === 'string' && i.description.trim() && money(i.value))
  ) &&
    row.earnings.length > 0 && [row.total_earnings, row.total_deductions, row.net_salary].every(money) &&
    sum(row.earnings) === cents(row.total_earnings) && sum(row.deductions) === cents(row.total_deductions) &&
    cents(row.net_salary) === sum(row.earnings) - sum(row.deductions);
}
