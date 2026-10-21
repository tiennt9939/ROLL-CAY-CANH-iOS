'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const start = html.indexOf('function tiktokParsedPdfLabelQuality(row)');
const end = html.indexOf('window.__tiktokPdfImportResult=async function(payload){', start);
assert(start >= 0 && end > start, 'Parser-upgrade queue reconciliation functions must exist');
const context = {
  tiktokProductMaps: {
    oldComboKey: [{ catalogKey: 'catalog-rubi-c7', perUnit: 5, autoMatched: false }]
  },
  window: { TikTokLabelImport: parser },
  Date,
  JSON,
  String,
  Number,
  Math,
  Array
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);
const prior = {
  trackingNo: 'VNGH80920580311', orderId: '586572630683191051', status: 'ready',
  products: [
    { mapKey: 'oldComboKey', productName: 'Cây Ruby Đỏ - Nắng màu đỏ rực Combo 4', sku: '', qty: 1 },
    { mapKey: 'oldFragmentKey', productName: 'phù hợp mọi không gian tặng', sku: '', qty: 1 }
  ],
  importedAtMs: 100, assigneeUidChoice: 'employee-1', packingOrderId: ''
};
const fresh = {
  trackingNo: 'VNGH80920580311', orderId: '586572630683191051', status: 'ready',
  products: [{ mapKey: 'newCorrectKey', productName: 'Cây Ruby Đỏ - Nắng màu đỏ rực phù hợp mọi không gian', sku: 'Combo 4 tặng 1', sellerSku: '', qty: 1 }]
};
assert.strictEqual(context.refreshUnassignedTikTokPdfQueueRow(prior, fresh), true, 'A re-import must repair a stale unassigned parse');
assert.strictEqual(prior.products.length, 1, 'The stale two-fragment queue row must become one product');
assert.strictEqual(prior.products[0].sku, 'Combo 4 tặng 1');
assert.strictEqual(prior.importedAtMs, 100, 'Original PDF scan date must remain stable');
assert.strictEqual(prior.assigneeUidChoice, 'employee-1', 'Prior employee selection must be preserved');
assert.strictEqual(context.tiktokProductMaps.newCorrectKey[0].catalogKey, 'catalog-rubi-c7', 'Manual catalog mapping should carry to the corrected row');
assert.strictEqual(context.tiktokProductMaps.newCorrectKey[0].perUnit, 5, 'Mapped plant quantity should follow Combo 4 tặng 1 total');
assert.strictEqual(context.refreshUnassignedTikTokPdfQueueRow(prior, fresh), false, 'An unchanged clean row should not be counted as refreshed');
const assigned = { ...prior, status: 'assigned', packingOrderId: 'packing-order-1' };
assert.strictEqual(context.refreshUnassignedTikTokPdfQueueRow(assigned, { ...fresh, products: [{ ...fresh.products[0], productName: 'different' }] }), false, 'An already-linked order must never be rewritten by reimport');
console.log('TIKTOK PDF QUEUE REPARSE-UPGRADE TEST PASS: old split labels repaired without touching linked orders');
