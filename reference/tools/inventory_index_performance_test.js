'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
const start = source.indexOf('function inventorySumBefore(');
const end = source.indexOf('\nfunction totalStock(date)', start);
assert(start >= 0 && end > start, 'inventory index functions were not found');
const dailyOrderRows = [
  { plantIndex: 0, date: '2026-09-02', qty: 5 },
  { plantIndex: 1, date: '2026-09-03', qty: 3 }
];
let orderItemBuilds = 0, shipmentItemLookups = 0;
const context = {
  D: {
    stockBaseDate: '2026-09-01', stockBase: { 0: 100, 1: 50 }, opening: { 0: 100, 1: 50 },
    catalog: [{ catalogId: 'plant-A' }, { catalogId: 'plant-B' }],
    daily: [
      { date: '2026-09-02', plantIndex: 0, in: 20, counts: { NV: 10 } },
      { date: '2026-09-02', plantIndex: 1, in: 0, counts: { NV: 5 } }
    ],
    dailyShipmentReports: [
      { status: 'recorded', date: '2026-09-02', items: [{ plantIndex: 0, qty: 4 }, { plantIndex: 1, qty: 2 }] },
      { status: 'pending', date: '2026-09-02', items: [{ plantIndex: 0, qty: 100 }] },
      { status: 'recorded', date: '2026-09-03', items: [{ plantIndex: 0, qty: 6 }] }
    ]
  },
  inventoryAggregateCache: null,
  stockBaseDate: () => context.D.stockBaseDate,
  stockBaseValue: pi => Number(context.D.stockBase?.[pi] ?? context.D.opening?.[pi] ?? 0),
  completedOrderItemRecords: () => { orderItemBuilds++; return dailyOrderRows; },
  dailyShipmentItemCatalogIndex: item => { shipmentItemLookups++; return Number(item.plantIndex); },
  outOf: row => Object.values(row?.counts || {}).reduce((n, qty) => n + (Number(qty) || 0), 0),
  rec: (date, pi) => context.D.daily.find(row => row.date === date && Number(row.plantIndex) === Number(pi)) || null,
  Number, String, Math, Map, Array, Object
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
assert.strictEqual(context.closing(0, '2026-09-02'), 101,
  'close should remain base 100 + inbound 20 - manual out 10 - completed order 5 - recorded shipment 4');
assert.strictEqual(context.opening(0, '2026-09-03'), 101,
  'next-day opening should carry yesterday movement and all prior order/shipment deductions');
assert.strictEqual(context.closing(0, '2026-09-03'), 95,
  'same-day shipment quantity must be deducted once on the report date');
assert.strictEqual(context.closing(1, '2026-09-03'), 40,
  'another plant should use its own movement/order/shipment index');
assert.strictEqual(orderItemBuilds, 1, 'completed order rows should be flattened only once per inventory index build');
assert.strictEqual(shipmentItemLookups, 3, 'only recorded report items should enter the index; pending reports are excluded');
const firstCache = context.inventoryAggregateCache;
context.inventoryAggregateCache = null;
context.closing(0, '2026-09-03');
assert.notStrictEqual(context.inventoryAggregateCache, firstCache, 'invalidating the aggregate must rebuild the derived cache');
console.log('INVENTORY INDEX PERFORMANCE TEST PASS: stock formula preserved; catalog/date lookups reuse one indexed aggregate; pending reports excluded');
