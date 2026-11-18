export const kinds = ['entry', 'break_start', 'break_end', 'exit'];
export const validMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const validDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

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
// An interrupted worker leaves a visible lock for supervised recovery, never a duplicate payment.
export async function withEmployeeLock(entities, employee, run) {
  const key = crypto.randomUUID();
  const scope = { id: employee.id, company_id: employee.company_id };
  const acquired = await entities.Employee.updateMany({
    ...scope,
    $or: [
      { processing_lock: { $exists: false } },
      { processing_lock: null },
      { processing_lock: '' },
    ],
  }, { $set: { processing_lock: key } });
  if (acquired.updated !== 1) return Response.json({ error: 'operacao_em_andamento' }, { status: 409 });
  try {
    return await run();
  } finally {
    await entities.Employee.updateMany({ ...scope, processing_lock: key }, { $set: { processing_lock: '' } });
  }
}
