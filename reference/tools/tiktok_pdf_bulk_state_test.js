const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const start = html.indexOf('function reconcileTikTokLabelQueueWithLiveOrders');
const end = html.indexOf('function toggleTikTokQueueSelection', start);
assert(start >= 0 && end > start, 'PDF queue reconcile/selectability functions missing');
const source = html.slice(start, end);
const queue = [];
const liveOrders = [];
for (let i = 0; i < 16; i++) {
  const trackingNo = `8625732900${String(i).padStart(2, '0')}`;
  queue.push({ trackingNo, status: 'ready', products: [{ mapKey: `old-${i}` }], packingOrderId: '' });
  liveOrders.push({ id: `tiktok_${trackingNo}`, shipmentTrackingNo: trackingNo, status: 'pending', assignmentMode: 'open_pool', assignedUid: '', employee: 'Đơn chung' });
}
for (let i = 0; i < 4; i++) {
  queue.push({ trackingNo: `8625681312${String(i).padStart(2, '0')}`, status: 'ready', products: [{ mapKey: `new-${i}` }], packingOrderId: '' });
}
const normalizeTracking = x => String(x || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
const tiktokLiveOrderForLabel = row => {
  const tracking = normalizeTracking(row?.trackingNo || '');
  const id = String(row?.packingOrderId || '');
  return [...liveOrders].find(o => (id && String(o?.id || '') === id) || (tracking && normalizeTracking(o?.shipmentTrackingNo || o?.shipment?.trackingNo || '') === tracking)) || null;
};
const context = {
  tiktokBulkAssignBusy: false,
  tiktokQueueBusy: {},
  tiktokSelectedTrackingNos: new Set(queue.slice(0, 16).map(x => x.trackingNo)),
  D: { packingOrders: liveOrders },
  orderNotificationState: { rows: liveOrders },
  tiktokMappingIsValid: p => !!p.mapKey,
  tiktokLabelOrderCompositionIsValid: () => false,
  normalizeTracking,
  saveTikTokLocalState: () => true,
  tiktokLiveOrderForLabel
};
vm.createContext(context);
vm.runInContext(source, context);
context.reconcileTikTokLabelQueueWithLiveOrders(queue);
assert.strictEqual(queue.filter(x => x.status === 'assigned' && x.existingOrder).length, 16,
  'All pre-existing shared orders must reconcile out of stale local ready state');
assert.strictEqual(queue.filter(x => context.tiktokLabelIsSelectable(x)).length, 4,
  'Bulk assignment must offer only the four genuinely new PDF labels');
assert.strictEqual(context.tiktokSelectedTrackingNos.size, 0,
  'Stale pre-existing order selections must be cleared during reconciliation');
console.log('TIKTOK PDF BULK STATE TEST PASS: 16 existing shared orders excluded; only 4 new labels selectable');
