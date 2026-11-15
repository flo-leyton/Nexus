const { emptyDocument } = require('../../server/sessionStorage');

// Simulates RTDB's omission of null properties and empty containers, not WebSocket logic.
function databaseShape(value) {
  if (Array.isArray(value)) return value.length ? value.map(databaseShape) : null;
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, databaseShape(v)]).filter(([, v]) => v !== null && v !== undefined));
    return Object.keys(result).length ? result : null;
  }
  return value;
}
function createMemoryStore(backing = { document: emptyDocument() }) {
  return { backing,
    async load() { return structuredClone(backing.document); },
    async commit(expected, next) {
      if (backing.beforeCommit) await backing.beforeCommit(next);
      if (backing.fail) throw new Error('simulated database unavailable');
      if (backing.document.revision !== expected) throw Object.assign(new Error('revision conflict'), { code: 'STORE_CONFLICT' });
      backing.document = databaseShape(structuredClone(next));
    },
  };
}
module.exports = { createMemoryStore, databaseShape };
