const assert = require('assert');
const parser = require('../app/src/main/assets/tiktok-label-import.js');
const page = (text, pageNo = 1) => ({ page: pageNo, text });
const jntC7 = `862596581425\nNgười gửi Roll Cây Cảnh\nOrder ID: 586534686489019809\nProduct Name                                      SKU                Seller SKU                    Qty\nNguyệt quế thái siêu hoa thơm                       1 chậu C7          1000                           1\ncao 15-\n20cm\nQty Total: 1`;
const ghnC7 = `VNGH80315470213\nNgười gửi Roll Cây Cảnh\nOrder ID: 586534641275012442\nProduct Name                                      SKU                Seller SKU                    Qty\nNguyệt quế thái siêu hoa thơm                       1 chậu C7          1000                           1\ncao 15-\n20cm\nQty Total: 1`;
const combo = `862570541435\nOrder ID: 586534361301026308\nProduct Name                                      SKU                Seller SKU                    Qty\nCombo 5 cây cẩm tú mai thái C6,                    Combo 5                                          2\nC7- Cây ngoại thất, trang trí vườn,\nhoa màu độc đáo, rực rỡ\nQty Total: 2`;
let rows = parser.parsePages([page(jntC7,1), page(ghnC7,2), page(combo,3)]);
assert.strictEqual(rows.length, 3);
assert(rows.every(x => x.status === 'ready'), JSON.stringify(rows));
assert.strictEqual(rows[0].trackingNo, '862596581425');
assert.strictEqual(rows[0].carrier, 'J&T Express');
assert.strictEqual(rows[0].orderId, '586534686489019809');
assert.strictEqual(rows[0].products[0].qty, 1);
assert(rows[0].products[0].sku.includes('C7'));
assert.strictEqual(rows[1].trackingNo, 'VNGH80315470213');
assert.strictEqual(rows[1].carrier, 'GHN');
assert.strictEqual(rows[2].trackingNo, '862570541435');
assert.strictEqual(rows[2].products[0].qty, 2, 'Qty must remain sale units; combo conversion is Admin-mapped explicitly');
assert.strictEqual(parser.expectedPlantsPerSoldUnit(rows[2].products[0]), 5, 'Combo size in the product label should be used only as a mapping validation guard');
assert.strictEqual(parser.expectedPlantsPerSoldUnit({productName:'Combo 2 chậu Vàng Bạc'}), 2);
assert.strictEqual(parser.expectedPlantsPerSoldUnit({productName:'Cây Ruby Đỏ',sku:'Combo 4 tặng 1'}), 5, 'Combo 4 tặng 1 represents five physical plants');
assert.strictEqual(parser.expectedPlantsPerSoldUnit({productName:'Cây A',sku:'Combo 4 tặng 2'}), 6, 'Gift quantity must add to the combo count');
assert.strictEqual(parser.carrierFor('530123456789'), 'J&T Cargo');
assert.strictEqual(parser.extractTracking('VNGH 80315470213')[0], 'VNGH80315470213', 'PDF extraction spaces must not break GHN tracking');
assert.strictEqual(parser.extractTracking('862 519 321 425')[0], '862519321425', 'PDF extraction spaces must not break J&T tracking');
const duplicate = parser.parsePages([page(jntC7,1), page(jntC7,2)]);
assert(duplicate.every(x => x.status === 'needs_review' && x.reviewReason.includes('trùng')));
const invalid = parser.parsePage(page('No track number here\nNo Order ID\nNo product table'));
assert.strictEqual(invalid.status, 'needs_review');

