// Narrow, in-memory implementation of the SDK operations used by the handlers.
// A test request never needs an app ID, service token, or network access.
let database;
function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((q) => matches(row, q));
    if (key === '$and') return expected.every((q) => matches(row, q));
    if (expected && typeof expected === 'object') {
      return Object.entries(expected).every(([op, value]) => {
        switch (op) {
          case '$exists':
            return (row[key] !== undefined) === value;
          case '$ne':
            return row[key] !== value;
          case '$gte':
            return row[key] >= value;
          case '$lte':
            return row[key] <= value;
          case '$regex':
            return new RegExp(value, expected.$options).test(row[key] || '');
          case '$options':
            return true;
          default:
            throw new Error('Unsupported test operator ' + op);
        }
      });
    }
    return row[key] === expected;
  });
}

export function seed(rows) {
  const entities = {};
  for (const [name, items] of Object.entries(rows)) {
    const select = (q) => items.filter((row) => matches(row, q));
    entities[name] = {
      async get(id) {
        const r = items.find((r) => r.id === id);
        if (!r) throw Object.assign(new Error(), { status: 404 });
        return structuredClone(r);
      },
      async filter(q, options = {}, limit = 100) {
        const rows = select(q);
        if (typeof options === 'string') return structuredClone(rows.slice(0, limit));
        return {
          items: structuredClone(rows.slice(0, options.limit)),
          next_cursor: rows.length > options.limit ? 'more' : null,
        };
      },
      async create(fields) {
        const row = { ...fields, id: crypto.randomUUID() };
        items.push(row);
        return structuredClone(row);
      },
      async update(id, fields) {
        const row = items.find((r) => r.id === id);
        Object.assign(row, fields);
        return structuredClone(row);
      },
      async updateMany(q, update) {
        const rows = select(q);
        rows.forEach((r) => Object.assign(r, update.$set));
        return { updated: rows.length };
      },
      async deleteMany(q) {
        for (const row of select(q)) items.splice(items.indexOf(row), 1);
      },
    };
  }
  database = { asServiceRole: { entities } };
  return rows;
}
export const createClientFromRequest = () => database;
