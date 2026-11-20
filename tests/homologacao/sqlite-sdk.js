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
  const missing = () => Object.assign(new Error('Registro fictício inexistente'), { status: 404 });

  const entities = Object.fromEntries(Object.keys(fixtures).map((entity) => {
    for (const record of fixtures[entity]) {
      insert.run(entity, record.id, JSON.stringify(record));
    }
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
      async filter(query, { limit = 100 } = {}) {
        const records = select(query);
        return { items: records.slice(0, limit), next_cursor: records.length > limit ? 'more' : null };
      },
      async create(fields) {
        const record = { ...fields, id: randomUUID() };
        insert.run(entity, record.id, JSON.stringify(record));
        return record;
      },
      async update(id, fields) {
        const record = get.get(entity, id);
        if (!record) throw missing();
        return save(JSON.parse(record.data), fields);
      },
      async updateMany(query, { $set }) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const records = select(query);
          for (const record of records) save(record, $set);
          db.exec('COMMIT');
          return { updated: records.length };
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
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
