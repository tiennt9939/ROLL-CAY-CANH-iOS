const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const start = html.indexOf('function tiktokLiveOrderForLabel(row,orders){');
const end = html.indexOf('function tiktokLabelIsSelectable(row){', start);
assert(start >= 0 && end > start, 'TikTok queue reconcile helpers missing');
const source = html.slice(start, end);
const queue = [
  { trackingNo: '86257329001', status: 'ready', packingOrderId: '', importedAtMs: 100, products: [{ productName: 'yesterday completed order stored without tracking field' }] },
  { trackingNo: '86257329002', status: 'ready', packingOrderId: '', importedAtMs: 150, products: [{ productName: 'yesterday completed order with tracking field' }] },
  { trackingNo: '86257329003', status: 'ready', packingOrderId: '', importedAtMs: 200, products: [{ productName: 'new order today' }] }
];
const fullOrders = [
  // Legacy completed TikTok order: deterministic ID exists but tracking fields are absent.
  { id: 'tiktok_86257329001', status: 'completed', assignmentMode: 'assigned', assignedUid: 'packer-1', employee: 'Nhân viên A', assignedAtMs: 300 },
  { id: 'order-yesterday-2', shipmentTrackingNo: '86257329002', status: 'completed', assignmentMode: 'assigned', assignedUid: 'packer-2', employee: 'Nhân viên B', assignedAtMs: 350 }
];
const context = {
  tiktokLabelQueue: queue,
  tiktokSelectedTrackingNos: new Set(['86257329001', '86257329002']),
  normalizeTracking: value => String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase(),
  saveTikTokLocalState: () => true,
  D: { packingOrders: [] },
  orderNotificationState: { rows: [] },
  window: { CloudSync: { state: () => ({ role: 'admin', user: { uid: 'admin-1' }, adminListOrders: async () => fullOrders }) } },
  console
};
vm.createContext(context);
vm.runInContext(source, context);
context.reconcileTikTokLabelQueueWithLiveOrders(queue, fullOrders);
const result = context.pruneTikTokProcessedLabelsFromQueue(fullOrders);
assert.strictEqual(result.removed, 2, 'Both yesterday completed labels must be removed, including an order matched by deterministic ID only');
assert.strictEqual(result.labels.length, 1, 'Only the truly new, unlinked label should remain');
assert.strictEqual(result.labels[0].trackingNo, '86257329003');
assert.strictEqual(context.tiktokSelectedTrackingNos.size, 0, 'Old selections must be removed after reconciliation');
assert.strictEqual(fullOrders.length, 2, 'Reconciliation must not delete authoritative orders');
assert(/const idTracking=\/\^tiktok_\/i\.test\(orderId\)\?normalizeTracking\(orderId\.slice\(7\)\):''/.test(source), 'Reconciliation must match deterministic TikTok order IDs without tracking fields');
assert(/await refreshTikTokQueueOrdersFromCloud\(false\)/.test(html), 'Admin PDF panel must refresh/reconcile against the full Firestore order collection');
assert(/const result=await st\.adminListOrders\(\)/.test(html), 'Queue refresher must query the Admin order collection');
console.log('TIKTOK PDF COMPLETED-ORDER RECONCILIATION PASS: matched by deterministic ID and canonical tracking; only the new label remains; authoritative orders untouched');
