'use strict';
const assert = require('assert');
const parser = require('../app/src/main/assets/tiktok-label-import.js');

// Reproduce the reported GHN/TikTok label: Product Name wraps onto a second line,
// while the SKU itself wraps "Combo 4" / "tặng 1". That "1" is NOT Qty.
const header = 'Product Name'.padEnd(44) + 'SKU'.padEnd(20) + 'Seller SKU'.padEnd(28) + 'Qty';
const first = 'Cây Ruby Đỏ - Nắng màu đỏ rực'.padEnd(44) + 'Combo 4'.padEnd(20) + ''.padEnd(28) + '1';
const continuation = 'phù hợp mọi không gian'.padEnd(44) + 'tặng 1';
const visualText = [
  'VNGH80920580311',
  'Order ID: 586572630683191051',
  header,
  first,
  continuation,
  'Qty Total: 1'
].join('\n');
// Simulate alternative non-spatial extraction which previously gained a higher score
// by inventing two product rows from one line and its continuation.
const malformedText = [
  'VNGH80920580311',
  'Order ID: 586572630683191051',
  header,
  'Cây Ruby Đỏ - Nắng màu đỏ rực Combo 4'.padEnd(44) + ''.padEnd(20) + ''.padEnd(28) + '1',
  'phù hợp mọi không gian tặng 1',
  'Qty Total: 1'
].join('\n');
const row = parser.parsePage({page: 1, visualText, text: malformedText});
assert.strictEqual(row.status, 'ready', JSON.stringify(row));
assert.strictEqual(row.products.length, 1, `One PDF product must not be split: ${JSON.stringify(row.products)}`);
assert(row.products[0].productName.includes('Cây Ruby Đỏ'), row.products[0].productName);
assert(!row.products[0].productName.includes('phù hợp mọi không gian'), 'SEO description must be removed from displayed product name');
assert(/Combo 4/.test(row.products[0].sku) && /tặng 1/i.test(row.products[0].sku), row.products[0].sku);
assert.strictEqual(row.products[0].qty, 1, 'Qty column is one sold unit, not the bonus count');
assert.strictEqual(parser.expectedPlantsPerSoldUnit(row.products[0]), 5, 'Combo 4 tặng 1 must map to five physical plants per sold unit');
assert.strictEqual(parser.expectedPlantsPerSoldUnit({productName:'Cây A', sku:'Combo 4', sellerSku:''}), 4, 'A combo without a gift retains the original count');
assert.strictEqual(parser.expectedPlantsPerSoldUnit({productName:'Cây A', sku:'Combo 4 tặng 2', sellerSku:''}), 6, 'Gift quantity is added to the combo size');

// Exact observed extraction failure: the PDF parser returns the final title fragment
// with a dangling "tặng" and the adjacent SKU field contains only the number 1.
const brokenPage = {
  page: 2,
  text: [
    'VNGH80920580311', 'Order ID: 586572630683191051',
    'Product Name',
    'Cây Ruby Đỏ - Nắng màu đỏ rực Combo 4 phù hợp mọi không gian tặng', '',
    'SKU', '1', '',
    'Seller SKU', '',
    'Qty', '1', 'Qty Total: 1'
  ].join('\n')
};
const repaired = parser.parsePage(brokenPage);
assert.strictEqual(repaired.status, 'ready', JSON.stringify(repaired));
assert.strictEqual(repaired.products.length, 1, JSON.stringify(repaired.products));
assert.strictEqual(repaired.products[0].productName, 'Cây Ruby Đỏ');
assert.strictEqual(repaired.products[0].sku, 'Combo 4 tặng 1');
assert.strictEqual(repaired.products[0].qty, 1);
assert.strictEqual(parser.expectedPlantsPerSoldUnit(repaired.products[0]), 5);

// Exact real-label regression: marketing continuation and "tặng 1" are wrapped into
// separate text lines, while the sold Qty=2 may appear in its own right-aligned line.
const rubyHeader = 'Product Name'.padEnd(44) + 'SKU'.padEnd(20) + 'Seller SKU'.padEnd(28) + 'Qty';
const rubyLine1 = 'Cây Ruby Đỏ - Nắng màu đỏ rực'.padEnd(44) + 'Combo 4'.padEnd(20) + ''.padEnd(28);
const rubyLine2 = 'phù hợp mọi không gian'.padEnd(44) + 'tặng 1'.padEnd(20) + ''.padEnd(28);
const rubyQtyLine = ''.padEnd(96) + '2';
const rubyText = [
  '862538643968',
  'Order ID: 586626205975218120',
  rubyHeader,
  rubyLine1,
  rubyLine2,
  rubyQtyLine,
  'Qty Total: 2'
].join('\n');
const rubyLabel = parser.parsePage({page: 99, visualText: rubyText, text: rubyText});
assert.strictEqual(rubyLabel.status, 'ready', JSON.stringify(rubyLabel));
assert.strictEqual(rubyLabel.products.length, 1, `Marketing continuation must not create a fake product: ${JSON.stringify(rubyLabel.products)}`);
assert.strictEqual(rubyLabel.products[0].qty, 2, 'The sold Qty column must remain 2 combo units');
assert.strictEqual(rubyLabel.products[0].productName, 'Cây Ruby Đỏ');
assert(!/phù hợp mọi không gian/.test(rubyLabel.products[0].productName), 'SEO description must be excluded from displayed plant name');
assert.strictEqual(rubyLabel.products[0].sku, 'Combo 4 tặng 1');
assert.strictEqual(parser.expectedPlantsPerSoldUnit(rubyLabel.products[0]), 5);
const rubyCatalog = [
  {name:'Rubi', size:'C7', _index:104, _key:'rubi-c7'},
  {name:'Rubi', size:'C9', _index:105, _key:'rubi-c9'}
];
const rubyMatch = parser.matchCatalogProduct(rubyLabel.products[0], rubyCatalog);
assert.strictEqual(rubyMatch.matched, true, JSON.stringify(rubyMatch));
assert.strictEqual(rubyMatch.name, 'Rubi');
assert.strictEqual(rubyMatch.size, 'C7', 'No explicit size follows the existing default-C7 rule');
assert.strictEqual(rubyMatch.perUnit, 5, 'Combo 4 plus one gift equals five plants per combo');
assert.strictEqual(rubyLabel.products[0].qty * rubyMatch.perUnit, 10, 'Qty 2 must produce ten Ruby plants on this order');
const rubyAltDescription = {...rubyLabel.products[0], productName:'Cây Ruby Đỏ - cây cảnh dễ chăm sóc, màu sắc rực rỡ'};
assert.strictEqual(parser.recognitionSignature(rubyAltDescription), parser.recognitionSignature(rubyLabel.products[0]), 'Different marketing descriptions must not change the plant identity rule');

console.log('TIKTOK PDF COMBO-GIFT REGRESSION PASS: ordinary and malformed layouts normalize to one row, SKU Combo 4 tặng 1, five physical plants');
