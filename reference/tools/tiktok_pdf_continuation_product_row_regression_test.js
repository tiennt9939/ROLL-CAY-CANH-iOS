'use strict';
const assert = require('assert');
const parser = require('../app/src/main/assets/tiktok-label-import.js');

// Regression based on TikTokSeller_1792418463567.pdf, pages 10–11 (Order ID 586670402637104154).
// Page 10 contains Quỳnh Anh and Nguyệt quế; page 11 has a real Ổi Lê row plus order-wide Qty Total: 3.
// The continuation page has no tracking number and Android coordinate-cell extraction returns []; text extraction still finds a real product row, so pages must merge by the repeated Order ID.
const orderId = '586670402637104154';
const tracking = 'VNGH80293690511';
const header1 = 'Product Name                                       SKU           Seller SKU                    Qty';
const page1Text = [
  tracking,
  `Order ID: ${orderId}`,
  'In transit by: 20/10/2026 23:59',
  header1,
  'Combo 2 chậu quỳnh anh sẵn nụ                      Mặc định                                      1',
  'hoa nở quanh năm + cây trang trí',
  'sân vườn',
  'Nguyệt quế thái siêu hoa thơm                      2 chậu C7                                     1',
  '                                                   cao 15-',
  '                                                   20cm',
  `Order ID: ${orderId}`
].join('\n');
const page2Text = [
  'In transit by: 20/10/2026 23:59',
  'Product Name                        SKU        Seller SKU                 Qty',
  'Ổi Lê Siêu Trái C9 -C10( đang sẵn   Mặc định                                1',
  'trái )',
  '                                                                      Qty Total: 3',
  `                                                        Order ID: ${orderId}`
].join('\n');

const page1 = {page:10, visualText:page1Text, text:page1Text};
const page2 = {page:11, visualText:page2Text, text:page2Text, tableRows:[]}; // Android supplies [], even when coordinate-cell extraction misses this row.
const continuation = parser.parsePage(page2);
assert.strictEqual(continuation.continuationOnly, false, 'a continuation page containing a valid product row must not be treated as footer-only');
assert.strictEqual(continuation.products.length, 1, JSON.stringify(continuation));
assert.strictEqual(continuation.products[0].qty, 1, 'Qty Total belongs to the whole order, not the product row on the continuation page');
assert.strictEqual(continuation.continuationOnly, false, 'empty tableRows must not erase a real row parsed from page text');
assert.strictEqual(continuation.qtyTotal, 3);

const orders = parser.parsePages([page1, page2]);
assert.strictEqual(orders.length, 1, JSON.stringify(orders));
const order = orders[0];
assert.strictEqual(order.trackingNo, tracking);
assert.strictEqual(order.orderId, orderId);
assert.strictEqual(order.status, 'ready', JSON.stringify(order));
assert.strictEqual(order.products.length, 3, 'all three distinct plant lines must survive continuation merging');
assert.deepStrictEqual(order.products.map(p => p.qty), [1, 1, 1]);
assert.deepStrictEqual(order.products.map(p => parser.expectedPlantsPerSoldUnit(p)), [2, 2, 1]);
assert.strictEqual(order.products.reduce((sum,p)=>sum+Number(p.qty||0),0), 3, 'sum of sold units matches PDF Qty Total');
assert.strictEqual(order.products.reduce((sum,p)=>sum+Number(p.qty||0)*parser.expectedPlantsPerSoldUnit(p),0), 5, 'expected physical plant count is 2 Quỳnh Anh + 2 Nguyệt quế + 1 Ổi Lê');
assert(order.sourcePages.includes(10)&&order.sourcePages.includes(11));

// Native/visual PDF extraction can occasionally produce a stray tracking token on the continuation page.
// Exact Order ID remains the primary key and must win over a conflicting tracking extraction.
const page2WithStrayTracking = {page:11, visualText:`862568686239\n${page2Text}`, text:`862568686239\n${page2Text}`, tableRows:[]};
const groupedDespiteStrayTracking = parser.parsePages([page1, page2WithStrayTracking]);
assert.strictEqual(groupedDespiteStrayTracking.length, 1, `Same Order ID must stay one order despite different extracted tracking: ${JSON.stringify(groupedDespiteStrayTracking)}`);
assert.strictEqual(groupedDespiteStrayTracking[0].orderId, orderId);
assert.strictEqual(groupedDespiteStrayTracking[0].products.length, 3);
assert.strictEqual(groupedDespiteStrayTracking[0].status, 'ready', JSON.stringify(groupedDespiteStrayTracking[0]));
assert(groupedDespiteStrayTracking[0].trackingAliases.includes('862568686239'), JSON.stringify(groupedDespiteStrayTracking[0].trackingAliases));
console.log('TIKTOK CONTINUATION ORDER-ID PRIMARY REGRESSION PASS: source pages 10–11 joined by exact Order ID, all 3 product lines preserved');
console.log('TIKTOK CONTINUATION PRODUCT ROW REGRESSION PASS: 3 product lines preserved, Qty Total reconciled, 5 physical plants counted');
