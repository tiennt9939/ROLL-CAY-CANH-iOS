const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('../app/src/main/assets/tiktok-label-import.js');

// Sanitized visual-table fragments transcribed from all 12 pages of the supplied TikTok PDF.
// Recipient names, addresses, phones, live tracking numbers and live Order IDs are excluded.
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tiktok_pdf_table_samples.json'), 'utf8'));
assert.strictEqual(fixtures.length, 12, 'Keep coverage for every page of the supplied sample PDF');

const parsed = parser.parsePages(fixtures.map(sample => ({
  page: sample.page,
  // Representative PDFBox content-stream order: table field labels/values can be separated
  // by blank lines and interleaved with non-table text, so this representation is not reliable.
  text: `${sample.trackingNo}\nProduct Name\n\nSKU\n\nSeller SKU\n\nQty\nQty Total: 1\nOrder ID: ${sample.orderId}`,
  fallbackText: `${sample.trackingNo}\nOrder ID: ${sample.orderId}\nProduct Name\nSKU\nSeller SKU\nQty\nQty Total: 1`,
  // This field is supplied by the native Android coordinate-based PDF extractor.
  visualText: `${sample.trackingNo}\n${sample.visualTable}\nOrder ID: ${sample.orderId}`
})));

assert.strictEqual(parsed.length, 12);
const notReady = parsed.filter(row => row.status !== 'ready' || !row.products.length || !(Number(row.products[0]?.qty) > 0));
assert.strictEqual(notReady.length, 0, `Every sample page must extract a product and positive Qty: ${JSON.stringify(notReady)}`);
assert(parsed.every(row => row.trackingNo && row.orderId), 'Tracking and Order ID must still be required');
assert(parsed.some(row => /Nguyệt quế thái siêu hoa thơm/i.test(row.products[0].productName)), 'C7/C9 plant name missing');
assert(parsed.some(row => /Combo 5 cây cẩm tú mai thái/i.test(row.products[0].productName)), 'Combo plant name missing');
assert(parsed.some(row => /Cây Táo Thái sẵn bông/i.test(row.products[0].productName)), 'Wrapped plant name missing');
assert(parsed.some(row => /C7/.test(row.products[0].sku)), 'Wrapped SKU/size text missing');
console.log('TIKTOK PDF REAL-LAYOUT REGRESSION PASS: 12/12 pages have product + Qty');
