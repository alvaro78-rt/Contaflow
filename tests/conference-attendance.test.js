import assert from 'node:assert/strict';
import test from 'node:test';
import { auditMonth } from '../base44/shared/attendanceAudit.js';
import {
  conferenceSummary,
  scheduledDays,
  validateConference,
} from '../base44/shared/conferenceAttendance.js';

const schedule = {
  work_days: [1, 2, 3, 4, 5],
  entry_time: '08:00',
  exit_time: '17:00',
  break_start: '12:00',
  break_end: '13:00',
};
const employee = { admission_date: '2025-01-01', status: 'ativo' };
const competence = '2026-01';
const basis = 'Frequência apurada pelas marcações do ponto e conferida pelo RH.';

const complete = (date) => [
  { date, kind: 'entry', original_time: '08:00' },
  { date, kind: 'break_start', original_time: '12:00' },
  { date, kind: 'break_end', original_time: '13:00' },
  { date, kind: 'exit', original_time: '17:00' },
];

const marksWithout = (...dates) => scheduledDays(schedule, competence)
  .filter((date) => date !== '2026-01-01' && !dates.includes(date))
  .flatMap(complete);

const byDate = (audit) => Object.fromEntries(audit.days.map((day) => [day.date, day]));

test('apuração automática classifica presença, falta presumida, folga e feriado', () => {
  const audit = auditMonth({ marks: complete('2026-01-02'), schedule, competence });
  const days = byDate(audit);
  assert.equal(days['2026-01-02'].kind, 'presenca');
  assert.equal(days['2026-01-02'].worked, 480);
  assert.equal(days['2026-01-05'].kind, 'falta_presumida');
  assert.equal(days['2026-01-01'].kind, 'feriado');
  assert.equal(days['2026-01-03'].kind, 'folga');
  assert.equal(audit.stats.absences, 20);
  assert.equal(audit.stats.worked, 480);
  assert.equal(audit.stats.pending, 0);
});

test('marcação incompleta vira pendência de ponto, nunca falta', () => {
  const marks = [{ date: '2026-01-02', kind: 'entry', original_time: '08:00' }];
  const audit = auditMonth({ marks, schedule, competence });
  const day = byDate(audit)['2026-01-02'];
  assert.equal(day.kind, 'pendencia');
  assert.equal(audit.stats.pending, 1);
  assert.equal(audit.stats.absences, 20);
  assert.ok(audit.problems.some((problem) => problem.includes('2026-01-02')));
});

test('férias e afastamento registrados não geram falta', () => {
  const vacation = auditMonth({
    marks: [],
    schedule,
    competence,
    vacations: [{ start_date: '2026-01-05', end_date: '2026-01-16' }],
  });
  assert.equal(byDate(vacation)['2026-01-06'].kind, 'ferias');
  assert.equal(byDate(vacation)['2026-01-19'].kind, 'falta_presumida');

  const leave = auditMonth({
    marks: [],
    schedule,
    competence,
    employeeStatus: 'afastado',
    statusDate: '2026-01-05',
  });
  assert.equal(byDate(leave)['2026-01-06'].kind, 'afastamento');
  assert.equal(byDate(leave)['2026-01-02'].kind, 'falta_presumida');
});

test('dia futuro não é contado como falta', () => {
  const audit = auditMonth({ marks: [], schedule, competence, today: '2026-01-15' });
  assert.equal(byDate(audit)['2026-01-20'].kind, 'futuro');
  assert.equal(audit.stats.absences, 10);
});

test('conferência autorizada confirma faltas presumidas e calcula o DSR por semana', () => {
  const marks = marksWithout('2026-01-05', '2026-01-06', '2026-01-20');
  const result = validateConference(
    { status: 'autorizada', basis, days: [] },
    { employee, schedule, competence, marks },
  );
  assert.deepEqual(result.problems, []);
  assert.equal(result.stats.absences, 3);
  assert.deepEqual(result.unpaid_days, ['2026-01-05', '2026-01-06', '2026-01-20']);
  assert.equal(result.dsr_lost_days, 2);
});

test('justificativa com evidência abona a falta e remove o desconto', () => {
  const marks = marksWithout('2026-01-05', '2026-01-06');
  const result = validateConference({
    status: 'autorizada',
    basis,
    days: [{
      date: '2026-01-05',
      situation: 'falta_justificada',
      justification: 'Atestado médico apresentado ao RH',
      evidence_uri: 'private://atestado',
    }],
  }, { employee, schedule, competence, marks });
  assert.deepEqual(result.problems, []);
  assert.equal(result.stats.absences, 1);
  assert.deepEqual(result.unpaid_days, ['2026-01-06']);
  assert.ok(result.paid_days.includes('2026-01-05'));
});

test('decisão sem evidência e decisão sobre dia já apurado são recusadas', () => {
  const marks = marksWithout('2026-01-05');
  const withoutEvidence = validateConference({
    status: 'autorizada',
    basis,
    days: [{
      date: '2026-01-05',
      situation: 'falta_justificada',
      justification: 'Atestado médico apresentado',
      evidence_uri: '',
    }],
  }, { employee, schedule, competence, marks });
  assert.ok(withoutEvidence.problems.some((problem) => problem.includes('evidência')));

  const alreadyAudited = validateConference({
    status: 'autorizada',
    basis,
    days: [{
      date: '2026-01-02',
      situation: 'falta_justificada',
      justification: 'Atestado médico apresentado',
      evidence_uri: 'private://doc',
    }],
  }, { employee, schedule, competence, marks });
  assert.ok(alreadyAudited.problems.some((problem) => problem.includes('não é falta presumida')));
});

test('pendência de ponto impede a autorização da conferência', () => {
  const marks = [{ date: '2026-01-02', kind: 'entry', original_time: '08:00' }];
  const result = validateConference(
    { status: 'autorizada', basis, days: [] },
    { employee, schedule, competence, marks },
  );
  assert.ok(result.problems.some((problem) => problem.includes('Pendência de ponto')));
});

test('conferência não autorizada não libera a folha', () => {
  const result = validateConference(
    { status: 'rascunho', basis, days: [] },
    { employee, schedule, competence, marks: marksWithout('2026-01-05') },
  );
  assert.ok(result.problems.some((problem) => problem.includes('não foi autorizada')));
});

test('resumo da conferência conta apenas as decisões do RH', () => {
  const summary = conferenceSummary([
    { date: '2026-01-05', situation: 'falta_justificada' },
    { date: '2026-01-06', situation: 'afastamento' },
    { date: '2026-01-07', situation: 'presenca' },
  ]);
  assert.equal(summary.justified_absences, 1);
  assert.equal(summary.leave_days, 1);
  assert.equal(summary.present_days, 1);
  assert.equal(summary.unjustified_absences, 0);
});
