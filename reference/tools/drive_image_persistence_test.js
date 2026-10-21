'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const start = source.indexOf('function localSaveOnly(){');
const end = source.indexOf('\nasync function ensureImageUploadedToDrive', start);
assert(start >= 0 && end > start, 'local persistence source was not found');
const persistenceSource = source.slice(start, end);
const img = 'data:image/jpeg;base64,QUJDRA==';
function makeContext({connected, mapped}) {
  const records = new Map([['quanlycay', 'last-known-good-cache']]);
  const notices = [];
  const scheduled = [];
  const context = {
    D: { catalog: [{ name: 'Plant', image: img }], daily: [] },
    invalidateInventoryIndexes() {},
    console: { warn() {}, error() {}, log() {} },
    JSON, Date, String, Math, Number, Array, Object, Promise,
    setTimeout(fn) { scheduled.push(fn); return scheduled.length; },
    toast: (message) => notices.push(String(message)),
    migrateLocalImagesToDrive: async () => 1,
    localStorage: {
      get length() { return records.size; },
      key(i) { return Array.from(records.keys())[i] ?? null; },
      getItem(k) { return records.has(k) ? records.get(k) : null; },
      setItem(k, v) { records.set(String(k), String(v)); },
      removeItem(k) { records.delete(k); }
    },
    window: {
      __rollDriveImageMigrationQueued: false,
      __rollDriveImageMigrationPromise: null,
      DriveStorage: {
        connected: () => connected,
        toLocalCacheValue(value) {
          const walk = (v) => {
            if (typeof v === 'string' && /^data:image\/[\w.+-]+;base64,/i.test(v)) return mapped ? 'drive://file-123' : v;
            if (Array.isArray(v)) return v.map(walk);
            if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
            return v;
          };
          return walk(value);
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(persistenceSource, context);
  return { context, records, notices, scheduled };
}

// An uploaded photo is normalized to a Drive reference before being saved.
{
  const { context, records } = makeContext({ connected: true, mapped: true });
  assert.strictEqual(context.localSaveOnly(), true);
  const stored = records.get('quanlycay');
  assert(stored.includes('drive://file-123'));
  assert(!stored.includes('data:image/'), 'a Base64 photo was persisted despite a known Drive reference');
}

// An unuploaded legacy photo must not overwrite the last good local cache.
{
  const { context, records } = makeContext({ connected: false, mapped: false });
  assert.strictEqual(context.localSaveOnly(), false);
  assert.strictEqual(records.get('quanlycay'), 'last-known-good-cache');
  assert(!records.get('quanlycay').includes('data:image/'));
}

// When Drive is connected, an unresolved legacy photo queues migration but does not write Base64.
{
  const { context, records, scheduled } = makeContext({ connected: true, mapped: false });
  assert.strictEqual(context.localSaveOnly(), false);
  assert.strictEqual(records.get('quanlycay'), 'last-known-good-cache');
  assert.strictEqual(scheduled.length, 1, 'legacy migration was not queued');
  assert(!records.get('quanlycay').includes('data:image/'));
}

console.log('DRIVE IMAGE PERSISTENCE TEST PASS: refs-only local writes, legacy-cache preservation, and Drive migration queue');
