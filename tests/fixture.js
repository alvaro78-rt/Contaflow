import { seed } from './memory-sdk.js';
export const table = {
  id: 'legal',
  label: '2026',
  start_competence: '2026-01',
  active: true,
  inss_bands: [[1621, .075], [2902.84, .09], [4354.27, .12], [8475.55, .14]].map(([limit, rate]) => ({
    limit,
    rate,
  })),
  irrf_bands: [[2428.8, 0, 0], [2826.65, .075, 182.16], [3751.05, .15, 394.16], [4664.68, .225, 675.49], [
    999999,
    .275,
    908.73,
  ]].map(([limit, rate, deduction]) => ({ limit, rate, deduction })),
  irrf_dependent_deduction: 189.59,
  irrf_simplified_discount: 607.2,
  fgts_rate: .08,
  tolerance_minutes: 5,
  overtime_rate: 1.5,
  overtime_cap_minutes: 120,
  absence_divisor: 30,
};
export function fixture() {
  const employees = [['worker', 'A', 'funcionario'], ['rh', 'A', 'admin'], ['manager', 'A', 'gerente'], [
    'other',
    'B',
    'funcionario',
  ]].map(([id, company_id, access_role]) => ({
    id,
    company_id,
    access_role,
    full_name: 'Teste ' + id,
    status: 'ativo',
    contract_type: 'CLT',
    position_id: 'cargo',
    schedule_id: 'horario',
    cpf: '00000000000',
    base_salary: 5000,
    weekly_hours: 40,
    admission_date: '2025-01-01',
  }));
  return seed({
    // A pertence à conta mestre do teste; B pertence a outro proprietário.
    Company: [
      { id: 'A', status: 'ativa', owner_cpf: '52998224725' },
      { id: 'B', status: 'ativa', owner_cpf: '39053344705' },
    ],
    Employee: employees,
    AuthSession: employees.map((e) => ({
      id: 's' + e.id,
      token: e.id,
      employee_id: e.id,
      expires_at: '2099-01-01',
    })),
    WorkSchedule: [{
      id: 'horario',
      company_id: 'A',
      work_days: [1, 2, 3, 4, 5],
      entry_time: '08:00',
      exit_time: '17:00',
      break_start: '12:00',
      break_end: '13:00',
    }],
    Position: [{ id: 'cargo', company_id: 'A', name: 'Cargo' }],
    TimeRecord: [],
    AttendanceConference: [],
    Payroll: [],
    LegalTable: [structuredClone(table)],
    Rubric: [],
    Vacation: [],
    ThirteenthSalary: [],
    Termination: [],
  });
}
export const calc = {
  competence: '2026-01',
  employee_id: 'worker',
  tax_dependents: 0,
  payment_date: '2026-02-04',
  reviewed_inputs: true,
  unpaid_days: [],
  dsr_extra: 0,
  dsr_discount: 0,
  paid_days: ['2026-01-01'],
};
export function attendance(db) {
  for (let day = 2; day <= 31; day++) {
    const date = '2026-01-' + String(day).padStart(2, '0');
    if ([0, 6].includes(new Date(date).getUTCDay())) continue;
    for (
      const [kind, original_time] of [['entry', '08:00'], ['break_start', '12:00'], ['break_end', '13:00'], [
        'exit',
        '17:00',
      ]]
    ) {
      db.TimeRecord.push({
        id: date + kind,
        company_id: 'A',
        employee_id: 'worker',
        date,
        kind,
        original_time,
      });
    }
  }
}
