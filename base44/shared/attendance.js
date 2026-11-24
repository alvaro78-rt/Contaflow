export const kinds = ['entry', 'break_start', 'break_end', 'exit'];
export const validMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const validDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

// Feriados nacionais confirmados para 2026 (Portaria MGI 11.460/2025).
// Pontos facultativos e feriados estaduais/municipais não são presumidos.
// https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026
export const NATIONAL_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01', '2026-09-07',
  '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
]);

export function monthRange(month) {
  const [year, number] = month.split('-').map(Number);
  return { $gte: month + '-01', $lte: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) };
}

export function validMarks(records, complete = false) {
  const ordered = [...records].sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
  const sequence = ordered.map((row) => row.kind);
  if (new Set(sequence).size !== sequence.length) return false;
  if (complete && !['entry,exit', 'entry,break_start,break_end,exit'].includes(sequence.join(','))) {
    return false;
  }
  let previous = '';
  return ordered.every((row) => {
    const time = row.corrected_time || row.original_time;
    const valid = kinds.includes(row.kind) && validTime(time) && time >= previous;
    previous = time;
    return valid;
  });
}

export async function hasUnscopedHistory(entity, query) {
  const page = await entity.filter({
    ...query,
    $or: [
      { company_id: { $exists: false } },
      { company_id: null },
      { company_id: '' },
    ],
  }, { limit: 1, fields: ['id'] });
  return page.items.length > 0;
}

// Serialize time and payroll mutations across server instances using the employee row.
// Um bloqueio abandonado (processo interrompido) expira em LOCK_TTL_MS e pode ser
// assumido por outra tentativa. A troca compara o valor exato lido (CAS), então duas
// tentativas simultâneas nunca vencem o mesmo bloqueio: nunca há cálculo duplicado.
export const LOCK_TTL_MS = 5 * 60 * 1000;

const FREE_LOCK = {
  $or: [
    { processing_lock: { $exists: false } },
    { processing_lock: null },
    { processing_lock: '' },
  ],
};

// Bloqueios antigos não têm carimbo de tempo; nesse caso a idade vem do updated_date
// do funcionário, alterado no momento em que a trava foi gravada.
export function lockAgeMs(lock, fallbackIso) {
  const raw = String(lock || '');
  if (!raw) return 0;
  const stamped = Date.parse(String(raw).split('|')[1] || '');
  const base = Number.isFinite(stamped) ? stamped : Date.parse(fallbackIso || '');
  return Number.isFinite(base) ? Date.now() - base : Number.POSITIVE_INFINITY;
}

export async function withEmployeeLock(entities, employee, run) {
  const key = `${crypto.randomUUID()}|${new Date().toISOString()}`;
  const scope = { id: employee.id, company_id: employee.company_id };
  const take = (held) => entities.Employee.updateMany(
    held ? { ...scope, processing_lock: held } : { ...scope, ...FREE_LOCK },
    { $set: { processing_lock: key } },
  ).then((result) => result.updated === 1);

  let recovered = '';
  let recoveredAgeMs = 0;
  let acquired = await take('');

  if (!acquired) {
    const current = await entities.Employee
      .get(employee.id)
      .catch((error) => (error.status === 404 ? null : Promise.reject(error)));
    const held = String(current?.processing_lock || '');
    const age = held ? lockAgeMs(held, current?.updated_date) : 0;
    if (held && age > LOCK_TTL_MS) {
      acquired = await take(held);
      if (acquired) {
        recovered = held;
        recoveredAgeMs = Number.isFinite(age) ? age : 0;
      }
    }
  }

  if (!acquired) return Response.json({ error: 'operacao_em_andamento' }, { status: 409 });

  try {
    if (recovered) {
      // Auditoria da liberação: registra e nunca impede o cálculo.
      await entities.LockRelease.create({
        employee_id: employee.id,
        employee_name: employee.full_name || '',
        company_id: employee.company_id || '',
        previous_lock: recovered,
        lock_age_minutes: Math.round(recoveredAgeMs / 60000),
        mode: 'automatica',
        reason: 'Bloqueio abandonado acima do prazo de expiração.',
        released_at: new Date().toISOString(),
      }).catch(() => null);
    }
    return await run();
  } finally {
    await entities.Employee.updateMany({ ...scope, processing_lock: key }, { $set: { processing_lock: '' } });
  }
}
