const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const start = html.indexOf('function shipmentReportDateForOrder(r){');
const end = html.indexOf('function completedShipmentRows(){', start);
assert(start >= 0 && end > start, 'Shipment report date helper must exist before report rows are built');
const source = html.slice(start, end);
const context = {
  fmt: d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
};
vm.createContext(context);
vm.runInContext(source, context);
const tsToday = new Date(2026, 9, 14, 12, 0, 0).getTime();
const linkedToday = {
  completedDate: '2026-10-13', date: '2026-10-13',
  status: 'completed', orderType: 'ĐD', shipmentOcrStatus: 'linked_tiktok_pdf', shipmentLinkedFrom: 'tiktok_pdf',
  shipmentLinkedAtMs: tsToday, linkedTikTokOrderId: '5767000012345678901'
};
assert.strictEqual(context.shipmentReportDateForOrder(linkedToday), '2026-10-14', 'A legacy V26.2.24 PDF-linked surplus order must report on PDF/link day, not packing-completion day');
assert.strictEqual(linkedToday.completedDate, '2026-10-13', 'Resolving report date must not mutate yesterday completion date');
const explicitScanDate = { ...linkedToday, shipmentReportDate: '2026-10-14', shipmentScannedAtMs: tsToday, shipmentLinkedAtMs: new Date(2026, 9, 15, 1).getTime() };
assert.strictEqual(context.shipmentReportDateForOrder(explicitScanDate), '2026-10-14', 'Persisted PDF scan date has priority over later manual link timestamp');
const ordinaryOrder = { completedDate: '2026-10-13', status: 'completed', shipmentTrackingNo: '862123456789' };
assert.strictEqual(context.shipmentReportDateForOrder(ordinaryOrder), '2026-10-13', 'Normal non-PDF shipment records retain the normal completion date');
const invalid = { ...linkedToday, shipmentReportDate: 'not-a-date' };
assert.strictEqual(context.shipmentReportDateForOrder(invalid), '2026-10-14', 'Invalid explicit date falls back to linked/scanned timestamp');
const marker = html.slice(html.indexOf('async function adminLinkTikTokPdfToDeliveryOrder('), html.indexOf('async function adminUpdatePackingOrder(', html.indexOf('async function adminLinkTikTokPdfToDeliveryOrder(')));
assert(/shipmentReportDate,shipmentScannedAtMs:scannedAtMs,shipmentScanSource:'tiktok_pdf'/.test(marker), 'PDF linking must persist separate report date and scan timestamp');
assert(!/completedDate\s*:/.test(marker) && !/date\s*:/.test(marker), 'Linking must not rewrite packing completion date');
assert(!/payAmount\s*:/.test(marker) && !/employeePay\s*:/.test(marker), 'Linking must not recalculate payroll');
assert(/date:shipmentReportDateForOrder\(r\)/.test(html), 'Carrier report rows must filter/display using the shipment report date');
console.log('TIKTOK PDF DELIVERY REPORT DATE PASS: report uses PDF scan date; yesterday completion date and payroll remain unchanged; legacy V26.2.24 links are handled.');
