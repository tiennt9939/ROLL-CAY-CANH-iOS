'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'app/build.gradle.kts'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'tools/preflight.py'), 'utf8');
const scanner = fs.readFileSync(path.join(root, 'app/src/main/java/com/quanlycay/apk/ShippingBarcodeScannerActivity.java'), 'utf8');
assert(gradle.includes('versionName = "26.2.92"') && gradle.includes('versionCode = 144'), 'V26.2.92 metadata must be aligned');
assert(scanner.includes('if (tracking.length() >= 8 && tracking.length() <= 40) dailyExpected.put(tracking, row);'), 'daily camera must index all normalized imported PDF tracking numbers, not only four hard-coded prefixes');
assert(scanner.includes('private boolean isTrackableTracking(String value)'), 'camera needs a single exact imported-label matching policy');
assert(scanner.includes('return dailyBatchMode && dailyExpected.containsKey(normalized);'), 'non-legacy tracking formats must only pass in batch mode when they exactly match an imported PDF label');
assert(scanner.includes('if (isTrackableTracking(normalized))') && scanner.includes('if (isTrackableTracking(displayNormalized))'), 'both raw/display barcode values must use imported-label matching');
for (const format of ['FORMAT_EAN_13','FORMAT_EAN_8','FORMAT_UPC_A','FORMAT_UPC_E']) assert(scanner.includes(format), `scanner should decode expected linear barcode format ${format}`);
assert(html.includes("String(orderPatch?.source||'')==='pdf_label'") && html.includes('normalizeTracking(orderPatch?.trackingNo||\'\')===tracking'), 'Cloud transaction must only relax the legacy pattern for an exact imported PDF row');
assert(html.includes("source:'pdf_label',status:'recorded',recordedAtMs:scannedAtMs"), 'legacy imported rows must be identified as PDF labels when sent to the transaction');
assert(html.includes('V26.2.69-LEGACY-ORDER-RECONCILIATION'), 'HTML cloud write metadata must identify assignment-first workflow');
assert(html.includes('Array.isArray(orderPatch?.products)&&orderPatch.products.length>0'), 'non-legacy code requires parsed PDF products before recording');
assert(preflight.includes('versionName = "26.2.92"') && preflight.includes('versionCode = 144'), 'preflight must enforce V26.2.92 metadata');
// Behavioral contract: exact known PDF rows are allowed even when the carrier prefix is not in the legacy regex list.
const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function acceptedImportedRow(tracking, orderPatch) {
  tracking = normalize(tracking);
  const knownPdfLabel = normalize(orderPatch?.trackingNo || '') === tracking && String(orderPatch?.source || '') === 'pdf_label' && !!String(orderPatch?.carrier || '').trim() && Array.isArray(orderPatch?.products) && orderPatch.products.length > 0;
  return /^(GHVN[A-Z0-9]{4,26}|VNGH[0-9]{8,12}|862[0-9]{9}|530[0-9]{9})$/.test(tracking) || (knownPdfLabel && tracking.length >= 8 && tracking.length <= 40);
}
const validRow = {trackingNo:'AB12345678901',source:'pdf_label',carrier:'GHN',products:[{productName:'Cẩm tú mai',qty:1}]};
assert(acceptedImportedRow('AB 1234-5678901', validRow), 'an exact non-legacy code from an imported, product-parsed PDF row must pass');
assert(!acceptedImportedRow('AB12345678901', {...validRow, trackingNo:'CD12345678901'}), 'tracking must match the exact imported row');
assert(!acceptedImportedRow('AB12345678901', {...validRow, products:[]}), 'a malformed/unparsed row must not relax the legacy pattern');
assert(!acceptedImportedRow('AB12345678901', {...validRow, source:'manual'}), 'non-PDF rows must not relax the legacy pattern');
console.log('V26.2.50 IMPORTED PDF TRACKING FORMAT SCAN TEST PASS');
