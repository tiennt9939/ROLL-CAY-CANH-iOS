'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'tools/preflight.py'), 'utf8');
const scanner = fs.readFileSync(path.join(root, 'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java'), 'utf8');
assert(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'V26.2.92 metadata must be aligned');
assert(html.includes('function dailyShipmentUniqueOrderRows(rows)') && html.includes('function dailyShipmentRefreshStats(rowsInput)'), 'daily scan queue must use a shared unique-count projection');
assert(!html.includes("stats[2].textContent=String((Number(stats[2].textContent)||0)+1)"), 'scan callback must not blindly increment recorded count');
assert(html.includes('dailyShipmentRefreshStats();') && html.includes('Never increment counts per callback'), 'retry/photo attach callbacks must recompute the count from actual records');
assert(html.includes('dailyShipmentUniqueOrderRows(all)') && html.includes("key=date+'|'+tracking"), 'duplicate queue rows for the same tracking/day must be collapsed');
assert(preflight.includes('versionName = "26.2.92"') && preflight.includes('versionCode = 144'), 'preflight must match current Android version');
assert(scanner.includes('MainActivity.dispatchDailyShipmentCapture(tracking, captured.optString("carrier", ""), persistent.getAbsolutePath(), scannedEmployeeName)'), 'native live capture dispatch must remain responsive');
const qualityDeclaration = html.match(/function dailyShipmentQueueRowQuality\(row\)\{[\s\S]*?\n\}/);
const declaration = html.match(/function dailyShipmentUniqueOrderRows\(rows\)\{[\s\S]*?\n\}/);
assert(qualityDeclaration && declaration, 'unique queue row helpers must be extractable');
const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const helper = vm.runInNewContext(`${qualityDeclaration[0]}; ${declaration[0]}; dailyShipmentUniqueOrderRows`, { normalizeTracking: normalize, Map, Number, String, Array });
const input = [
  { trackingNo: '862-123456789', date: '2026-10-18', status: 'imported', products: [{ productName: 'Cẩm tú mai', qty: 5 }], importedAtMs: 10 },
  { trackingNo: '862123456789', date: '2026-10-18', status: 'recorded', employee: 'Admin', wageRecorded: false, products: [{ productName: 'Cẩm tú mai', qty: 5 }], importedAtMs: 20 },
  { trackingNo: '862123456789', date: '2026-10-19', status: 'imported', products: [{ productName: 'Cẩm tú mai', qty: 5 }], importedAtMs: 30 },
  { trackingNo: '862987654321', date: '2026-10-18', status: 'imported', products: [{ productName: 'Táo thái', qty: 1 }], importedAtMs: 40 }
];
const output = helper(input);
assert.strictEqual(output.length, 3, 'same normalized tracking/day must only appear once; another day and another tracking remain distinct');
const today = output.filter(row => row.date === '2026-10-18');
assert.strictEqual(today.length, 2, 'daily label count should be unique within the selected day');
const adminRow = today.find(row => normalize(row.trackingNo) === '862123456789');
assert.strictEqual(adminRow.status, 'recorded', 'duplicate merge must preserve recorded state');
assert.strictEqual(adminRow.employee, 'Admin', 'duplicate merge must preserve employee attribution');
assert.strictEqual(adminRow.wageRecorded, false, 'Admin zero-wage state must be preserved');
console.log('V26.2.50 IDEMPOTENT DAILY SHIPMENT COUNT TEST PASS');
