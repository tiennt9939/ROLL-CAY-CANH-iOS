const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');

const helperStart = html.indexOf('function normalizeTikTokSurplusText(value){');
const helperEnd = html.indexOf('function tiktokLiveOrderForLabel(row,orders){', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'PDF-to-ĐD matching helpers must exist');
const helperSource = html.slice(helperStart, helperEnd);

const context = {
  D: { catalog: [{ name: 'Cẩm tú mai', size: 'C7' }, { name: 'Nguyệt quế Thái', size: 'C9' }] },
  normalizeTracking: v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
  tiktokMappingIsValid: () => true,
  tiktokLabelOrderCompositionIsValid: () => false,
  tiktokLabelMappedItems: row => row.mappedItems,
  orderItems: row => row.items || [],
  tiktokLiveOrderForLabel: (label, orders) => (orders || []).find(o =>
    String(o.id) === String(label.packingOrderId || '') ||
    context.normalizeTracking(o.shipmentTrackingNo || o.shipment?.trackingNo || '') === context.normalizeTracking(label.trackingNo || '')
  ) || null,
  console,
};
vm.createContext(context);
vm.runInContext(helperSource, context);

const label = (trackingNo, orderId, mappedItems) => ({
  trackingNo, orderId, status: 'ready', mappedItems,
  products: [{ mapKey: 'mapped', qty: 1 }], packingOrderId: '', existingOrder: false,
});
const dd = (id, items, extra = {}) => ({
  id, orderNo: id, employee: 'Nhân viên A', orderType: 'ĐD', status: 'completed',
  shipmentOcrPending: true, items, ...extra,
});
const camTuMai10 = [{ plantName: 'CẨM TÚ MAI', size: 'C7', qty: 10 }];
const labels = [label('862123456789', 'order-today-1', camTuMai10)];
const orders = [dd('dd-yesterday-1', [{ plantIndex: 0, plantName: 'Cẩm tú mai', size: 'C7', qty: 10 }])];
let plan = context.planTikTokDeliverySurplusLinks(labels, orders);
assert.strictEqual(plan.pairs.length, 1, 'A single exact plant/size/quantity match should auto-link');
assert.strictEqual(plan.pairs[0].label.orderId, 'order-today-1');
assert.strictEqual(plan.pairs[0].deliveryOrder.id, 'dd-yesterday-1');

plan = context.planTikTokDeliverySurplusLinks(labels, [
  ...orders,
  dd('dd-yesterday-2', [{ plantIndex: 0, plantName: 'Cẩm tú mai', size: 'C7', qty: 10 }]),
]);
assert.strictEqual(plan.pairs.length, 0, 'Duplicate completed ĐD candidates must never be auto-linked by guess');
assert.strictEqual(context.getTikTokDeliverySurplusCandidates(labels[0], [
  ...orders,
  dd('dd-yesterday-2', [{ plantIndex: 0, plantName: 'Cẩm tú mai', size: 'C7', qty: 10 }]),
]).length, 2, 'Ambiguous exact candidates should be offered for explicit Admin selection');

const wrongQty = [dd('dd-yesterday-qty-mismatch', [{ plantIndex: 0, plantName: 'Cẩm tú mai', size: 'C7', qty: 9 }])];
assert.strictEqual(context.planTikTokDeliverySurplusLinks(labels, wrongQty).pairs.length, 0, 'Qty mismatch must not link');
const wrongSize = [dd('dd-yesterday-size-mismatch', [{ plantIndex: 1, plantName: 'Nguyệt quế Thái', size: 'C9', qty: 10 }])];
assert.strictEqual(context.planTikTokDeliverySurplusLinks(labels, wrongSize).pairs.length, 0, 'Plant or size mismatch must not link');
const notPending = [dd('dd-already-linked', [{ plantIndex: 0, plantName: 'Cẩm tú mai', size: 'C7', qty: 10 }], { shipmentOcrPending: false })];
assert.strictEqual(context.planTikTokDeliverySurplusLinks(labels, notPending).pairs.length, 0, 'Already linked surplus rows must not be reused');
const incomplete = [label('862123456789', '', camTuMai10)];
assert.strictEqual(context.planTikTokDeliverySurplusLinks(incomplete, orders).pairs.length, 0, 'PDF without external order ID must not auto-link');

const cloudStart = html.indexOf('async function adminLinkTikTokPdfToDeliveryOrder(');
const cloudEnd = html.indexOf('async function adminUpdatePackingOrder(', cloudStart);
assert(cloudStart >= 0 && cloudEnd > cloudStart, 'Transactional Admin link method must exist');
const cloudMethod = html.slice(cloudStart, cloudEnd);
assert(/db\.runTransaction\(async tx=>/.test(cloudMethod), 'PDF linking must be transactional');
assert(/tx\.set\(claimRef/.test(cloudMethod), 'PDF linking must create a duplicate-tracking claim');
assert(/shipmentOcrPending:false/.test(cloudMethod), 'Linked DD record must leave the un-OCR queue');
assert(/tiktokOrderId:externalOrderId/.test(cloudMethod), 'The external TikTok order number must be stored on the existing DD record');
assert(/shipmentReportDate/.test(cloudMethod)&&/shipmentScannedAtMs/.test(cloudMethod), 'Linking must store PDF scan/report date separately from packing completion date');
assert(/scannedAtMs,scanDate/.test(html), 'The actual PDF import timestamp must be passed into the transactional link');
assert(!/payAmount\s*:/.test(cloudMethod) && !/employeePay\s*:/.test(cloudMethod), 'Linking must not change existing payroll');
assert(!/status\s*:\s*'completed'/.test(cloudMethod) && !/items\s*:/.test(cloudMethod), 'Linking must not re-complete or replace the existing packing order');
const statePos = html.indexOf('function state(){', cloudEnd);
const stateLine = html.slice(statePos, html.indexOf('\n', statePos));
assert(statePos >= 0 && stateLine.includes('adminLinkTikTokPdfToDeliveryOrder'), 'Cloud method must be exported to WebView');
assert(/await autoLinkUniqueTikTokPdfToDeliverySurplus\(\{force:true,silent:true\}\)/.test(html), 'PDF import must attempt exact unique matching');
assert(/linkTikTokPdfToDeliverySurplusOrder/.test(html), 'Ambiguous matches must have an Admin manual-selection path');
console.log('TIKTOK PDF → COMPLETED ĐD SURPLUS LINK PASS: exact unique matches pair automatically; ambiguous/mismatched matches are blocked or require Admin selection; existing wage/order data are preserved.');
