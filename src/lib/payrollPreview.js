// Simulação pela jornada contratual. Não grava ponto, folha ou pagamento.
import { buildPayroll, fgtsRateFor } from './payrollCalculation.js';
import { scheduledMinutes } from './payroll.js';

export const PREVIEW_LABEL = 'Simulação — sem validade financeira';
const pad = (n) => String(n).padStart(2, '0');
export function taxDependentsOf(employee) {
  if (Number.isInteger(employee?.tax_dependents) && employee.tax_dependents >= 0 && employee.tax_dependents <= 99) return employee.tax_dependents;
  if (!Array.isArray(employee?.dependents)) return null;
  if (employee.dependents.length === 0) return 0;
  if (!employee.dependents.every(dep => typeof dep?.tax_dependent === 'boolean')) return null;
  return employee.dependents.filter(dep => dep.tax_dependent).length;
}
export function contractualDays({ employee, schedule, competence, today = new Date() }) {
  const [year, month] = competence.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  const limit = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const admission = employee?.admission_date || '';
  let days = 0;
  for (let day = 1; day <= last; day += 1) {
    const date = `${competence}-${pad(day)}`;
    if (date > limit || (admission && date < admission)) continue;
    if (!(schedule?.work_days || []).includes(new Date(year, month - 1, day).getDay())) continue;
    days += 1;
  }
  return days;
}
export function contractualStats({ employee, schedule, competence, today = new Date() }) {
  const days = contractualDays({ employee, schedule, competence, today });
  const minutes = schedule?.entry_time && schedule?.exit_time ? scheduledMinutes(schedule) : 0;
  return { worked: days * minutes, late: 0, overtime: 0, absences: 0, days };
}
export const previewCharge = (payroll, description) => (payroll?.deductions || []).find(item => item.description === description)?.value || 0;
export const previewFgts = payroll => (payroll?.informatives || []).find(item => String(item.description).startsWith('FGTS'))?.value || 0;
export function buildContractualPreview({ employee, schedule, positionName, competence, table, today = new Date(), scenario = null }) {
  const stats = contractualStats({ employee, schedule, competence, today });
  const dependents = taxDependentsOf(employee);
  const [year, month] = competence.split('-').map(Number);
  const date = new Date(Date.UTC(year, month, 5));
  const paymentDate = date.toISOString().slice(0, 10);
  const rubrics = [];
  const round = n => Math.round(n * 100) / 100;
  let vacationDays = 0;
  let vacationPay = 0;
  if (scenario) {
    vacationDays = Number(scenario.vacationDays);
    const absences = Number(scenario.absences);
    const extras = Number(scenario.extraHours);
    const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const admission = employee.admission_date || '';
    const availableDays = admission.startsWith(competence + '-') ? calendarDays - Number(admission.slice(8,10)) + 1 : calendarDays;
    const workDays = contractualDays({ employee, schedule, competence, today: new Date(year, month, 0) });
    if (!Number.isInteger(vacationDays) || vacationDays < 0 || vacationDays > Math.min(30, availableDays) ||
        !Number.isInteger(absences) || absences < 0 || absences > workDays ||
        !Number.isFinite(extras) || extras < 0 || extras > 200 || vacationDays + absences > availableDays ||
        (vacationDays === Math.min(30, availableDays) && (absences || extras))) {
      throw new Error('Confira os dias de férias, faltas e horas extras.');
    }
    const salary = Number(employee.base_salary);
    vacationPay = round(salary * vacationDays / 30);
    const partial = availableDays < calendarDays;
    const regular = partial ? round(salary * availableDays / calendarDays) : round(salary);
    vacationPay = Math.min(regular, vacationPay);
    if (vacationDays) rubrics.push({ category: 'provento', auto_apply: true, name: 'Terço constitucional de férias', fixed_value: round(vacationPay / 3) });
    stats.absences = absences;
    stats.overtime = Math.round(extras * 60);
    // Horas efetivamente trabalhadas não são conhecidas em uma simulação.
    stats.worked = 0;
  }
  const payroll = buildPayroll({ employee, positionName, competence, stats, rubrics, table, paymentDate, taxDependents: dependents ?? 0, admissionDate: employee.admission_date || '' });
  if (scenario) {
    if (vacationDays && payroll.earnings[0]) {
      const original = payroll.earnings[0];
      const remainder = round(original.value - vacationPay);
      payroll.earnings.splice(0, 1, ... (remainder > 0 ? [{...original, value: remainder}] : []), {description: `Férias (${vacationDays} dias)`, value: vacationPay});
    }
    const absenceDiscount = payroll.deductions.find(row => row.description.startsWith('Faltas ('))?.value || 0;
    const base = Math.max(0, payroll.calc_memory.fgts_base);
    const rate = fgtsRateFor(employee, table);
    const reduction = round(round((base + absenceDiscount) * rate) - round(base * rate));
    payroll.informatives.push({ description: 'Redução estimada do FGTS por faltas (informativo)', value: reduction });
    payroll.scenario = { vacationDays, absences: stats.absences, overtimeMinutes: stats.overtime };
  }
  return { ...payroll, status: 'previa', preview: true, preview_only: true, preview_label: PREVIEW_LABEL, attendance_pending: true, preview_days: stats.days, preview_dependents_unknown: dependents === null };
}
