'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
function sliceBetween(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Could not find source span: ${start} -> ${end}`);
  return source.slice(a, b);
}
function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(dateString, amount) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return fmt(d);
}
const context = {
  inventoryAggregateCache: null,
  dailyShipmentItemCatalogIndex: () => -1,
  D: {
    stockBaseDate: '2026-09-01', stockBase: {0: 100}, opening: {0: 100},
    catalog: [{catalogId: 'plant-A', name: 'Cây A'}],
    daily: [{date: '2026-09-02', plantIndex: 0, in: 20, counts: {NV: 10}}],
    monthlyStockSnapshots: [{month: '2026-09', closingDate: '2026-09-30', stockByCatalog: {'plant-A': 87}}],
    openingMonth: ''
  },
  START: '2020-01-01', fmt, addDays,
  completedOrderItemRecords: () => [{plantIndex: 0, date: '2026-09-02', qty: 5}],
  rec: (date, pi) => context.D.daily.find(x => x.date === date && Number(x.plantIndex) === Number(pi)),
  outOf: x => Object.values(x?.counts || {}).reduce((a,b) => a + (Number(b) || 0), 0),
  activeCatalog: () => context.D.catalog.map((p,i) => ({p,i}))
};
context.global = context;
vm.createContext(context);
vm.runInContext(sliceBetween('function stockBaseDate(){', 'function totalStock(date){'), context);
vm.runInContext(sliceBetween('  const RETENTION_DAY_MS=24*60*60*1000;', '  function retentionArchivePayrollForDates('), context);

// Inventory calculation: base 100 + incoming 20 - manual packed 10 - completed order 5 = 105.
assert.strictEqual(context.closing(0, '2026-09-02'), 105, 'closing stock should include incoming, manual outflow, and completed orders');

// Month-end snapshot must be selected for Sep 30, and roll into Oct 1 opening baseline.
assert.deepStrictEqual(Array.from(context.retentionSnapshotMonthEnds('2026-10-01')), ['2026-09-30']);
assert.strictEqual(context.retentionApplyPreviousMonthOpening('2026-10-01'), true);
assert.strictEqual(context.D.opening[0], 87);
assert.strictEqual(context.D.stockBase[0], 87);
assert.strictEqual(context.D.stockBaseDate, '2026-09-30');
assert.strictEqual(context.closing(0, '2026-10-01'), 87, 'Oct 1 stock starts from prior month end snapshot');
// Migration from a prior app build that already set openingMonth but did not advance stockBaseDate.
context.D.stockBaseDate = '2026-09-01';
context.D.stockBase = {0: 100};
context.D.openingMonth = '2026-10';
assert.strictEqual(context.retentionApplyPreviousMonthOpening('2026-10-01'), true, 'rollover should repair an old openingMonth-only state');
assert.strictEqual(context.D.stockBaseDate, '2026-09-30');
assert.strictEqual(context.D.stockBase[0], 87);

// Static invariants: warning + grace, only completed orders deleted, paid-only post-delete expiry.
assert(source.includes('RETENTION_DAY_MS=24*60*60*1000'), '24-hour warning grace is required');
assert(source.includes("String(r.status||'')==='completed'&&purgeSetForOrders.has(retentionOrderDate(r))"), 'pending orders must not be deleted');
assert(source.includes('Number(r.orderDataDeletedAtMs||0)>0'), 'wage deletion must wait for confirmed order deletion');
assert(source.includes('now+10*RETENTION_DAY_MS'), '10-day wage retention timer is required');
assert(source.includes('r.deleteAfterMs=Math.max(Number(r.deleteAfterMs)||0,now+10*RETENTION_DAY_MS)'), 'late-paid wages need a fresh 10-day retention period');
assert(source.includes('retentionCleanupPromise=runRetentionCleanupInternal()'), 'concurrent retention runs must be serialized');
assert(source.includes('daily:cloudDaily.length||cloudHasAuthoritativeCleanup?cloudDaily:localDaily'), 'an explicit empty Cloud daily list must not be resurrected from a stale device');
assert(source.includes('state.pendingPayrollRetentionDates') && source.includes('remainingCompletedDates'), 'cleanup must resume safely if Cloud deletion and final metadata sync are interrupted');
console.log('RETENTION LOGIC TEST PASS: inventory equation, month-end rollover, 24h grace, pending-order protection, payroll retention');
