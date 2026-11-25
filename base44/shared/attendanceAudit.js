import { NATIONAL_HOLIDAYS_2026, monthRange, validDate, validTime } from './attendance.js';
import { dayReview } from './payrollReview.js';

// Apuração automática do mês: compara as marcações com a jornada cadastrada e
// classifica cada dia. Faltas são presumidas apenas em dias de jornada encerrados
// sem nenhuma marcação; marcações incompletas viram pendência, nunca falta.
// Folgas, feriados nacionais, férias e afastamentos registrados nunca geram falta.

export const localToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());

export const DAY_LABEL = {
  presenca: 'Presença',
  falta_presumida: 'Falta presumida',
  pendencia: 'Pendência de ponto',
  folga: 'Folga',
  feriado: 'Feriado',
  ferias: 'Férias',
  afastamento: 'Afastamento',
  futuro: 'Dia futuro',
  em_andamento: 'Dia em andamento',
};

export const emptyStats = () => ({ worked: 0, late: 0, overtime: 0, absences: 0, pending: 0 });

export function scheduleProblem(schedule) {
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
    return 'Confira os horários e os dias da jornada antes de apurar a frequência.';
  }
  return '';
}

export function auditMonth({
  marks = [],
  schedule,
  competence,
  vacations = [],
  admissionDate = '',
  employeeStatus = '',
  statusDate = '',
  tolerance = 5,
  today = '',
}) {
  const issue = scheduleProblem(schedule);
  if (issue) return { problems: [issue], days: [], stats: emptyStats(), paid_days: [] };

  const range = monthRange(competence);
  const first = validDate(admissionDate) && admissionDate.startsWith(competence + '-')
    ? admissionDate : competence + '-01';
  const closedOn = today || localToday();
  const problems = [];
  const byDate = new Map();
  for (const row of marks) {
    if (!validDate(row?.date) || !row.date.startsWith(competence + '-') || row.date < first) {
      return { problems: ['Data de ponto inválida.'], days: [], stats: emptyStats(), paid_days: [] };
    }
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }

  const ranges = vacations.filter((item) => validDate(item?.start_date) && validDate(item?.end_date));
  const onVacation = (date) => ranges.some((item) => item.start_date <= date && date <= item.end_date);
  const onLeave = (date) => employeeStatus === 'afastado' &&
    (!validDate(statusDate) || date >= statusDate);

  const days = [];
  const stats = emptyStats();
  const paid = [];
  const last = Number(range.$lte.slice(-2));

  for (let day = 1; day <= last; day++) {
    const date = competence + '-' + String(day).padStart(2, '0');
    if (date < first) continue;
    const dayMarks = byDate.get(date) || [];
    const workDay = schedule.work_days.includes(new Date(date).getUTCDay());
    const holiday = NATIONAL_HOLIDAYS_2026.has(date);
    let kind = 'folga';
    let detail = { worked: 0, late: 0, overtime: 0 };

    if (date > closedOn) kind = 'futuro';
    else if (!workDay) kind = 'folga';
    else if (holiday) kind = 'feriado';
    else if (onVacation(date)) kind = 'ferias';
    else if (onLeave(date)) kind = 'afastamento';
    else if (dayMarks.length) {
      const review = dayReview(dayMarks, schedule, date, tolerance);
      if (review.problems.length && date === closedOn) {
        kind = 'em_andamento';
      } else if (review.problems.length) {
        kind = 'pendencia';
        problems.push(...review.problems);
      } else {
        kind = 'presenca';
        detail = review;
      }
    } else {
      kind = date === closedOn ? 'em_andamento' : 'falta_presumida';
    }

    if (holiday && dayMarks.length) {
      problems.push('Trabalho em feriado nacional (' + date + ') exige apuração específica.');
    }
    if (!workDay && dayMarks.length) {
      problems.push('Trabalho em folga exige apuração específica em ' + date + '.');
    }
    if (kind === 'presenca') {
      stats.worked += detail.worked;
      stats.late += detail.late;
      stats.overtime += detail.overtime;
    }
    if (kind === 'falta_presumida') stats.absences += 1;
    if (kind === 'pendencia') stats.pending += 1;
    if (['feriado', 'ferias', 'afastamento'].includes(kind)) paid.push(date);
    days.push({
      date,
      kind,
      marks: dayMarks.length,
      holiday,
      worked: detail.worked,
      late: detail.late,
      overtime: detail.overtime,
    });
  }

  return { days, stats, problems, paid_days: paid };
}