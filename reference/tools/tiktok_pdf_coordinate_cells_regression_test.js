'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('../app/src/main/assets/tiktok-label-import.js');

// Reconstructed from the real uploaded TikTokSeller_1792217963994.pdf pages 3–4.
// Android now sends tableRows split by PDF glyph X coordinates; this fixture verifies the
// parser does not regress to fixed character-offset slicing of proportional-font text.
const tracking = '862542794508';
const orderId = '586634608115811400';
const page3 = {
  page: 3,
  visualText: `J&T EXPRESS ${tracking}\nOrder ID: ${orderId}\nProduct Name SKU Seller SKU Qty\nCombo 4 chậu cẩm tú mai C9 ( cây Mặc định 1\nsẵn hoa + cao 25-35cm\nCây Trầu Bà Thanh Xuân 1 Cây 1\nPhilodendron bipinnatifidum Ánh Thanh\nSáng Gián Tiếp Tán Xạ Dùng Nước Xuân C9\nMua hoặc Nước Lọc Giữ Ấm Cân\nĐộ Ấm Cao >60% Phun Sương Vị\nTrí Trong Nhà Tránh Gió Lùa\nOrder ID: ${orderId}`,
  text: `Mã vận đơn ${tracking}\nOrder ID: ${orderId}`,
  tableRows: [
    { productName: 'Combo 4 chậu cẩm tú mai C9 ( cây sẵn hoa + cao 25-35cm', sku: 'Mặc định', sellerSku: '', qty: 1 },
    { productName: 'Cây Trầu Bà Thanh Xuân Philodendron bipinnatifidum Ánh Sáng Gián Tiếp Tán Xạ Dùng Nước Mua hoặc Nước Lọc Giữ Ấm Cân Độ Ấm Cao >60% Phun Sương Vị Trí Trong Nhà Tránh Gió Lùa', sku: '1 Cây Thanh Xuân C9', sellerSku: '', qty: 1 }
  ]
};
const page4 = {
  page: 4,
  visualText: `J&T EXPRESS ${tracking}\nProduct Name SKU Seller SKU Qty\nQty Total: 2\nOrder ID: ${orderId}`,
  text: `Order ID: ${orderId}\nQty Total: 2`,
  tableRows: []
};
const orders = parser.parsePages([page3, page4]);
assert.strictEqual(orders.length, 1, 'Continuation page must not create another shipment');
const order = orders[0];
assert.strictEqual(order.trackingNo, tracking);
assert.strictEqual(order.orderId, orderId);
assert.strictEqual(order.status, 'ready', JSON.stringify(order));
assert.strictEqual(order.products.length, 2, JSON.stringify(order.products));
const [camTuMai, trauBa] = order.products;
assert.strictEqual(camTuMai.productName, 'Combo 4 chậu cẩm tú mai C9');
assert.strictEqual(camTuMai.sku, 'Mặc định');
assert.strictEqual(camTuMai.qty, 1);
assert.strictEqual(parser.expectedPlantsPerSoldUnit(camTuMai), 4);
assert.strictEqual(trauBa.productName, 'Cây Trầu Bà Thanh Xuân');
assert.strictEqual(trauBa.sku, '1 Cây');
assert.strictEqual(trauBa.sellerSku, 'Thanh Xuân C9');
assert.strictEqual(trauBa.qty, 1);
assert.strictEqual(parser.expectedPlantsPerSoldUnit(trauBa), 1);
assert(!/philodendron|ánh sáng|độ ẩm|phun sương|tránh gió lùa/i.test(trauBa.productName));
const catalog = [
  { name: 'Cẩm tú mai', size: 'C9', _index: 9, _key: 'cam-tu-mai-c9' },
  { name: 'Trầu bà thanh xuân', size: 'C9', _index: 12, _key: 'trau-ba-thanh-xuan-c9' }
];
const m1 = parser.matchCatalogProduct(camTuMai, catalog);
const m2 = parser.matchCatalogProduct(trauBa, catalog);
assert.strictEqual(m1.matched, true, JSON.stringify(m1));
assert.strictEqual(m1.name, 'Cẩm tú mai');
assert.strictEqual(m1.size, 'C9');
assert.strictEqual(m1.perUnit, 4);
assert.strictEqual(m2.matched, true, JSON.stringify(m2));
assert.strictEqual(m2.name, 'Trầu bà thanh xuân');
assert.strictEqual(m2.size, 'C9');
assert.strictEqual(m2.perUnit, 1);
assert.strictEqual(camTuMai.qty * m1.perUnit + trauBa.qty * m2.perUnit, 5);
console.log('PASS: real TikTok PDF regression fixture -> one order, two products, five plants; continuation Qty Total ignored');
