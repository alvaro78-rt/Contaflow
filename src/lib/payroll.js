export const DEFAULT_PARAMS = {tolerance:5,overtimeCapMin:120};

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
