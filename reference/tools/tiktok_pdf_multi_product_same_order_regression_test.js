'use strict';
const assert = require('assert');
const parser = require('../app/src/main/assets/tiktok-label-import.js');

// Regression transcribed from the user's J&T/TikTok label (tracking 862542794508).
// Rule to preserve for future labels: one tracking number + one Order ID is one shipment;
// every genuine Product Name/SKU/Seller SKU/Qty row within that label is a separate plant
// line in that SAME order. Wrapped description lines stay with the row whose Qty anchor
// appears first; the continuation page containing only Qty Total/footer is never a new order.
const tracking = '862542794508';
const orderId = '586634608115811400';
const header = 'Product Name'.padEnd(48) + 'SKU'.padEnd(21) + 'Seller SKU'.padEnd(32) + 'Qty';
const page1Lines = [
  header,
  'Combo 4 chậu cẩm tú mai C9 ( cây'.padEnd(48) + 'Mặc định'.padEnd(21) + ''.padEnd(32) + '1',
  'sẵn hoa + cao 25-35cm',
  // Actual PDF places the Seller SKU continuation under the SKU x-coordinate.
  'Cây Trầu Bà Thanh Xuân'.padEnd(48) + '1 Cây'.padEnd(21) + ''.padEnd(32) + '1',
  'Philodendron bipinnatifidum Ánh'.padEnd(48) + 'Thanh',
  'Sáng Gián Tiếp Tán Xạ Dùng Nước'.padEnd(48) + 'Xuân C9',
  'Mua hoặc Nước Lọc Giữ Ấm Cân',
  'Độ Ẩm Cao >60% Phun Sương Vị',
  'Trí Trong Nhà Tránh Gió Lùa',
  // Real page 3 has no Qty Total row; the footer Order ID ends the product table.
  ' '.repeat(75) + `Order ID: ${orderId}`
].join('\n');
const page1 = {
  page: 3,
  visualText: `${tracking}\n${page1Lines}`,
  text: `${tracking}\n${page1Lines}`
};
// The actual uploaded PDF's page 4 contains only the table header, Qty Total: 2 and the same Order ID.
const continuationText = `Product Name                      SKU   Seller SKU                 Qty\n                                                               Qty Total: 2\n\n                                                 Order ID: ${orderId}`;
const page2 = { page: 4, visualText: continuationText, text: continuationText };

const rows = parser.parsePages([page1, page2]);
assert.strictEqual(rows.length, 1, `Continuation page must remain within one shipment: ${JSON.stringify(rows)}`);
const order = rows[0];
assert.strictEqual(order.trackingNo, tracking);
assert.strictEqual(order.orderId, orderId);
assert.strictEqual(order.status, 'ready', JSON.stringify(order));
assert.strictEqual(order.products.length, 2, `One label must contain two plant product lines, not one merged description: ${JSON.stringify(order.products)}`);

const product1 = order.products[0];
const product2 = order.products[1];
assert.strictEqual(product1.qty, 1);
assert.strictEqual(product2.qty, 1);
assert(/cẩm tú mai/i.test(parser.stripProductDescription(product1.productName)), product1.productName);
assert.strictEqual(product1.productName, 'Combo 4 chậu cẩm tú mai C9');
assert.strictEqual(parser.stripProductDescription(product1.rawProductName || product1.productName), 'Combo 4 chậu cẩm tú mai C9');
assert.strictEqual(parser.expectedPlantsPerSoldUnit(product1), 4);
assert.strictEqual(product2.productName, 'Cây Trầu Bà Thanh Xuân');
assert.strictEqual(product2.sku, '1 Cây');
assert.strictEqual(product2.sellerSku, 'Thanh Xuân C9');
assert(!/Order ID/i.test(product2.sellerSku));
assert.strictEqual(parser.stripProductDescription(product2.rawProductName || product2.productName), 'Cây Trầu Bà Thanh Xuân');
assert.strictEqual(parser.expectedPlantsPerSoldUnit(product2), 1);
assert(!/philodendron|ánh sáng|độ ẩm|phun sương|tránh gió lùa/i.test(parser.stripProductDescription(product2.productName)));

const catalog = [
  {name: 'Cẩm tú mai', size: 'C9', _index: 9, _key: 'cam-tu-mai-c9'},
  {name: 'Trầu bà thanh xuân', size: 'C9', _index: 12, _key: 'trau-ba-thanh-xuan-c9'}
];
const match1 = parser.matchCatalogProduct(product1, catalog);
const match2 = parser.matchCatalogProduct(product2, catalog);
assert.strictEqual(match1.matched, true, JSON.stringify(match1));
assert.strictEqual(match1.name, 'Cẩm tú mai');
assert.strictEqual(match1.size, 'C9');
assert.strictEqual(match1.perUnit, 4);
assert.strictEqual(match2.matched, true, JSON.stringify(match2));
assert.strictEqual(match2.name, 'Trầu bà thanh xuân');
assert.strictEqual(match2.size, 'C9');
assert.strictEqual(match2.perUnit, 1);
assert.strictEqual(product1.qty * match1.perUnit + product2.qty * match2.perUnit, 5, 'Physical stock must be four Cẩm tú mai plus one Trầu bà, not one corrupted five-plant row');

// Description-only variations must not change plant identity in future matching rules.
assert.strictEqual(
  parser.stripProductDescription('Trầu Bà Thanh Xuân Philodendron bipinnatifidum Ánh Sáng Gián Tiếp'),
  'Trầu Bà Thanh Xuân'
);
console.log('TIKTOK MULTI-PRODUCT SAME-ORDER REGRESSION PASS: one shipment, two matched products, wrapped SEO text excluded, Qty Total footer merged');
