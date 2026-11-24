import { monthRange, validDate } from './attendance.js';
import { auditMonth, scheduleProblem } from './attendanceAudit.js';
import { scheduledMinutes } from './payrollCalculation.js';

// Conferência mensal de frequência: o mês chega já apurado automaticamente.
// O RH só registra decisões sobre as faltas presumidas (justificar, afastar,
// comprovar presença sem marcação ou confirmar o desconto). Nunca há presença
// presumida e nenhum horário é inventado.
export const MIN_JUSTIFICATION = 10;
export const MIN_BASIS = 20;

export const SITUATIONS = [
  { value: 'falta_justificada', label: 'Justificar ausência (abonada)' },
  { value: 'afastamento', label: 'Afastamento legal' },
  { value: 'presenca', label: 'Presença comprovada sem marcação' },
  { value: 'falta_injustificada', label: 'Confirmar falta (desconta)' },
];
export const SITUATION_VALUES = SITUATIONS.map((item) => item.value);

// Dias de jornada da competência, respeitando a data de admissão.
export function scheduledDays(schedule, competence, admissionDate = '') {
  if (scheduleProblem(schedule)) return [];
  const last = Number(monthRange(competence).$lte.slice(-2));
  const first = validDate(admissionDate) && admissionDate.startsWith(competence + '-')
    ? admissionDate : competence + '-01';
  const days = [];
  for (let day = 1; day <= last; day++) {
    const date = competence + '-' + String(day).padStart(2, '0');
    if (date < first) continue;
    if (!schedule.work_days.includes(new Date(date).getUTCDay())) continue;
    days.push(date);
  }
  return days;
}

export function conferenceSummary(days = []) {
  const count = (value) => (Array.isArray(days) ? days : []).filter((day) => day?.situation === value).length;
  return {
    present_days: count('presenca'),
    justified_absences: count('falta_justificada'),
    unjustified_absences: count('falta_injustificada'),
    leave_days: count('afastamento'),
  };
}

// Início da semana (domingo) de uma data: cada semana com falta injustificada
// perde um dia de descanso semanal remunerado.
export function weekStart(date) {
  const parsed = new Date(date + 'T00:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate() - parsed.getUTCDay());
  return parsed.toISOString().slice(0, 10);
}

export function validateConference(conference, {
  employee, schedule, competence, marks = [], vacations = [], tolerance = 5, today = '',
}) {
  const audit = auditMonth({
    marks,
    schedule,
    competence,
    vacations,
    admissionDate: employee?.admission_date,
    employeeStatus: employee?.status,
    statusDate: employee?.status_date,
    tolerance,
    today,
  });
  if (!audit.days.length) {
    return {
      problems: audit.problems.length
        ? audit.problems
        : ['Não há dias de jornada nesta competência para conferir.'],
      audit,
    };
  }
  if (conference?.status !== 'autorizada') {
    return { problems: ['A conferência de frequência ainda não foi autorizada pelo RH.'], audit };
  }
  const problems = [...audit.problems];
  if (String(conference?.basis || '').trim().length < MIN_BASIS) {
    problems.push('A conferência precisa descrever como a frequência do período foi comprovada.');
  }
  const pending = audit.days.filter((day) => day.kind === 'pendencia').map((day) => day.date);
  if (pending.length) {
    problems.push('Pendência de ponto em ' + pending.join(', ') +
      ': corrija as marcações incompletas na Correção de Ponto antes de autorizar.');
  }
  const byDate = new Map(audit.days.map((day) => [day.date, day]));
  const applied = new Map();
  for (const decision of Array.isArray(conference?.days) ? conference.days : []) {
    const day = byDate.get(decision?.date);
    if (!day) {
      problems.push('Decisão para data fora da competência: ' + (decision?.date || '—') + '.');
      continue;
    }
    if (day.kind !== 'falta_presumida') {
      problems.push('A data ' + day.date + ' não é falta presumida (apuração automática: ' + day.kind + ').');
      continue;
    }
    if (!SITUATION_VALUES.includes(decision.situation)) {
      problems.push('Situação inválida em ' + day.date + '.');
      continue;
    }
    if (applied.has(day.date)) {
      problems.push('Data repetida na conferência: ' + day.date + '.');
      continue;
    }
    applied.set(day.date, decision);
    if (decision.situation !== 'falta_injustificada') {
      if (String(decision.justification || '').trim().length < MIN_JUSTIFICATION) {
        problems.push('Justificativa obrigatória em ' + day.date + '.');
      }
      if (!String(decision.evidence_uri || '').trim()) {
        problems.push('Anexe a evidência do dia ' + day.date + '.');
      }
    }
  }

  let worked = audit.stats.worked;
  const unpaid = [];
  const justified = [];
  for (const day of audit.days) {
    if (day.kind !== 'falta_presumida') continue;
    const decision = applied.get(day.date);
    if (!decision || decision.situation === 'falta_injustificada') {
      unpaid.push(day.date);
      continue;
    }
    justified.push(day.date);
    if (decision.situation === 'presenca') worked += scheduledMinutes(schedule);
  }
  const weeks = new Set(unpaid.map(weekStart));

  return {
    problems,
    audit,
    stats: {
      worked,
      late: audit.stats.late,
      overtime: audit.stats.overtime,
      absences: unpaid.length,
      pending: audit.stats.pending,
    },
    paid_days: [...audit.paid_days, ...justified].sort(),
    unpaid_days: unpaid,
    justified_days: justified,
    dsr_lost_days: weeks.size,
  };
}
