import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { matches } from '../memory-sdk.js';

// Adapter for an isolated, single-process test with synthetic records.
let client;

export function openFixtureDatabase(path, fixtures = {}) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS records (
    entity TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (entity, id)
  )`);
  const insert = db.prepare('INSERT INTO records VALUES (?, ?, ?)');
  const get = db.prepare('SELECT data FROM records WHERE entity = ? AND id = ?');
  const list = db.prepare('SELECT data FROM records WHERE entity = ? ORDER BY rowid');
  const update = db.prepare('UPDATE records SET data = ? WHERE entity = ? AND id = ?');
  const remove = db.prepare('DELETE FROM records WHERE entity = ? AND id = ?');
  const saveRow = (entity, fields) => {
    const record = { created_date: new Date().toISOString(), ...fields, id: randomUUID() };
    insert.run(entity, record.id, JSON.stringify(record));
    return record;
  };
  const transact = (run) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const needsSeed = !db.prepare('SELECT 1 FROM records LIMIT 1').get();
  if (needsSeed) transact(() => {
    for (const [entity, records] of Object.entries(fixtures)) {
      for (const record of records) insert.run(entity, record.id, JSON.stringify(record));
    }
  });
  const missing = () => Object.assign(new Error('Registro fictício inexistente'), { status: 404 });

  const entities = Object.fromEntries(Object.keys(fixtures).map((entity) => {
    const select = (query) => list.all(entity).map(({ data }) => JSON.parse(data))
      .filter((record) => matches(record, query));
    const save = (record, fields) => {
      const saved = { ...record, ...fields, id: record.id };
      update.run(JSON.stringify(saved), entity, record.id);
      return saved;
    };
    return [entity, {
      async get(id) {
        const record = get.get(entity, id);
        if (!record) throw missing();
        return JSON.parse(record.data);
      },
      async filter(query, options = {}, legacyLimit = 100) {
        const legacy = typeof options === 'string';
        const { limit = 100, sort, cursor } = legacy ? { sort: options, limit: legacyLimit } : options;
        const records = select(query);
        if (sort) {
          const field = sort.replace(/^-/, '');
          const direction = sort.startsWith('-') ? -1 : 1;
          records.sort((a, b) => direction * String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
        }
        const offset = /^\d+$/.test(cursor ?? '') ? Number(cursor) : 0;
        const items = records.slice(offset, offset + limit);
        if (legacy) return items;
        return { items, next_cursor: offset + limit < records.length ? String(offset + limit) : null };
      },
      async count(query) {
        return select(query).length;
      },
      async aggregate({ query, sum }) {
        const records = select(query);
        return { rows: [Object.fromEntries(sum.map((field) => [
          'sum_' + field, records.reduce((total, item) => total + (Number(item[field]) || 0), 0),
        ]))] };
      },
      async create(fields) {
        return saveRow(entity, fields);
      },
      async upsert(records, { key }) {
        return transact(() => {
          let created = 0;
          const saved = records.map((fields) => {
            const query = Object.fromEntries(key.map((field) => [field, fields[field]]));
            const [existing] = select(query);
            if (existing) return save(existing, fields);
            created++;
            return saveRow(entity, fields);
          });
          return { created, records: saved };
        });
      },
      async delete(id) {
        return { deleted: Number(remove.run(entity, id).changes) };
      },
      async deleteMany(query) {
        return transact(() => {
          const records = select(query);
          for (const record of records) remove.run(entity, record.id);
          return { deleted: records.length };
        });
      },
      async update(id, fields) {
        const record = get.get(entity, id);
        if (!record) throw missing();
        return save(JSON.parse(record.data), fields);
      },
      async updateMany(query, { $set }) {
        return transact(() => {
          const records = select(query);
          for (const record of records) save(record, $set);
          return { updated: records.length };
        });
      },
    }];
  }));
  client = { asServiceRole: { entities } };
  return db;
}

export function createClientFromRequest() {
  if (!client) throw new Error('Banco de homologação indisponível');
  return client;
}
