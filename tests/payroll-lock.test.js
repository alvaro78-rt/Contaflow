import assert from 'node:assert/strict';
import test from 'node:test';
import { withEmployeeLock, lockAgeMs, LOCK_TTL_MS } from '../base44/shared/attendance.js';

function matches(row, query) {
  return Object.entries(query).every(([key, condition]) => {
    if (key === '$or') return condition.some((part) => matches(row, part));
    const value = row[key];
    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$exists' in condition) return condition.$exists ? value !== undefined : value === undefined;
      return false;
    }
    return (value ?? null) === (condition ?? null);
  });
}

function makeEntities(rows) {
  const store = new Map(rows.map((row) => [row.id, { ...row }]));
  const releases = [];
  return {
    store,
    releases,
    Employee: {
      async get(id) {
        const row = store.get(id);
        if (!row) {
          const error = new Error('nao_encontrado');
          error.status = 404;
          throw error;
        }
        return { ...row };
      },
      async updateMany(query, update) {
        let updated = 0;
        for (const row of store.values()) {
          if (!matches(row, query)) continue;
          Object.assign(row, update.$set);
          updated += 1;
        }
        return { updated };
      },
    },
    LockRelease: {
      async create(data) {
        releases.push(data);
        return data;
      },
    },
  };
}

const employee = { id: 'emp-1', company_id: 'co-1', full_name: 'Diego Silva' };
const staleStamp = new Date(Date.now() - LOCK_TTL_MS - 60000).toISOString();

test('adquire o bloqueio livre, executa e devolve a trava ao final', async () => {
  const entities = makeEntities([{ id: 'emp-1', company_id: 'co-1', processing_lock: '' }]);
  let ran = 0;
  const response = await withEmployeeLock(entities, employee, async () => {
    ran += 1;
    assert.match(entities.store.get('emp-1').processing_lock, /\|/);
    return 'ok';
  });
  assert.equal(response, 'ok');
  assert.equal(ran, 1);
  assert.equal(entities.store.get('emp-1').processing_lock, '');
  assert.equal(entities.releases.length, 0);
});

test('bloqueio recente impede cálculo simultâneo e não executa a operação', async () => {
  const entities = makeEntities([
    { id: 'emp-1', company_id: 'co-1', processing_lock: 'chave-atual|' + new Date().toISOString() },
  ]);
  let ran = 0;
  const response = await withEmployeeLock(entities, employee, async () => { ran += 1; });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'operacao_em_andamento' });
  assert.equal(ran, 0);
});

test('bloqueio expirado é assumido e fica registrado na auditoria', async () => {
  const entities = makeEntities([{ id: 'emp-1', company_id: 'co-1', processing_lock: `velho|${staleStamp}` }]);
  let ran = 0;
  const response = await withEmployeeLock(entities, employee, async () => { ran += 1; return 'ok'; });
  assert.equal(response, 'ok');
  assert.equal(ran, 1);
  assert.equal(entities.releases.length, 1);
  assert.equal(entities.releases[0].mode, 'automatica');
  assert.equal(entities.releases[0].employee_id, 'emp-1');
  assert.ok(entities.releases[0].lock_age_minutes >= 5);
  assert.equal(entities.store.get('emp-1').processing_lock, '');
});

test('bloqueio legado sem carimbo usa o updated_date do funcionário', async () => {
  const entities = makeEntities([{
    id: 'emp-1',
    company_id: 'co-1',
    processing_lock: '61c8171e-5ff3-44c4-9451-e48fb298e69f',
    updated_date: new Date(Date.now() - 25 * 60 * 60000).toISOString(),
  }]);
  let ran = 0;
  await withEmployeeLock(entities, employee, async () => { ran += 1; });
  assert.equal(ran, 1);
  assert.equal(entities.releases.length, 1);
});

test('bloqueio legado recente continua protegido', async () => {
  const entities = makeEntities([{
    id: 'emp-1',
    company_id: 'co-1',
    processing_lock: 'chave-legada',
    updated_date: new Date().toISOString(),
  }]);
  let ran = 0;
  const response = await withEmployeeLock(entities, employee, async () => { ran += 1; });
  assert.equal(response.status, 409);
  assert.equal(ran, 0);
});

test('duas tentativas simultâneas sobre bloqueio expirado: só uma executa', async () => {
  const entities = makeEntities([{ id: 'emp-1', company_id: 'co-1', processing_lock: `velho|${staleStamp}` }]);
  let ran = 0;
  const results = await Promise.all([
    withEmployeeLock(entities, employee, async () => { ran += 1; return 'a'; }),
    withEmployeeLock(entities, employee, async () => { ran += 1; return 'b'; }),
  ]);
  assert.equal(ran, 1);
  const codes = results.map((result) => (typeof result === 'string' ? result : result.status));
  assert.deepEqual(codes.sort(), ['a', 409].sort());
  assert.equal(entities.store.get('emp-1').processing_lock, '');
});

test('a liberação não toca em outro funcionário', async () => {
  const entities = makeEntities([
    { id: 'emp-1', company_id: 'co-1', processing_lock: `velho|${staleStamp}` },
    { id: 'emp-2', company_id: 'co-1', processing_lock: 'outra-chave' },
  ]);
  await withEmployeeLock(entities, employee, async () => 'ok');
  assert.equal(entities.store.get('emp-2').processing_lock, 'outra-chave');
});

test('lockAgeMs ignora valor vazio e entende o carimbo', () => {
  assert.equal(lockAgeMs('', null), 0);
  assert.ok(lockAgeMs(`k|${staleStamp}`) > LOCK_TTL_MS);
  assert.equal(lockAgeMs('k', 'nao-e-data'), Number.POSITIVE_INFINITY);
});