// Regression: PDF generators may place the Qty value a few columns before the Qty header.
const shiftedQty = `862596581425\nOrder ID: 586534686489019809\nProduct Name                                      SKU                Seller SKU                    Qty\nNguyệt quế thái siêu hoa thơm                       1 chậu C7          1000                           1\nQty Total: 1`;
const shiftedRow = parser.parsePage(page(shiftedQty, 4));
assert.strictEqual(shiftedRow.status, 'ready', 'Shifted quantity position must not drop the product row');
assert(shiftedRow.products[0].sku.includes('C7'), 'SKU/size must stay in the SKU column when Qty shifts');
// Regression from the real label: SKU explicitly says 2 chậu C9 and must survive PDF column slicing.
const headerC9 = 'Product Name                                      SKU                Seller SKU                    Qty';
const skuStartC9 = headerC9.indexOf('SKU');
const sellerStartC9 = headerC9.indexOf('Seller SKU');
const c9Name = 'Nguyệt quế thái siêu hoa thơm';
const c9Sku = '2 chậu C9 cao 20-30cm';
const c9Line = c9Name.padEnd(skuStartC9) + c9Sku.padEnd(sellerStartC9-skuStartC9) + ''.padEnd(22) + '1';
const c9PdfText = `862567798295\nOrder ID: 58865144578782714\n${headerC9}\n${c9Line}\nQty Total: 1`;
const c9Parsed = parser.parsePage(page(c9PdfText, 6));
assert.strictEqual(c9Parsed.status, 'ready', JSON.stringify(c9Parsed));
assert(/C9/.test(c9Parsed.products[0].sku), `Explicit C9 was lost from parsed SKU: ${JSON.stringify(c9Parsed.products[0])}`);
assert(/2 chậu/.test(c9Parsed.products[0].sku), 'Two-pot unit count must remain in parsed SKU');
// Regression: use the alternate native extraction if it contains a complete table and the primary does not.
const alternate = parser.parsePage({page:5,text:'862570541435\nOrder ID: 586534361301026308\nProduct Name\nSeller SKU\nQty Total: 2',fallbackText:combo});
assert.strictEqual(alternate.status, 'ready', 'Alternate PDF text extraction should rescue a readable label');
assert.strictEqual(alternate.products[0].qty, 2);



assert.strictEqual(parser.stripProductDescription('Cây Trầu Bà Thanh Xuân Philodendron Ánh Sáng Gián Tiếp Tán Xòe Đứng Nước Độ Ẩm Cao >60'), 'Cây Trầu Bà Thanh Xuân', 'SEO/botanical description must not be used as plant identity');
assert.strictEqual(parser.stripProductDescription('Lài trà siêu hoa thơm nở quanh 1 chậu c năm'), 'Lài trà siêu hoa thơm', 'Marketing description must be trimmed from plant name');

// Regression from the user's J&T TikTok label: one physical order has two product rows,
// the second product has long SEO text wrapped over multiple lines, and a following PDF page
// contains only the same Order ID + Qty Total. It must remain one label with two products.
const twoHeader = 'Product Name                                      SKU                Seller SKU                    Qty';
const twoSkuStart = twoHeader.indexOf('SKU');
const twoSellerStart = twoHeader.indexOf('Seller SKU');
const alignedRow = (name, sku, seller, qty) => name.padEnd(twoSkuStart).slice(0,twoSkuStart)
  + sku.padEnd(twoSellerStart-twoSkuStart).slice(0,twoSellerStart-twoSkuStart)
  + seller.padEnd(24).slice(0,24) + String(qty).padStart(8);
const twoProductPage = `862542794508\nOrder ID: 586634608115811400\n${twoHeader}\n`
  + alignedRow('Combo 4 chậu cẩm tú mai C9','Mặc định','',1) + '\n'
  + alignedRow('Cây Trầu Bà Thanh Xuân Philodendron bipinnatifidum','1 Cây Thanh Xuân C9','',1) + '\n'
  + 'Ánh Sáng Gián Tiếp Tán Xòe Đứng Nước Độ Ẩm Cao >60\nQty Total: 2';
const splitProducts = parser.parsePage(page(twoProductPage, 3));
assert.strictEqual(splitProducts.products.length, 2, 'A label with two plant types must remain two product rows');
assert(/cẩm tú mai/i.test(splitProducts.products[0].productName));
assert(/trầu bà thanh xuân/i.test(splitProducts.products[1].productName));
const mergedContinuation = parser.parsePages([
  page(twoProductPage, 3),
  page('Order ID: 586634608115811400\nQty Total: 2\nTikTok Shop', 4)
]);
assert.strictEqual(mergedContinuation.length, 1, 'A continuation PDF page must not become a second shipment');
assert.strictEqual(mergedContinuation[0].products.length, 2);
assert.strictEqual(mergedContinuation[0].trackingNo, '862542794508');

console.log('TIKTOK LABEL PARSER TEST PASS');
